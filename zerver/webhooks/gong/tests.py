from zerver.lib.test_classes import WebhookTestCase


class GongHookTests(WebhookTestCase):
    def test_gong_normal_call_payload(self) -> None:
        expected_topic = "Gong Call: Ron/Speedman"
        expected_message = """\
:phone: New Gong call **[Ron/Speedman](http://local.gong-it.net:8080/call?id=5599332235511222771)**! :phone:

**Call time:** <time:2019-10-18T14:03:37.041977-07:00> to <time:2019-10-18T14:39:36.041977-07:00> (35 minutes)
**Scheduled time**: <time:2019-10-18T14:00:00-07:00>
**Participants**:
* Deshon White: Sales Enablement Manager - Sales Development (deshon.white@acme.com)
* Jennifer Band: Customer Success Manager (jennifer.band@fasttrail.com)"""

        self.check_webhook(
            "gong_payload",
            expected_topic,
            expected_message,
            content_type="application/json",
        )

    def test_gong_test_call_payload(self) -> None:
        expected_topic = "Gong call test"
        expected_message = ":phone: Gong webhook test received! :phone:"

        self.check_webhook(
            "gong_test_payload",
            expected_topic,
            expected_message,
            content_type="application/json",
        )
