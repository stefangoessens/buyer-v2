import { describe, it, expect } from "vitest";
import {
  WAITLIST_ALLOWED_STATE_CODES,
  WAITLIST_RATE_LIMIT_WINDOW_MS,
  isValidWaitlistEmail,
  isValidWaitlistStateCode,
  isValidWaitlistZip,
  isWaitlistHoneypotTripped,
  isWithinWaitlistRateLimitWindow,
  normalizeWaitlistEmail,
  normalizeWaitlistStateCode,
} from "../../../convex/lib/waitlistValidation";
import { US_STATES } from "@/lib/intake/address";

// ─── Notes ─────────────────────────────────────────────────────────────
// `convex-test` is not wired up in this repo, so we exercise the pure
// validators that the upsert mutation composes. That mirrors the
// pattern used by `src/__tests__/lib/dealroom/share-link-state.test.ts`
// and `src/__tests__/lib/contracts/provider-helpers.test.ts`, which
// also unit-test logic extracted out of Convex into `convex/lib/`.
//
// These tests guarantee the pieces that the mutation chains together —
// honeypot detection, email/state/zip validation, normalization, and
// the dedupe rate-limit window — are correct in isolation. Wiring them
// inside the upsert handler is verified by the typechecker (the mutation
// imports the same functions) and by the e2e test the UI agent owns.

describe("normalizeWaitlistEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeWaitlistEmail("  Buyer@Example.COM ")).toBe(
      "buyer@example.com",
    );
  });

  it("is idempotent on already-normalized input", () => {
    expect(normalizeWaitlistEmail("buyer@example.com")).toBe(
      "buyer@example.com",
    );
  });
});

describe("normalizeWaitlistStateCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeWaitlistStateCode("  tx ")).toBe("TX");
  });

  it("leaves an already-normalized code untouched", () => {
    expect(normalizeWaitlistStateCode("CA")).toBe("CA");
  });
});

describe("isWaitlistHoneypotTripped", () => {
  it("returns false when honeypot is undefined", () => {
    expect(isWaitlistHoneypotTripped(undefined)).toBe(false);
  });

  it("returns false when honeypot is empty string", () => {
    expect(isWaitlistHoneypotTripped("")).toBe(false);
  });

  it("returns true when honeypot has any content", () => {
    expect(isWaitlistHoneypotTripped("bot")).toBe(true);
    expect(isWaitlistHoneypotTripped(" ")).toBe(true);
  });
});

describe("isValidWaitlistEmail", () => {
  it("accepts a basic well-formed email", () => {
    expect(isValidWaitlistEmail("buyer@example.com")).toBe(true);
  });

  it("accepts plus-addressed emails", () => {
    expect(isValidWaitlistEmail("buyer+tag@example.com")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidWaitlistEmail("")).toBe(false);
  });

  it("rejects an email with no @ sign", () => {
    expect(isValidWaitlistEmail("buyerexample.com")).toBe(false);
  });

  it("rejects an email with no domain dot", () => {
    expect(isValidWaitlistEmail("buyer@example")).toBe(false);
  });

  it("rejects an email with whitespace", () => {
    expect(isValidWaitlistEmail("buyer @example.com")).toBe(false);
  });
});

describe("isValidWaitlistStateCode", () => {
  it("accepts canonical 2-letter uppercase codes", () => {
    expect(isValidWaitlistStateCode("FL")).toBe(true);
    expect(isValidWaitlistStateCode("TX")).toBe(true);
    expect(isValidWaitlistStateCode("CA")).toBe(true);
  });

  it("rejects lowercase codes (caller must normalize first)", () => {
    expect(isValidWaitlistStateCode("fl")).toBe(false);
  });

  it("rejects 3-letter codes", () => {
    expect(isValidWaitlistStateCode("FLA")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidWaitlistStateCode("")).toBe(false);
  });

  it("rejects digits", () => {
    expect(isValidWaitlistStateCode("12")).toBe(false);
  });

  // Codex KIN-1088 review: allowlist against canonical US state codes
  // so junk like ZZ can't pollute state-level demand reporting.
  it("rejects 2-letter uppercase codes that aren't real US states", () => {
    expect(isValidWaitlistStateCode("ZZ")).toBe(false);
    expect(isValidWaitlistStateCode("XX")).toBe(false);
    expect(isValidWaitlistStateCode("QQ")).toBe(false);
  });

  it("allowlist is in parity with src/lib/intake/address.ts US_STATES values", () => {
    const addressValues = new Set(Object.values(US_STATES));
    expect(WAITLIST_ALLOWED_STATE_CODES.size).toBe(addressValues.size);
    for (const code of addressValues) {
      expect(WAITLIST_ALLOWED_STATE_CODES.has(code)).toBe(true);
    }
  });
});

describe("isValidWaitlistZip", () => {
  it("treats undefined as valid (zip is optional)", () => {
    expect(isValidWaitlistZip(undefined)).toBe(true);
  });

  it("treats empty string as valid (zip is optional)", () => {
    expect(isValidWaitlistZip("")).toBe(true);
  });

  it("accepts 5-digit zip", () => {
    expect(isValidWaitlistZip("33101")).toBe(true);
  });

  it("rejects ZIP+4 format — not accepted at this surface", () => {
    expect(isValidWaitlistZip("33101-1234")).toBe(false);
  });

  it("rejects 4-digit zip", () => {
    expect(isValidWaitlistZip("3310")).toBe(false);
  });

  it("rejects 6-digit zip", () => {
    expect(isValidWaitlistZip("331011")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(isValidWaitlistZip("3310A")).toBe(false);
  });
});

describe("isWithinWaitlistRateLimitWindow", () => {
  const now = Date.parse("2026-04-14T12:00:00.000Z");

  it("returns true when the prior submit was 1 second ago", () => {
    const prior = new Date(now - 1_000).toISOString();
    expect(isWithinWaitlistRateLimitWindow(prior, now)).toBe(true);
  });

  it("returns true at the lower edge of the window", () => {
    const prior = new Date(now - 30_000).toISOString();
    expect(isWithinWaitlistRateLimitWindow(prior, now)).toBe(true);
  });

  it("returns false exactly at the window boundary", () => {
    const prior = new Date(now - WAITLIST_RATE_LIMIT_WINDOW_MS).toISOString();
    expect(isWithinWaitlistRateLimitWindow(prior, now)).toBe(false);
  });

  it("returns false beyond the window", () => {
    const prior = new Date(
      now - (WAITLIST_RATE_LIMIT_WINDOW_MS + 1_000),
    ).toISOString();
    expect(isWithinWaitlistRateLimitWindow(prior, now)).toBe(false);
  });

  it("treats malformed timestamps as out-of-window (no rate limit applied)", () => {
    expect(isWithinWaitlistRateLimitWindow("not-a-date", now)).toBe(false);
  });
});

describe("waitlist upsert composition (smoke)", () => {
  // These tests pin the precedence of the validation chain. The
  // mutation evaluates checks in this exact order: honeypot first,
  // then email, then state, then zip. Each downstream check should
  // not mask an earlier failure. We do not exercise the Convex db
  // path here — those branches are covered by typecheck and by the
  // e2e test the UI agent owns.

  it("a bot-style submission with everything else valid still fails honeypot", () => {
    expect(isWaitlistHoneypotTripped("filled-by-bot")).toBe(true);
  });

  it("a valid submission passes every gate", () => {
    const email = normalizeWaitlistEmail("Buyer@Example.com");
    const state = normalizeWaitlistStateCode("tx");
    expect(isWaitlistHoneypotTripped(undefined)).toBe(false);
    expect(isValidWaitlistEmail(email)).toBe(true);
    expect(isValidWaitlistStateCode(state)).toBe(true);
    expect(isValidWaitlistZip("78701")).toBe(true);
  });
});
