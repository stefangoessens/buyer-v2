import { describe, expect, it } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/notifications/unsubscribeToken";

const secret = "test-secret";

describe("unsubscribeToken", () => {
  it("signs and verifies a valid token", async () => {
    const token = await signUnsubscribeToken({
      userId: "user_123",
      category: "market_updates",
      channel: "email",
      secret,
      now: new Date("2026-04-15T12:00:00.000Z"),
      ttlSeconds: 60,
      jti: "token-1",
    });

    const payload = await verifyUnsubscribeToken({
      token,
      secret,
      now: new Date("2026-04-15T12:00:30.000Z"),
    });

    expect(payload.userId).toBe("user_123");
    expect(payload.category).toBe("market_updates");
    expect(payload.channel).toBe("email");
    expect(payload.jti).toBe("token-1");
  });

  it("aliases legacy updates into market_updates", async () => {
    const token = await signUnsubscribeToken({
      userId: "user_123",
      category: "updates",
      channel: "email",
      secret,
      now: new Date("2026-04-15T12:00:00.000Z"),
      ttlSeconds: 60,
    });

    const payload = await verifyUnsubscribeToken({
      token,
      secret,
      now: new Date("2026-04-15T12:00:30.000Z"),
    });

    expect(payload.category).toBe("market_updates");
  });

  it("rejects expired tokens", async () => {
    const token = await signUnsubscribeToken({
      userId: "user_123",
      category: "marketing",
      channel: "email",
      secret,
      now: new Date("2026-04-15T12:00:00.000Z"),
      ttlSeconds: 60,
    });

    await expect(
      verifyUnsubscribeToken({
        token,
        secret,
        now: new Date("2026-04-15T12:02:00.000Z"),
      }),
    ).rejects.toThrow(/Expired/);
  });

  it("rejects tampered tokens", async () => {
    const token = await signUnsubscribeToken({
      userId: "user_123",
      category: "marketing",
      channel: "email",
      secret,
    });

    await expect(
      verifyUnsubscribeToken({
        token: `${token}tampered`,
        secret,
      }),
    ).rejects.toThrow(/Invalid unsubscribe token signature/);
  });
});
