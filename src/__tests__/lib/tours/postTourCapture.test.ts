import { describe, it, expect } from "vitest";
import {
  validatePostTourCapture,
  extractPostTourSignals,
  POST_TOUR_ACTORS,
  TOUR_SENTIMENTS,
  OFFER_READINESS,
  CONCERN_CATEGORIES,
  POST_TOUR_ERROR_CODES,
  type PostTourCaptureInput,
  type TourConcern,
} from "@/lib/tours/postTourCapture";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

function concern(overrides: Partial<TourConcern> = {}): TourConcern {
  return {
    category: "price",
    label: "Listed too high",
    severity: 3,
    ...overrides,
  };
}

function buyerInput(
  overrides: Partial<PostTourCaptureInput> = {},
): PostTourCaptureInput {
  return {
    tourRequestId: "tr_1",
    propertyId: "prop_1",
    dealRoomId: "dr_1",
    submittedBy: "buyer",
    tourDate: "2028-03-10T14:00:00Z",
    buyerVisible: {
      sentiment: "positive",
      offerReadiness: "ready_soon",
      concerns: [concern()],
      highlights: ["Large kitchen", "Nice backyard"],
      buyerNotes: "Loved the natural light",
    },
    ...overrides,
  };
}

function brokerInput(
  overrides: Partial<PostTourCaptureInput> = {},
): PostTourCaptureInput {
  return {
    tourRequestId: "tr_1",
    propertyId: "prop_1",
    dealRoomId: "dr_1",
    submittedBy: "broker",
    buyerVisible: {
      sentiment: "positive",
      offerReadiness: "ready_soon",
      concerns: [],
      highlights: [],
    },
    internal: {
      internalNotes: "Listing agent hinted seller is motivated",
      negotiationSignals: "Seller rep mentioned flexibility on closing date",
      brokerReadinessAssessment: "ready_now",
      competingInterest: "moderate",
    },
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Buyer submission path
// ───────────────────────────────────────────────────────────────────────────

describe("validatePostTourCapture — buyer submission", () => {
  it("accepts a valid buyer submission", () => {
    const result = validatePostTourCapture(buyerInput());
    expect(result.ok).toBe(true);
  });

  it("rejects buyer setting internal fields", () => {
    const result = validatePostTourCapture(
      buyerInput({
        internal: { internalNotes: "sneaky" },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("buyer_cannot_set_internal");
  });

  it("sanitizes buyer notes (trim)", () => {
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [],
          highlights: [],
          buyerNotes: "  leading/trailing whitespace  ",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized.buyerVisible.buyerNotes).toBe(
        "leading/trailing whitespace",
      );
    }
  });

  it("dedupes highlights and trims whitespace", () => {
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [],
          highlights: ["  Kitchen  ", "Kitchen", "Backyard"],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized.buyerVisible.highlights).toHaveLength(2);
      expect(result.sanitized.buyerVisible.highlights).toContain("Kitchen");
      expect(result.sanitized.buyerVisible.highlights).toContain("Backyard");
    }
  });

  it("dedupes concerns by category+label, keeping max severity", () => {
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [
            concern({ category: "price", label: "Too high", severity: 3 }),
            concern({ category: "price", label: "Too high", severity: 5 }),
            concern({ category: "condition", label: "Roof old", severity: 4 }),
          ],
          highlights: [],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const concerns = result.sanitized.buyerVisible.concerns;
      expect(concerns).toHaveLength(2);
      const priceConcern = concerns.find((c) => c.category === "price");
      expect(priceConcern?.severity).toBe(5);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Internal (broker/agent) submission path
// ───────────────────────────────────────────────────────────────────────────

describe("validatePostTourCapture — internal submission", () => {
  it("accepts a valid broker submission with internal fields", () => {
    const result = validatePostTourCapture(brokerInput());
    expect(result.ok).toBe(true);
  });

  it("trims internal notes", () => {
    const result = validatePostTourCapture(
      brokerInput({
        internal: {
          internalNotes: "  strategy note  ",
          negotiationSignals: "  signal  ",
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized.internal?.internalNotes).toBe("strategy note");
      expect(result.sanitized.internal?.negotiationSignals).toBe("signal");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Concern / highlight / notes validation
// ───────────────────────────────────────────────────────────────────────────

describe("validatePostTourCapture — validation errors", () => {
  it("rejects invalid concern severity (0)", () => {
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [concern({ severity: 0 as 1 })],
          highlights: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_concern_severity");
  });

  it("rejects invalid concern severity (6)", () => {
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [concern({ severity: 6 as 5 })],
          highlights: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_concern_severity");
  });

  it("rejects too many concerns (>15)", () => {
    const tooMany = Array.from({ length: 16 }, (_, i) =>
      concern({ label: `Concern ${i}` }),
    );
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: tooMany,
          highlights: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("too_many_concerns");
  });

  it("rejects too many highlights (>15)", () => {
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [],
          highlights: Array.from({ length: 16 }, (_, i) => `H${i}`),
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("too_many_highlights");
  });

  it("rejects notes longer than 4000 chars", () => {
    const longNote = "x".repeat(4001);
    const result = validatePostTourCapture(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [],
          highlights: [],
          buyerNotes: longNote,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("notes_too_long");
  });

  it("rejects internal notes longer than 4000 chars", () => {
    const longNote = "x".repeat(4001);
    const result = validatePostTourCapture(
      brokerInput({
        internal: { internalNotes: longNote },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("notes_too_long");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Signal extraction
// ───────────────────────────────────────────────────────────────────────────

describe("extractPostTourSignals", () => {
  it("maps sentiment to a 0-1 score", () => {
    const veryPos = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "very_positive",
          offerReadiness: "ready_now",
          concerns: [],
          highlights: [],
        },
      }),
    );
    expect(veryPos.sentimentScore).toBe(1.0);

    const veryNeg = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "very_negative",
          offerReadiness: "not_interested",
          concerns: [],
          highlights: [],
        },
      }),
    );
    expect(veryNeg.sentimentScore).toBe(0.0);
  });

  it("maps readiness to a 0-1 score", () => {
    const readyNow = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_now",
          concerns: [],
          highlights: [],
        },
      }),
    );
    expect(readyNow.readinessScore).toBe(1.0);

    const notInterested = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "negative",
          offerReadiness: "not_interested",
          concerns: [],
          highlights: [],
        },
      }),
    );
    expect(notInterested.readinessScore).toBe(0.0);
  });

  it("sums concern severities into totalConcernWeight", () => {
    const signals = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [
            concern({ severity: 5 }),
            concern({ category: "condition", severity: 3 }),
            concern({ category: "hoa", severity: 2 }),
          ],
          highlights: [],
        },
      }),
    );
    expect(signals.totalConcernWeight).toBe(10);
  });

  it("groups concerns by category", () => {
    const signals = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [
            concern({ category: "price", label: "high" }),
            concern({ category: "price", label: "too high" }),
            concern({ category: "condition", label: "roof" }),
          ],
          highlights: [],
        },
      }),
    );
    expect(signals.concernCountByCategory.price).toBe(2);
    expect(signals.concernCountByCategory.condition).toBe(1);
  });

  it("flags hasDealbreaker when any concern has severity 5", () => {
    const signals = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [concern({ severity: 5 })],
          highlights: [],
        },
      }),
    );
    expect(signals.hasDealbreaker).toBe(true);
  });

  it("hasDealbreaker is false when all concerns are below 5", () => {
    const signals = extractPostTourSignals(
      buyerInput({
        buyerVisible: {
          sentiment: "positive",
          offerReadiness: "ready_soon",
          concerns: [concern({ severity: 4 })],
          highlights: [],
        },
      }),
    );
    expect(signals.hasDealbreaker).toBe(false);
  });

  it("includes internal signals only when includeInternal=true", () => {
    const capture = brokerInput();
    const withInternal = extractPostTourSignals(capture, {
      includeInternal: true,
    });
    expect(withInternal.brokerReadinessScore).toBe(1.0); // ready_now
    expect(withInternal.competingInterestScore).toBe(0.6); // moderate

    const withoutInternal = extractPostTourSignals(capture);
    expect(withoutInternal.brokerReadinessScore).toBeUndefined();
    expect(withoutInternal.competingInterestScore).toBeUndefined();
  });

  it("highlightCount reflects dedupe-aware count", () => {
    const capture = buyerInput({
      buyerVisible: {
        sentiment: "positive",
        offerReadiness: "ready_soon",
        concerns: [],
        highlights: ["a", "b", "c"],
      },
    });
    const signals = extractPostTourSignals(capture);
    expect(signals.highlightCount).toBe(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("POST_TOUR_ACTORS has 4 entries", () => {
    expect(POST_TOUR_ACTORS).toHaveLength(4);
  });
  it("TOUR_SENTIMENTS has 5 entries", () => {
    expect(TOUR_SENTIMENTS).toHaveLength(5);
  });
  it("OFFER_READINESS has 5 entries", () => {
    expect(OFFER_READINESS).toHaveLength(5);
  });
  it("CONCERN_CATEGORIES has 9 entries", () => {
    expect(CONCERN_CATEGORIES).toHaveLength(9);
  });
  it("POST_TOUR_ERROR_CODES has 9 codes", () => {
    expect(POST_TOUR_ERROR_CODES).toHaveLength(9);
    expect(POST_TOUR_ERROR_CODES).toContain("buyer_cannot_set_internal");
    expect(POST_TOUR_ERROR_CODES).toContain("invalid_concern_severity");
  });
});
