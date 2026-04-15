import { beforeEach, describe, expect, it, vi } from "vitest";

const convexMocks = vi.hoisted(() => ({
  action: vi.fn(),
}));
const analyticsMocks = vi.hoisted(() => ({
  trackServerEvent: vi.fn(),
}));
const twilioMocks = vi.hoisted(() => ({
  readTwilioRuntimeConfig: vi.fn(),
  validateTwilioWebhook: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    action: convexMocks.action,
  })),
}));

vi.mock("@/lib/analytics.server", () => ({
  trackServerEvent: analyticsMocks.trackServerEvent,
}));

vi.mock("../../../convex/notifications/providerAdapters/twilio", async () => {
  const actual =
    await vi.importActual<
      typeof import("../../../convex/notifications/providerAdapters/twilio")
    >("../../../convex/notifications/providerAdapters/twilio");
  return {
    ...actual,
    readTwilioRuntimeConfig: twilioMocks.readTwilioRuntimeConfig,
    validateTwilioWebhook: twilioMocks.validateTwilioWebhook,
  };
});

import { POST as inboundPOST } from "@/app/api/webhooks/twilio/inbound/route";
import { POST as statusPOST } from "@/app/api/webhooks/twilio/status/route";

function buildRequest(
  url: string,
  params: Record<string, string>,
  signature = "test-signature",
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams(params),
  });
}

describe("Twilio webhook routes", () => {
  beforeEach(() => {
    convexMocks.action.mockReset();
    analyticsMocks.trackServerEvent.mockReset();
    twilioMocks.readTwilioRuntimeConfig.mockReset();
    twilioMocks.validateTwilioWebhook.mockReset();

    twilioMocks.readTwilioRuntimeConfig.mockReturnValue({
      accountSid: "AC123",
      authToken: "test-token",
      verifyServiceSid: "VA123",
      transactionalMessagingServiceSid: "MG-TX",
      relationshipMessagingServiceSid: "MG-RL",
      fromNumber: "+13055550123",
    });
    twilioMocks.validateTwilioWebhook.mockReturnValue(true);
    analyticsMocks.trackServerEvent.mockResolvedValue(true);
  });

  it("rejects inbound webhook requests with an invalid Twilio signature", async () => {
    twilioMocks.validateTwilioWebhook.mockReturnValue(false);

    const response = await inboundPOST(
      buildRequest("http://localhost:3000/api/webhooks/twilio/inbound", {
        MessageSid: "SM123",
        From: "+13055550111",
        To: "+13055550123",
        Body: "https://www.zillow.com/homedetails/Test/123456_zpid/",
      }),
    );

    expect(response.status).toBe(403);
    expect(convexMocks.action).not.toHaveBeenCalled();
  });

  it("handles inbound listing texts and emits analytics for created deal rooms", async () => {
    convexMocks.action.mockResolvedValue({
      messageId: "msg_123",
      recipientHash: "hash_123",
      status: "completed",
      providerState: "received",
      replyBody: "Got it! Your analysis is ready: http://localhost:3000/dealroom/dr_123",
      replySent: true,
      portal: "zillow",
      dealRoomId: "dr_123",
      createdDealRoomId: "dr_123",
      propertyId: "prop_123",
    });

    const response = await inboundPOST(
      buildRequest("http://localhost:3000/api/webhooks/twilio/inbound", {
        MessageSid: "SM123",
        From: "+13055550111",
        To: "+13055550123",
        Body: "https://www.zillow.com/homedetails/Test/123456_zpid/",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      "Got it! Your analysis is ready: http://localhost:3000/dealroom/dr_123",
    );
    expect(convexMocks.action).toHaveBeenCalledTimes(1);
    expect(convexMocks.action.mock.calls[0]?.[1]).toEqual({
      messageSid: "SM123",
      fromPhone: "+13055550111",
      toPhone: "+13055550123",
      body: "https://www.zillow.com/homedetails/Test/123456_zpid/",
      sharedSecret: "test-token",
    });
    expect(analyticsMocks.trackServerEvent.mock.calls).toEqual([
      [
        "sms_inbound_received",
        { messageId: "msg_123", recipientHash: "hash_123" },
      ],
      [
        "sms_inbound_parsed",
        {
          messageId: "msg_123",
          recipientHash: "hash_123",
          portal: "zillow",
        },
      ],
      [
        "sms_inbound_dealroom_created",
        {
          messageId: "msg_123",
          recipientHash: "hash_123",
          dealRoomId: "dr_123",
        },
      ],
    ]);
  });

  it("handles Twilio delivery status callbacks", async () => {
    convexMocks.action.mockResolvedValue({ handled: true });

    const response = await statusPOST(
      buildRequest("http://localhost:3000/api/webhooks/twilio/status", {
        MessageSid: "SM123",
        MessageStatus: "delivered",
        ErrorCode: "",
        ErrorMessage: "",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      handled: true,
    });
    expect(convexMocks.action).toHaveBeenCalledTimes(1);
    expect(convexMocks.action.mock.calls[0]?.[1]).toEqual({
      messageSid: "SM123",
      messageStatus: "delivered",
      sharedSecret: "test-token",
    });
  });
});
