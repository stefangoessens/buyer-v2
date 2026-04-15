import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BROKERAGE_EMAIL_SETTINGS } from "@/lib/email/renderTemplate";
import { resendEmailRailAdapter, __setResendClientFactoryForTests } from "../../../../convex/notifications/providerAdapters/resend";

const settings = {
  ...DEFAULT_BROKERAGE_EMAIL_SETTINGS,
  unsubscribeUrl: "https://buyer-v2.app/dashboard/profile#notifications",
};

describe("resendEmailRailAdapter", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test_123";
  });

  afterEach(() => {
    __setResendClientFactoryForTests(null);
    vi.restoreAllMocks();
  });

  it("sends templated email with unsubscribe and template tags", async () => {
    const sendMock = vi.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
    });

    __setResendClientFactoryForTests(
      () =>
        ({
          emails: { send: sendMock },
          webhooks: { verify: vi.fn() },
        }) as never,
    );

    const result = await resendEmailRailAdapter.send({
      channel: "email",
      audience: "relationship",
      from: "broker@buyer-v2.app",
      fromName: "Buyer V2 Brokerage",
      to: ["alex@example.com"],
      tags: { state: "ga" },
      idempotencyKey: "waitlist-1",
      content: {
        kind: "template",
        templateKey: "waitlist-welcome",
        templateVariables: {
          buyerFirstName: "Alex",
          stateName: "Georgia",
          learnMoreUrl: "https://buyer-v2.app/waitlist",
          settings,
        },
      },
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Buyer V2 Brokerage <broker@buyer-v2.app>",
        to: ["alex@example.com"],
        subject: "You're on the buyer-v2 waitlist for Georgia",
        headers: {
          "List-Unsubscribe":
            "<https://buyer-v2.app/dashboard/profile#notifications>",
        },
        tags: expect.arrayContaining([
          { name: "stream", value: "relationship" },
          { name: "templateKey", value: "waitlist-welcome" },
          { name: "state", value: "ga" },
        ]),
      }),
      { idempotencyKey: "waitlist-1" },
    );
    expect(result.providerMessageId).toBe("email_123");
    expect(result.renderedHtml).toContain("Georgia");
  });

  it("normalizes clicked webhook payloads", () => {
    const event = resendEmailRailAdapter.ingestWebhookEvent(
      {
        type: "email.clicked",
        created_at: "2026-04-15T15:00:00.000Z",
        data: {
          email_id: "email_456",
          created_at: "2026-04-15T14:59:00.000Z",
          from: "broker@buyer-v2.app",
          to: ["alex@example.com"],
          subject: "Waitlist update",
          tags: { eventId: "buyer_event_1", templateKey: "waitlist-welcome" },
          click: {
            ipAddress: "127.0.0.1",
            link: "https://buyer-v2.app/waitlist?ref=test",
            timestamp: "2026-04-15T15:00:00.000Z",
            userAgent: "vitest",
          },
        },
      },
      { providerEventId: "svix_msg_1" },
    );

    expect(event.provider).toBe("resend");
    expect(event.providerEventId).toBe("svix_msg_1");
    expect(event.providerMessageId).toBe("email_456");
    expect(event.type).toBe("clicked");
    expect(event.clickedLink).toBe("https://buyer-v2.app/waitlist?ref=test");
    expect(event.tags.templateKey).toBe("waitlist-welcome");
  });
});
