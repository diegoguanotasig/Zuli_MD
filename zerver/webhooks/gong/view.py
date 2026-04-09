# Webhooks for external integrations.

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.http import HttpRequest, HttpResponse

from zerver.decorator import webhook_view
from zerver.lib.exceptions import AnomalousWebhookPayloadError
from zerver.lib.response import json_success
from zerver.lib.typed_endpoint import JsonBodyPayload, typed_endpoint
from zerver.lib.validator import (
    WildValue,
    check_bool,
    check_int,
    check_iso_datetime,
    check_string,
    check_url,
)
from zerver.lib.webhooks.common import check_send_webhook_message
from zerver.models import UserProfile

GONG_TOPIC_TEMPLATE = "Gong Call: {call_title}"
GONG_MESSAGE_TEMPLATE = """\
:phone: New Gong call **[{call_title}]({call_url})**! :phone:

**Call time:** <time:{starttime_isostring}> to <time:{endtime_isostring}> ({formatted_duration})
**Scheduled time**: <time:{scheduled_isostring}>
**Participants**:
{participants}
"""


@dataclass
class GongData:
    call_url: str
    call_title: str
    scheduled: datetime
    started: datetime
    duration: int
    participants: str


def duration_pretty(duration: int) -> str:
    (hours, rest) = divmod(duration, 3600)
    (minutes, _) = divmod(rest, 60)
    hour_word = "hour" if hours == 1 else "hours"
    minute_word = "minute" if minutes == 1 else "minutes"
    if hours > 0:
        return f"{hours} {hour_word} {minutes} {minute_word}"
    return f"{minutes} {minute_word}"


def parse_payload(gong_payload: WildValue) -> GongData:
    return GongData(
        call_url=gong_payload["metaData"]["url"].tame(check_url),
        call_title=gong_payload["metaData"]["title"].tame(check_string),
        scheduled=gong_payload["metaData"]["scheduled"].tame(check_iso_datetime),
        started=gong_payload["metaData"]["started"].tame(check_iso_datetime),
        duration=gong_payload["metaData"]["duration"].tame(check_int),
        participants="\n".join(
            f"* {party['name'].tame(check_string)}: "
            f"{party['title'].tame(check_string)} "
            f"({party['emailAddress'].tame(check_string)})"
            for party in gong_payload["parties"]
        ),
    )


def create_topic(data: GongData) -> str:
    return GONG_TOPIC_TEMPLATE.format(call_title=data.call_title)


def create_body(data: GongData) -> str:
    return GONG_MESSAGE_TEMPLATE.format(
        call_title=data.call_title,
        call_url=data.call_url,
        scheduled_isostring=data.scheduled.isoformat(),
        starttime_isostring=data.started.isoformat(),
        endtime_isostring=(data.started + timedelta(seconds=data.duration)).isoformat(),
        formatted_duration=duration_pretty(data.duration),
        participants=data.participants,
    )


@webhook_view("Gong")
@typed_endpoint
def api_gong_webhook(
    request: HttpRequest,
    user_profile: UserProfile,
    *,
    payload: JsonBodyPayload[WildValue],
) -> HttpResponse:
    if "isTest" not in payload:
        raise AnomalousWebhookPayloadError
    elif payload["isTest"].tame(check_bool):
        topic = "Gong call test"
        body = ":phone: Gong webhook test received! :phone:"
    elif "callData" in payload:
        data = parse_payload(payload["callData"])
        topic = create_topic(data)
        body = create_body(data)
    else:
        raise AnomalousWebhookPayloadError
    check_send_webhook_message(request, user_profile, topic, body)
    return json_success(request)
