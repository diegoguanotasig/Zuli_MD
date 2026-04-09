# Zulip Gong integration

Get notifications about Gong meetings in Zulip!

!!! tip ""
    As a note, this integration is unfortunately less extensive than the integration between Gong and
    Slack, which is built in to Gong itself. The Slack integration allows for comments to be synced
    between Gong and Slack so that new comments and replies on Gong will propagate to Slack, and replies
    on Slack also appear on Gong. However, this functionality is not present in Gong's **Automation Rules**,
    nor is it exposed in the Gong API. Gong also may send to Slack AI call summaries that are not at
    present available to Zulip.

{start_tabs}

1. {!create-an-incoming-webhook.md!}

1. {!generate-webhook-url-basic.md!}

1. In Gong, go to **Admin center**, then **Settings**, then **Ecosystem**, then **Automation rules**.

1. Select **+ Add rule**.

1. Fill out the **Create new rule** panel:
    * **Trigger**: **New call** will be selected by default; leave it
    * Optionally, click the pencil icon to configure a filter for what Gong calls will trigger a Zulip post
    * **Action**: **Fire webhook** will be selected by default; leave it
    * **Enter URL**: Paste in the integration URL generated above
    * **Select authentication method**: **URL includes key** will be selected by default; leave it
    * **Name**: "Zulip integration", perhaps
    * **Description**: "Send a link and information regarding completed calls to Zulip", perhaps

1. Test the call by clicking **Test now**, and check for a green circle near the top of the screen, and a
notification for the call appearing in Zulip.

1. Enable the rule.

{end_tabs}

{!congrats.md!}

![](/static/images/integrations/gong/001.png)


### Related documentation

- [Gong's webhook rule instructions][gong-webhook-rule]

- [Filtering Gong calls][gong-call-search]

{!webhooks-url-specification.md!}

[gong-webhook-rule]: https://help.gong.io/docs/create-a-webhook-rule
[gong-call-search]: https://help.gong.io/docs/search-for-calls
