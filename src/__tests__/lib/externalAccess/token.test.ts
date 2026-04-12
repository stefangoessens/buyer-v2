import { describe, it, expect } from "vitest";
import {
  computeExpiry,
  constantTimeEqual,
  generateToken,
  hashToken,
  isDenialReason,
  validateToken,
  type TokenRecord,
} from "@/lib/externalAccess/token";
import { EXTERNAL_ACCESS_ACTIONS } from "@/lib/externalAccess/types";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function futureIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function pastIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function recordFixture(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    hashedToken: "abc123",
    dealRoomId: "dr_1",
    role: "listing_agent",
    allowedActions: ["view_offer", "submit_response"],
    expiresAt: futureIso(24),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Token generation
// ───────────────────────────────────────────────────────────────────────────

describe("generateToken", () => {
  it("produces a prefixed string", () => {
    const token = generateToken();
    expect(token).toMatch(/^eat_/);
  });

  it("produces high-entropy unique values", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    // All 100 tokens should be unique
    expect(tokens.size).toBe(100);
  });

  it("produces URL-safe base64 (no +, /, =)", () => {
    const token = generateToken();
    const body = token.replace(/^eat_/, "");
    expect(body).not.toContain("+");
    expect(body).not.toContain("/");
    expect(body).not.toContain("=");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Hashing
// ───────────────────────────────────────────────────────────────────────────

describe("hashToken", () => {
  it("returns a 64-char hex string (SHA-256)", async () => {
    const hash = await hashToken("test-input");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const a = await hashToken("same-input");
    const b = await hashToken("same-input");
    expect(a).toBe(b);
  });

  it("differs for different inputs", async () => {
    const a = await hashToken("input-a");
    const b = await hashToken("input-b");
    expect(a).not.toBe(b);
  });

  it("never returns the plaintext", async () => {
    const input = "my-secret-token";
    const hash = await hashToken(input);
    expect(hash).not.toContain(input);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constant-time comparison
// ───────────────────────────────────────────────────────────────────────────

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("returns false when only the first char differs (timing-safe path)", () => {
    expect(constantTimeEqual("xbc", "abc")).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Token validation — the core decision function
// ───────────────────────────────────────────────────────────────────────────

describe("validateToken — valid access", () => {
  it("grants access when all checks pass", () => {
    const record = recordFixture();
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "view_offer",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(true);
    if (result.granted) {
      expect(result.dealRoomId).toBe("dr_1");
      expect(result.role).toBe("listing_agent");
      expect(result.allowedActions).toContain("view_offer");
    }
  });

  it("grants access for a submit_response when on the allowlist", () => {
    const record = recordFixture({
      allowedActions: ["view_offer", "submit_response"],
    });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "submit_response",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(true);
  });
});

describe("validateToken — expired access", () => {
  it("denies access when token is expired", () => {
    const record = recordFixture({ expiresAt: pastIso(1) });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "view_offer",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(false);
    if (!result.granted) {
      expect(result.reason).toBe("expired");
    }
  });

  it("denies access at the exact expiry boundary", () => {
    const now = new Date().toISOString();
    const record = recordFixture({ expiresAt: now });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "view_offer",
      now,
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("expired");
  });
});

describe("validateToken — denied access", () => {
  it("denies with not_found when record is null", () => {
    const result = validateToken({
      record: null,
      presentedHash: "anything",
      intendedAction: "view_offer",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("not_found");
  });

  it("denies with not_found when presented hash doesn't match stored hash", () => {
    const record = recordFixture({ hashedToken: "real-hash" });
    const result = validateToken({
      record,
      presentedHash: "wrong-hash",
      intendedAction: "view_offer",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("not_found");
  });

  it("denies with revoked when revokedAt is set", () => {
    const record = recordFixture({
      revokedAt: pastIso(1),
    });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "view_offer",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("revoked");
  });

  it("denies with action_not_allowed when action is off the allowlist", () => {
    const record = recordFixture({
      allowedActions: ["view_offer"],
    });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "submit_response",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("action_not_allowed");
  });

  it("checks revoked before expired (order matters for audit clarity)", () => {
    const record = recordFixture({
      revokedAt: pastIso(5),
      expiresAt: pastIso(1),
    });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "view_offer",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("revoked");
  });
});

describe("validateToken — submission paths", () => {
  it("grants submit_response when on allowlist", () => {
    const record = recordFixture({
      allowedActions: ["submit_response"],
    });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "submit_response",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(true);
  });

  it("grants confirm_compensation when on allowlist", () => {
    const record = recordFixture({
      allowedActions: ["confirm_compensation"],
    });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "confirm_compensation",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(true);
  });

  it("grants acknowledge_receipt when on allowlist", () => {
    const record = recordFixture({
      allowedActions: ["acknowledge_receipt"],
    });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "acknowledge_receipt",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(true);
  });

  it("denies submit_response when only view_offer is allowed", () => {
    const record = recordFixture({ allowedActions: ["view_offer"] });
    const result = validateToken({
      record,
      presentedHash: record.hashedToken,
      intendedAction: "submit_response",
      now: new Date().toISOString(),
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("action_not_allowed");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Misc helpers
// ───────────────────────────────────────────────────────────────────────────

describe("computeExpiry", () => {
  it("adds hours correctly", () => {
    const now = new Date("2026-04-12T12:00:00.000Z");
    const expiry = computeExpiry(24, now);
    expect(expiry).toBe("2026-04-13T12:00:00.000Z");
  });

  it("handles fractional hours", () => {
    const now = new Date("2026-04-12T12:00:00.000Z");
    const expiry = computeExpiry(0.5, now);
    expect(expiry).toBe("2026-04-12T12:30:00.000Z");
  });
});

describe("isDenialReason", () => {
  it("recognizes all valid reasons", () => {
    expect(isDenialReason("not_found")).toBe(true);
    expect(isDenialReason("expired")).toBe(true);
    expect(isDenialReason("revoked")).toBe(true);
    expect(isDenialReason("action_not_allowed")).toBe(true);
    expect(isDenialReason("scope_mismatch")).toBe(true);
  });

  it("rejects unknown reasons", () => {
    expect(isDenialReason("nope")).toBe(false);
    expect(isDenialReason("")).toBe(false);
  });
});

describe("EXTERNAL_ACCESS_ACTIONS constant", () => {
  it("lists exactly the four allowed actions", () => {
    expect(EXTERNAL_ACCESS_ACTIONS).toHaveLength(4);
    expect(EXTERNAL_ACCESS_ACTIONS).toContain("view_offer");
    expect(EXTERNAL_ACCESS_ACTIONS).toContain("submit_response");
    expect(EXTERNAL_ACCESS_ACTIONS).toContain("confirm_compensation");
    expect(EXTERNAL_ACCESS_ACTIONS).toContain("acknowledge_receipt");
  });
});
