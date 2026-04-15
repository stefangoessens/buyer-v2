import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";

const mailRailMocks = vi.hoisted(() => ({
  selectDriver: vi.fn(),
}));

vi.mock("../../../convex/mailRail", () => ({
  selectDriver: mailRailMocks.selectDriver,
}));

import {
  WELCOME_EMAIL_TEMPLATE_KEY,
  composeWelcomeEmail,
  sendWelcomeEmailForNewBuyerAccount,
} from "../../../convex/lib/welcomeMail";

type UserRow = {
  _id: Id<"users">;
  email: string;
  name: string;
  role: "buyer" | "broker" | "admin";
  welcomeEmailQueuedAt?: string;
  welcomeEmailProviderMessageId?: string;
  welcomeEmailTemplateKey?: string;
};

type TestContext = {
  db: {
    get: (id: Id<"users">) => Promise<UserRow | null>;
    patch: (
      id: Id<"users">,
      value: Record<string, unknown>,
    ) => Promise<void>;
  };
};

function userId(value: string): Id<"users"> {
  return value as Id<"users">;
}

function createContext(initialUser: UserRow | null) {
  let user = initialUser ? { ...initialUser } : null;
  const patchCalls: Array<Record<string, unknown>> = [];

  const ctx: TestContext = {
    db: {
      async get(id: Id<"users">) {
        if (!user || user._id !== id) return null;
        return { ...user };
      },
      async patch(id: Id<"users">, value: Record<string, unknown>) {
        if (!user || user._id !== id) {
          throw new Error(`Missing row for ${id}`);
        }
        patchCalls.push({ ...value });
        user = { ...user, ...value };
      },
    },
  };

  return {
    ctx,
    getUser: () => user,
    patchCalls,
  };
}

beforeEach(() => {
  mailRailMocks.selectDriver.mockReset();
});

describe("composeWelcomeEmail", () => {
  it("stays rebate-forward but conditional and gives concrete next steps", () => {
    const message = composeWelcomeEmail({
      buyerName: "Jordan",
      to: "jordan@example.com",
    });

    expect(message.subject).toBe("Welcome to buyer-v2");
    expect(message.to).toBe("jordan@example.com");
    expect(message.bodyText).toContain(
      "Paste a Zillow, Redfin, or Realtor.com link",
    );
    expect(message.bodyText).toContain("Complete your profile");
    expect(message.bodyText).toContain("Schedule a tour");
    expect(message.bodyText).toContain("buyer-side credit");
    expect(message.bodyText).toContain("reply with the link");
    expect(message.bodyText).not.toContain("2%");
    expect(message.bodyText).not.toContain("$15k");
  });
});

describe("sendWelcomeEmailForNewBuyerAccount", () => {
  it("queues the welcome email once for a brand-new buyer account", async () => {
    const { ctx, getUser, patchCalls } = createContext({
      _id: userId("user_1"),
      email: "buyer@example.com",
      name: "Jordan Buyer",
      role: "buyer",
    });
    const send = vi.fn().mockResolvedValue({ providerMessageId: "noop-123" });

    mailRailMocks.selectDriver.mockReturnValue({
      name: "noop",
      send,
    });

    const outcome = await sendWelcomeEmailForNewBuyerAccount(ctx, {
      userId: userId("user_1"),
      existingUserId: null,
      type: "credentials",
    });

    expect(outcome).toEqual({
      queued: true,
      providerMessageId: "noop-123",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      to: "buyer@example.com",
      from: "hello@buyer-v2.com",
      fromName: "buyer-v2 Brokerage",
      replyTo: "hello@buyer-v2.com",
      subject: "Welcome to buyer-v2",
      metadata: {
        feature: "kin-1096-welcome-email",
        templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
        userId: "user_1",
        authType: "credentials",
      },
    });
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]).toMatchObject({
      welcomeEmailQueuedAt: expect.any(String),
      welcomeEmailProviderMessageId: "noop-123",
      welcomeEmailTemplateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    });
    expect(getUser()).toMatchObject({
      welcomeEmailQueuedAt: expect.any(String),
      welcomeEmailProviderMessageId: "noop-123",
      welcomeEmailTemplateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    });
  });

  it("does not send again on later auth refreshes or existing markers", async () => {
    const { ctx } = createContext({
      _id: userId("user_1"),
      email: "buyer@example.com",
      name: "Jordan Buyer",
      role: "buyer",
      welcomeEmailTemplateKey: WELCOME_EMAIL_TEMPLATE_KEY,
      welcomeEmailQueuedAt: "2026-04-15T00:00:00.000Z",
      welcomeEmailProviderMessageId: "noop-123",
    });
    const send = vi.fn().mockResolvedValue({ providerMessageId: "noop-456" });

    mailRailMocks.selectDriver.mockReturnValue({
      name: "noop",
      send,
    });

    const markerOutcome = await sendWelcomeEmailForNewBuyerAccount(ctx, {
      userId: userId("user_1"),
      existingUserId: null,
      type: "verification",
    });

    expect(markerOutcome).toEqual({
      queued: false,
      reason: "already_handled",
    });
    expect(send).not.toHaveBeenCalled();

    const outcome = await sendWelcomeEmailForNewBuyerAccount(ctx, {
      userId: userId("user_1"),
      existingUserId: userId("user_1"),
      type: "oauth",
    });

    expect(outcome).toEqual({
      queued: false,
      reason: "existing_account",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips non-buyer accounts", async () => {
    const { ctx } = createContext({
      _id: userId("user_2"),
      email: "broker@example.com",
      name: "Broker",
      role: "broker",
    });
    const send = vi.fn();

    mailRailMocks.selectDriver.mockReturnValue({
      name: "noop",
      send,
    });

    const outcome = await sendWelcomeEmailForNewBuyerAccount(ctx, {
      userId: userId("user_2"),
      existingUserId: null,
      type: "credentials",
    });

    expect(outcome).toEqual({
      queued: false,
      reason: "not_buyer",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves no durable marker behind when delivery fails", async () => {
    const { ctx, getUser, patchCalls } = createContext({
      _id: userId("user_3"),
      email: "buyer@example.com",
      name: "Jordan Buyer",
      role: "buyer",
    });
    const send = vi.fn().mockRejectedValue(new Error("smtp unavailable"));

    mailRailMocks.selectDriver.mockReturnValue({
      name: "noop",
      send,
    });

    const outcome = await sendWelcomeEmailForNewBuyerAccount(ctx, {
      userId: userId("user_3"),
      existingUserId: null,
      type: "verification",
    });

    expect(outcome).toEqual({
      queued: false,
      reason: "delivery_failed",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(patchCalls).toEqual([]);
    expect(getUser()?.welcomeEmailTemplateKey).toBeUndefined();
    expect(getUser()?.welcomeEmailQueuedAt).toBeUndefined();
    expect(getUser()?.welcomeEmailProviderMessageId).toBeUndefined();
  });
});
