import $ from "jquery";
import _ from "lodash";
import assert from "minimalistic-assert";

import * as activity from "./activity.ts";
import * as blueslip from "./blueslip.ts";
import * as buddy_data from "./buddy_data.ts";
import {buddy_list} from "./buddy_list.ts";
import * as buddy_list_presence from "./buddy_list_presence.ts";
import * as keydown_util from "./keydown_util.ts";
import {ListCursor} from "./list_cursor.ts";
import * as loading from "./loading.ts";
import * as narrow_state from "./narrow_state.ts";
import * as peer_data from "./peer_data.ts";
import * as people from "./people.ts";
import * as pm_list from "./pm_list.ts";
import * as popovers from "./popovers.ts";
import * as presence from "./presence.ts";
import type {PresenceInfoFromEvent} from "./presence.ts";
import * as sidebar_ui from "./sidebar_ui.ts";
import {realm} from "./state_data.ts";
import * as ui_util from "./ui_util.ts";
import type {FullUnreadCountsData} from "./unread.ts";
import {UserSearch} from "./user_search.ts";
import * as util from "./util.ts";

export let user_cursor: ListCursor<number> | undefined;
export let user_filter: UserSearch | undefined;

// Function initialized from `ui_init` to avoid importing narrow.js and causing circular imports.
let narrow_by_user_id: (user_id: number) => void;

export function get_narrow_by_user_id_function_for_test_code(): (user_id: number) => void {
    return narrow_by_user_id;
}

function get_pm_list_item(user_id: string): JQuery | undefined {
    return buddy_list.find_li({
        key: Number.parseInt(user_id, 10),
    });
}

function set_pm_count(user_ids_string: string, count: number): void {
    const $pm_li = get_pm_list_item(user_ids_string);
    if ($pm_li !== undefined) {
        ui_util.update_unread_count_in_dom($pm_li, count);
    }
}

export function update_dom_with_unread_counts(counts: FullUnreadCountsData): void {
    // counts is just a data object that gets calculated elsewhere
    // Our job is to update some DOM elements.

    for (const [user_ids_string, count] of counts.pm_count) {
        // TODO: just use user_ids_string in our markup
        const is_pm = !user_ids_string.includes(",");
        if (is_pm) {
            set_pm_count(user_ids_string, count);
        }
    }
}

export function clear_for_testing(): void {
    user_cursor = undefined;
    user_filter = undefined;
}

export function redraw_user(user_id: number): void {
    if (realm.realm_presence_disabled) {
        return;
    }

    const filter_text = get_filter_text();

    if (!buddy_data.matches_filter(filter_text, user_id)) {
        return;
    }

    buddy_list.insert_or_move([user_id]);
    buddy_list_presence.update_indicators();
}

export function rerender_user_sidebar_participants(): void {
    if (!narrow_state.stream_id() || narrow_state.topic() === undefined) {
        return;
    }

    buddy_list.rerender_participants();
}

export function check_should_redraw_new_user(user_id: number): boolean {
    if (realm.realm_presence_disabled) {
        return false;
    }

    const user_is_in_presence_info = presence.presence_info.has(user_id);
    const user_not_yet_known = people.maybe_get_user_by_id(user_id, true) === undefined;
    return user_is_in_presence_info && user_not_yet_known;
}

export function searching(): boolean {
    return user_filter?.searching() ?? false;
}

export let build_user_sidebar = (): number[] | undefined => {
    if (realm.realm_presence_disabled) {
        return undefined;
    }

    assert(user_filter !== undefined);
    const filter_text = user_filter.text();

    const all_user_ids = buddy_data.get_filtered_and_sorted_user_ids(filter_text);

    buddy_list.populate({all_user_ids});

    return all_user_ids; // for testing
};

export function rewire_build_user_sidebar(value: typeof build_user_sidebar): void {
    build_user_sidebar = value;
}

export function remove_loading_indicator_for_search(): void {
    loading.destroy_indicator($("#buddy-list-loading-subscribers"));
    $("#buddy_list_wrapper").show();
}

// We need to make sure we have all subscribers before displaying
// users during search, because we show all matching users and
// sort them by if they're subscribed. We store all pending fetches,
// in case we navigate away from a stream and back to it and kick
// off another search. We also store the current pending fetch so
// we know if it's still relevant once it's completed.
let pending_fetch_for_search_stream_id: number | undefined;
const all_pending_fetches_for_search = new Map<number, Promise<void>>();

export async function await_pending_promise_for_testing(): Promise<void> {
    assert(pending_fetch_for_search_stream_id !== undefined);
    await all_pending_fetches_for_search.get(pending_fetch_for_search_stream_id);
}

function do_update_users_for_search(): void {
    // Hide all the popovers but not userlist sidebar
    // when the user is searching.
    popovers.hide_all();

    const stream_id = narrow_state.stream_id(narrow_state.filter(), true);
    if (!stream_id || peer_data.has_full_subscriber_data(stream_id)) {
        pending_fetch_for_search_stream_id = undefined;
        build_user_sidebar();
        assert(user_cursor !== undefined);
        user_cursor.reset();
        return;
    }

    pending_fetch_for_search_stream_id = stream_id;

    // If we're already fetching for this stream, we don't need to wait for
    // another promise. The sidebar will be updated once that promise resolves.
    if (all_pending_fetches_for_search.has(stream_id)) {
        return;
    }

    all_pending_fetches_for_search.set(
        stream_id,
        (async () => {
            $("#buddy_list_wrapper").hide();
            loading.make_indicator($("#buddy-list-loading-subscribers"));
            await peer_data.fetch_stream_subscribers(stream_id);
            all_pending_fetches_for_search.delete(stream_id);

            // If we changed narrows during the fetch, don't rebuild the sidebar
            // anymore. Let the new narrow handle its own state. The loading indicator
            // should have already been removed on narrow change.
            if (pending_fetch_for_search_stream_id !== stream_id) {
                return;
            }
            remove_loading_indicator_for_search();
            pending_fetch_for_search_stream_id = undefined;
            build_user_sidebar();
            assert(user_cursor !== undefined);
            user_cursor.reset();
        })(),
    );
}

const update_users_for_search = _.throttle(do_update_users_for_search, 50);

export function initialize(opts: {narrow_by_user_id: (user_id: number) => void}): void {
    narrow_by_user_id = opts.narrow_by_user_id;

    set_cursor_and_filter();

    build_user_sidebar();

    buddy_list.start_scroll_handler();

    function get_full_presence_list_update(): void {
        activity.send_presence_to_server(redraw);
    }

    /* Time between keep-alive pings */
    const active_ping_interval_ms = realm.server_presence_ping_interval_seconds * 1000;
    util.call_function_periodically(get_full_presence_list_update, active_ping_interval_ms);

    // Let the server know we're here, but do not pass
    // redraw, since we just got all this info in page_params.
    activity.send_presence_to_server();
}

export function update_presence_info(info: PresenceInfoFromEvent): void {
    const presence_entry = Object.entries(info)[0];
    assert(presence_entry !== undefined);
    const [user_id_string, presence_info] = presence_entry;
    const user_id = Number.parseInt(user_id_string, 10);

    // There can be some case where the presence event
    // was set for an inaccessible user if
    // CAN_ACCESS_ALL_USERS_GROUP_LIMITS_PRESENCE is
    // disabled. We just ignore that event and return.
    const person = people.maybe_get_user_by_id(user_id, true);
    if (person === undefined || person.is_inaccessible_user) {
        return;
    }

    presence.update_info_from_event(user_id, presence_info);
    redraw_user(user_id);
    pm_list.update_private_messages();
}

export function redraw(): void {
    build_user_sidebar();
    assert(user_cursor !== undefined);
    user_cursor.redraw();
    pm_list.update_private_messages();
    buddy_list_presence.update_indicators();
}

export function reset_users(): void {
    // Call this when we're leaving the search widget.
    build_user_sidebar();
    assert(user_cursor !== undefined);
    user_cursor.clear();
}

export function narrow_for_user(opts: {$li: JQuery}): void {
    const user_id = buddy_list.get_user_id_from_li({$li: opts.$li});
    narrow_for_user_id({user_id});
}

export function narrow_for_user_id(opts: {user_id: number}): void {
    assert(narrow_by_user_id);
    narrow_by_user_id(opts.user_id);
    assert(user_filter !== undefined);
    user_filter.clear_search();
}

function keydown_enter_key(): void {
    assert(user_cursor !== undefined);
    const user_id = user_cursor.get_key();
    if (user_id === undefined) {
        return;
    }

    narrow_for_user_id({user_id});
    sidebar_ui.hide_all();
    popovers.hide_all();
}

export let set_cursor_and_filter = (): void => {
    user_cursor = new ListCursor({
        list: buddy_list,
        highlight_class: "highlighted_user",
    });

    user_filter = new UserSearch({
        update_list: update_users_for_search,
        reset_items: reset_users,
        on_focus() {
            user_cursor!.reset();
        },
        set_is_highlight_visible(value: boolean) {
            user_cursor!.set_is_highlight_visible(value);
        },
    });

    const $input = user_filter.input_field();

    $input.on("blur", () => {
        user_cursor!.clear();
    });

    keydown_util.handle({
        $elem: $input,
        handlers: {
            Enter() {
                keydown_enter_key();
                return true;
            },
            ArrowUp() {
                user_cursor!.prev();
                return true;
            },
            ArrowDown() {
                user_cursor!.next();
                return true;
            },
            Tab() {
                // If the user navigated to a row with arrows,
                // Tab should focus that row instead of the next
                // element in DOM order.
                assert(user_cursor !== undefined);
                const cursor_key = user_cursor.get_key();
                if (cursor_key !== undefined && user_cursor.is_highlight_visible) {
                    const $li = buddy_list.find_li({key: cursor_key, force_render: true})!;
                    util.the($li.find("a.user-presence-link")).focus({preventScroll: true});
                    user_cursor.clear();
                    return false;
                }
                user_cursor.clear();
                return false;
            },
        },
    });

    // Handle arrow key navigation when a buddy list element has Tab
    // focus, so that Tab and arrow key navigation stay in sync.
    $("#buddy_list_wrapper").on("keydown", (e) => {
        // Let the browser handle Tab navigation.
        if (e.key === "Tab") {
            if (user_cursor) {
                user_cursor.clear();
            }
            return;
        }
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
            return;
        }
        if (e.altKey || e.ctrlKey || e.shiftKey) {
            return;
        }

        const active_element = document.activeElement;
        if (!active_element) {
            return;
        }
        const $active_element = $(active_element);
        const $active_user_row = $active_element.closest("li.user_sidebar_entry");
        const $buddy_list_section = $active_element.closest(".buddy-list-section-container");

        assert(user_cursor !== undefined);

        if ($active_user_row.length > 0) {
            // Focused element is inside a user row; sync cursor
            // to it, then navigate to the adjacent user.
            const user_id = buddy_list.get_user_id_from_li({$li: $active_user_row});
            user_cursor.set_is_highlight_visible(true);
            user_cursor.go_to(user_id);
            if (e.key === "ArrowUp") {
                user_cursor.prev();
            } else {
                user_cursor.next();
            }
        } else if ($active_element.closest(".buddy-list-subsection-header").length > 0) {
            // Focused on a section header (e.g., section toggle).
            // Jump directly to the nearest user in the pressed direction.
            let $entry;
            if (e.key === "ArrowDown") {
                $entry = $buddy_list_section
                    .nextAll()
                    .addBack()
                    .not(".collapsed")
                    .find("li.user_sidebar_entry")
                    .first();
            } else {
                $entry = $buddy_list_section
                    .prevAll()
                    .not(".collapsed")
                    .find("li.user_sidebar_entry")
                    .last();
            }
            if ($entry.length === 0) {
                return;
            }
            const user_id = buddy_list.get_user_id_from_li({$li: $entry});
            user_cursor.set_is_highlight_visible(true);
            user_cursor.go_to(user_id);
        } else if ($active_element.closest(".view-all-subscribers-link").length > 0) {
            // "View all subscribers" is below users in the users-matching-view
            //  section. ArrowDown should highlight the first user in the next
            // section, ArrowUp should highlight the last user in this section.
            let $next_user_row;
            if (e.key === "ArrowDown") {
                $next_user_row = $buddy_list_section
                    .nextAll()
                    .not(".collapsed")
                    .find("li.user_sidebar_entry")
                    .first();
            } else {
                $next_user_row = $buddy_list_section
                    .prevAll()
                    .addBack()
                    .not(".collapsed")
                    .find("li.user_sidebar_entry")
                    .last();
            }
            if ($next_user_row.length === 0) {
                return;
            }
            const user_id = buddy_list.get_user_id_from_li({$li: $next_user_row});
            user_cursor.set_is_highlight_visible(true);
            user_cursor.go_to(user_id);
        } else if (
            $active_element.closest(".view-all-users-link").length > 0 ||
            $active_element.closest(".invite-user-shortcut").length > 0
        ) {
            // "View all users" and "Invite to organization" are at
            // the bottom of the buddy list; nothing below them.
            if (e.key === "ArrowDown") {
                return;
            }
            const $last_user_row = $(
                "#buddy_list_wrapper .buddy-list-section-container:not(.collapsed) li.user_sidebar_entry",
            ).last();
            if ($last_user_row.length === 0) {
                return;
            }
            const user_id = buddy_list.get_user_id_from_li({$li: $last_user_row});
            user_cursor.set_is_highlight_visible(true);
            user_cursor.go_to(user_id);
        } else {
            blueslip.error("Unexpected focused element in buddy list", {
                element: active_element.nodeName,
                class: active_element.className,
            });
            return;
        }

        // Move focus to the newly selected user row.
        const new_user_id = user_cursor.get_key();
        assert(new_user_id !== undefined);
        const $li = buddy_list.find_li({key: new_user_id, force_render: true});
        assert($li !== undefined && $li.length > 0);
        util.the($li.find("a.user-presence-link")).focus({preventScroll: true});
        // Prevent default and propagation now that we know a change was made.
        e.preventDefault();
        e.stopPropagation();
    });
};

export function rewire_set_cursor_and_filter(value: typeof set_cursor_and_filter): void {
    set_cursor_and_filter = value;
}

export function initiate_search(): void {
    if (user_filter) {
        $("body").removeClass("hide-right-sidebar");
        popovers.hide_all();
        user_filter.initiate_search();
    }
}

export function clear_search(): void {
    if (user_filter) {
        user_filter.clear_search();
        remove_loading_indicator_for_search();
    }
}

export function get_filter_text(): string {
    if (!user_filter) {
        // This may be overly defensive, but there may be
        // situations where get called before everything is
        // fully initialized.  The empty string is a fine
        // default here.
        blueslip.warn("get_filter_text() is called before initialization");
        return "";
    }

    return user_filter.text();
}
