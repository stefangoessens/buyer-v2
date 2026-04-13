import { describe, it, expect } from "vitest";
import {
  validateListingResponse,
  isDuplicateSubmission,
  LISTING_RESPONSE_TYPES,
  LISTING_RESPONSE_ERROR_CODES,
  type ListingResponseInput,
} from "@/lib/externalAccess/listingResponse";

const NOW = "2028-05-01T12:00:00.000Z";

function input(
  overrides: Partial<ListingResponseInput> = {},
): ListingResponseInput {
  return {
    tokenHash: "hash_1",
    counterpartyRole: "listing_agent",
    dealRoomId: "dr_1",
    responseType: "generic_acknowledged",
    ...overrides,
  };
}

function futureDate(daysFromNow: number): string {
  return new Date(
    Date.parse(NOW) + daysFromNow * 24 * 60 * 60 * 1000,
  ).toISOString();
}

// ───────────────────────────────────────────────────────────────────────────
// Valid submission paths
// ───────────────────────────────────────────────────────────────────────────

describe("validateListingResponse — valid submissions", () => {
  it("accepts a generic acknowledgement", () => {
    const result = validateListingResponse(input(), NOW);
    expect(result.ok).toBe(true);
  });

  it("accepts offer_acknowledged without extra fields", () => {
    const result = validateListingResponse(
      input({ responseType: "offer_acknowledged", offerId: "off_1" }),
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts offer_rejected with offerId", () => {
    const result = validateListingResponse(
      input({ responseType: "offer_rejected", offerId: "off_1" }),
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts offer_countered with valid counter payload", () => {
    const result = validateListingResponse(
      input({
        responseType: "offer_countered",
        offerId: "off_1",
        counterOffer: {
          counterPrice: 625_000,
          counterEarnestMoney: 15_000,
          counterClosingDate: futureDate(30),
          requestedConcessions: "  Seller credit 5k  ",
        },
      }),
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized.counterOffer?.requestedConcessions).toBe(
        "Seller credit 5k",
      );
    }
  });

  it("accepts compensation_confirmed with percent", () => {
    const result = validateListingResponse(
      input({
        responseType: "compensation_confirmed",
        compensation: { confirmedPct: 2.5 },
      }),
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts compensation_disputed with reason", () => {
    const result = validateListingResponse(
      input({
        responseType: "compensation_disputed",
        compensation: {
          confirmedPct: 2.0,
          disputeReason: "Lower than agreed",
        },
      }),
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("trims message whitespace", () => {
    const result = validateListingResponse(
      input({ message: "  leading/trailing  " }),
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sanitized.message).toBe("leading/trailing");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Validation errors
// ───────────────────────────────────────────────────────────────────────────

describe("validateListingResponse — validation errors", () => {
  it("rejects invalid response type", () => {
    const result = validateListingResponse(
      input({ responseType: "bogus" as never }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_response_type");
  });

  it("rejects message longer than 4000 chars", () => {
    const longMsg = "x".repeat(4001);
    const result = validateListingResponse(input({ message: longMsg }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("message_too_long");
  });

  it("rejects offer_countered without counterOffer payload", () => {
    const result = validateListingResponse(
      input({ responseType: "offer_countered", offerId: "off_1" }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_counter_offer_payload");
  });

  it("rejects offer_countered without offerId", () => {
    const result = validateListingResponse(
      input({
        responseType: "offer_countered",
        counterOffer: { counterPrice: 500_000 },
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("offer_required_for_counter");
  });

  it("rejects counter price ≤ 0", () => {
    const result = validateListingResponse(
      input({
        responseType: "offer_countered",
        offerId: "off_1",
        counterOffer: { counterPrice: 0 },
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_counter_price");
  });

  it("rejects counter price over $100M cap", () => {
    const result = validateListingResponse(
      input({
        responseType: "offer_countered",
        offerId: "off_1",
        counterOffer: { counterPrice: 200_000_000 },
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_counter_price");
  });

  it("rejects earnest money ≤ 0 or over $10M", () => {
    const negativeResult = validateListingResponse(
      input({
        responseType: "offer_countered",
        offerId: "off_1",
        counterOffer: { counterPrice: 500_000, counterEarnestMoney: -1 },
      }),
      NOW,
    );
    expect(negativeResult.ok).toBe(false);
    if (!negativeResult.ok)
      expect(negativeResult.code).toBe("invalid_earnest_money");

    const hugeResult = validateListingResponse(
      input({
        responseType: "offer_countered",
        offerId: "off_1",
        counterOffer: {
          counterPrice: 500_000,
          counterEarnestMoney: 20_000_000,
        },
      }),
      NOW,
    );
    expect(hugeResult.ok).toBe(false);
    if (!hugeResult.ok) expect(hugeResult.code).toBe("invalid_earnest_money");
  });

  it("rejects past closing date", () => {
    const result = validateListingResponse(
      input({
        responseType: "offer_countered",
        offerId: "off_1",
        counterOffer: {
          counterPrice: 500_000,
          counterClosingDate: "2020-01-01T00:00:00Z",
        },
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_closing_date");
  });

  it("rejects unparseable closing date", () => {
    const result = validateListingResponse(
      input({
        responseType: "offer_countered",
        offerId: "off_1",
        counterOffer: {
          counterPrice: 500_000,
          counterClosingDate: "not-a-date",
        },
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_closing_date");
  });

  it("rejects compensation_confirmed without payload", () => {
    const result = validateListingResponse(
      input({ responseType: "compensation_confirmed" }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_compensation_payload");
  });

  it("rejects compensation percent out of range", () => {
    const result = validateListingResponse(
      input({
        responseType: "compensation_confirmed",
        compensation: { confirmedPct: 150 },
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_compensation_pct");
  });

  it("rejects compensation_disputed without reason", () => {
    const result = validateListingResponse(
      input({
        responseType: "compensation_disputed",
        compensation: { confirmedPct: 2.0 },
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_dispute_reason");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Duplicate detection
// ───────────────────────────────────────────────────────────────────────────

describe("isDuplicateSubmission", () => {
  const recentSubmit = new Date(Date.parse(NOW) - 30_000).toISOString(); // 30s ago

  it("flags a duplicate within the dedupe window", () => {
    const isDup = isDuplicateSubmission({
      existing: [
        {
          tokenHash: "hash_1",
          responseType: "offer_acknowledged",
          submittedAt: recentSubmit,
        },
      ],
      incoming: { tokenHash: "hash_1", responseType: "offer_acknowledged" },
      now: NOW,
    });
    expect(isDup).toBe(true);
  });

  it("does not flag different response types", () => {
    const isDup = isDuplicateSubmission({
      existing: [
        {
          tokenHash: "hash_1",
          responseType: "offer_acknowledged",
          submittedAt: recentSubmit,
        },
      ],
      incoming: { tokenHash: "hash_1", responseType: "offer_rejected" },
      now: NOW,
    });
    expect(isDup).toBe(false);
  });

  it("does not flag different tokens", () => {
    const isDup = isDuplicateSubmission({
      existing: [
        {
          tokenHash: "hash_A",
          responseType: "offer_acknowledged",
          submittedAt: recentSubmit,
        },
      ],
      incoming: { tokenHash: "hash_B", responseType: "offer_acknowledged" },
      now: NOW,
    });
    expect(isDup).toBe(false);
  });

  it("does not flag submissions past the window", () => {
    const oldSubmit = new Date(
      Date.parse(NOW) - 5 * 60_000,
    ).toISOString(); // 5 min ago
    const isDup = isDuplicateSubmission({
      existing: [
        {
          tokenHash: "hash_1",
          responseType: "offer_acknowledged",
          submittedAt: oldSubmit,
        },
      ],
      incoming: { tokenHash: "hash_1", responseType: "offer_acknowledged" },
      now: NOW,
    });
    expect(isDup).toBe(false);
  });

  it("honors a custom dedupe window", () => {
    const isDup = isDuplicateSubmission({
      existing: [
        {
          tokenHash: "hash_1",
          responseType: "offer_acknowledged",
          submittedAt: recentSubmit,
        },
      ],
      incoming: { tokenHash: "hash_1", responseType: "offer_acknowledged" },
      now: NOW,
      dedupeWindowSeconds: 10, // 10s window — 30s ago is outside
    });
    expect(isDup).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("LISTING_RESPONSE_TYPES has 6 entries", () => {
    expect(LISTING_RESPONSE_TYPES).toHaveLength(6);
  });

  it("LISTING_RESPONSE_ERROR_CODES includes expected codes", () => {
    expect(LISTING_RESPONSE_ERROR_CODES).toContain("invalid_response_type");
    expect(LISTING_RESPONSE_ERROR_CODES).toContain("missing_counter_offer_payload");
    expect(LISTING_RESPONSE_ERROR_CODES).toContain("offer_required_for_counter");
  });
});
