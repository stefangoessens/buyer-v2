import { describe, expect, it } from "vitest";
import {
  buildTwimlMessageResponse,
  computeTwilioWebhookSignature,
  parseTwilioInboundSms,
  validateTwilioWebhookSignature,
} from "../../../convex/lib/twilioSmsWebhook";

function createInboundFormData(overrides?: Record<string, string>) {
  const formData = new FormData();
  formData.set("MessageSid", "SM123");
  formData.set("From", "+13055551234");
  formData.set("To", "+14155550000");
  formData.set("Body", "Check this out");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.set(key, value);
  }

  return formData;
}

describe("convex/lib/twilioSmsWebhook", () => {
  it("parses the Twilio SMS payload into the internal handler shape", () => {
    const result = parseTwilioInboundSms(createInboundFormData());

    expect(result).toEqual({
      ok: true,
      payload: {
        messageSid: "SM123",
        fromPhone: "+13055551234",
        toPhone: "+14155550000",
        body: "Check this out",
      },
    });
  });

  it("allows an empty body when Twilio posts a blank message", () => {
    const formData = createInboundFormData();
    formData.delete("Body");

    const result = parseTwilioInboundSms(formData);

    expect(result).toEqual({
      ok: true,
      payload: {
        messageSid: "SM123",
        fromPhone: "+13055551234",
        toPhone: "+14155550000",
        body: "",
      },
    });
  });

  it("rejects missing required Twilio fields", () => {
    const formData = createInboundFormData();
    formData.delete("MessageSid");

    expect(parseTwilioInboundSms(formData)).toEqual({
      ok: false,
      error: "Missing required Twilio field: MessageSid",
    });
  });

  it("validates a Twilio webhook signature against the exact request URL", async () => {
    const formData = createInboundFormData({
      NumMedia: "0",
      SmsStatus: "received",
    });
    const requestUrl =
      "https://buyer-v2.example.com/webhooks/twilio/sms?channel=primary";
    const authToken = "twilio-auth-token";
    const signature = await computeTwilioWebhookSignature({
      authToken,
      requestUrl,
      formData,
    });

    await expect(
      validateTwilioWebhookSignature({
        authToken,
        requestUrl,
        formData,
        signature,
      }),
    ).resolves.toBe(true);

    await expect(
      validateTwilioWebhookSignature({
        authToken,
        requestUrl: "https://buyer-v2.example.com/webhooks/twilio/sms",
        formData,
        signature,
      }),
    ).resolves.toBe(false);
  });

  it("builds escaped TwiML for reply messages and an empty response when suppressed", () => {
    expect(buildTwimlMessageResponse("Deal room <ready> & waiting")).toBe(
      "<Response><Message>Deal room &lt;ready&gt; &amp; waiting</Message></Response>",
    );
    expect(buildTwimlMessageResponse()).toBe("<Response></Response>");
  });
});
