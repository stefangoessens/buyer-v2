/**
 * Post-tour capture types + validation (KIN-805).
 *
 * Pure types and validators for the data collected after a showing.
 * Captures both buyer-facing observations (what they liked/disliked,
 * offer readiness, concerns) and internal-only notes (broker strategy,
 * negotiation signals). The schema and query layer split these visibilities.
 *
 * Downstream consumers (pricing engine, leverage engine, offer engine,
 * case synthesizer) read structured signals from this data without
 * needing to parse freeform notes.
 */

// ───────────────────────────────────────────────────────────────────────────
// Shared enums
// ───────────────────────────────────────────────────────────────────────────

/** Who submitted the post-tour observation. */
export const POST_TOUR_ACTORS = [
  "buyer",
  "broker",
  "showing_agent",
  "coordinator",
] as const;

export type PostTourActor = (typeof POST_TOUR_ACTORS)[number];

/** Sentiment captured during or after the tour. */
export const TOUR_SENTIMENTS = [
  "very_positive",
  "positive",
  "neutral",
  "negative",
  "very_negative",
] as const;

export type TourSentiment = (typeof TOUR_SENTIMENTS)[number];

/** Buyer's readiness to make an offer. */
export const OFFER_READINESS = [
  "ready_now",
  "ready_soon",
  "needs_time",
  "not_interested",
  "unknown",
] as const;

export type OfferReadiness = (typeof OFFER_READINESS)[number];

/** Structured concern categories so downstream engines can filter. */
export const CONCERN_CATEGORIES = [
  "price",
  "condition",
  "location",
  "layout",
  "hoa",
  "financing",
  "inspection_fear",
  "school_zone",
  "other",
] as const;

export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

// ───────────────────────────────────────────────────────────────────────────
// Observation shape
// ───────────────────────────────────────────────────────────────────────────

/** A structured concern raised during or after the tour. */
export interface TourConcern {
  category: ConcernCategory;
  /** Short human label — buyer-visible. */
  label: string;
  /** Severity on a 1-5 scale (1 = minor, 5 = dealbreaker). */
  severity: 1 | 2 | 3 | 4 | 5;
}

/** The buyer-visible observation envelope. */
export interface BuyerVisibleObservation {
  sentiment: TourSentiment;
  offerReadiness: OfferReadiness;
  concerns: TourConcern[];
  /** Freeform notes the buyer explicitly wrote. Never contains agent strategy. */
  buyerNotes?: string;
  /** Things the buyer liked — for matching recommendations. */
  highlights: string[];
}

/** Internal-only notes hidden from buyers. */
export interface InternalOnlyObservation {
  /** Broker/agent strategy notes. */
  internalNotes?: string;
  /** Negotiation signals the agent picked up (seller rep pitched price, etc.). */
  negotiationSignals?: string;
  /** Broker's take on offer readiness (may differ from buyer's self-report). */
  brokerReadinessAssessment?: OfferReadiness;
  /** Competing interest observed at the showing. */
  competingInterest?: "none" | "low" | "moderate" | "high";
}

/** Full post-tour capture input envelope. */
export interface PostTourCaptureInput {
  tourRequestId: string;
  propertyId: string;
  dealRoomId: string;
  submittedBy: PostTourActor;
  /** ISO timestamp of when the tour actually happened. */
  tourDate?: string;
  buyerVisible: BuyerVisibleObservation;
  /** Internal is omitted when submitted by a buyer. */
  internal?: InternalOnlyObservation;
}

// ───────────────────────────────────────────────────────────────────────────
// Validation
// ───────────────────────────────────────────────────────────────────────────

export const POST_TOUR_ERROR_CODES = [
  "missing_tour_request",
  "invalid_sentiment",
  "invalid_readiness",
  "invalid_concern_category",
  "invalid_concern_severity",
  "buyer_cannot_set_internal",
  "too_many_concerns",
  "too_many_highlights",
  "notes_too_long",
] as const;

export type PostTourErrorCode = (typeof POST_TOUR_ERROR_CODES)[number];

/** Caller must handle validation errors by code, not by error string. */
export type ValidationResult =
  | { ok: true; sanitized: PostTourCaptureInput }
  | { ok: false; code: PostTourErrorCode; message: string };

const MAX_NOTES_LENGTH = 4000;
const MAX_CONCERNS = 15;
const MAX_HIGHLIGHTS = 15;

/**
 * Validate and sanitize a post-tour capture input. Returns a sanitized
 * payload ready for persistence, or a structured error code.
 */
export function validatePostTourCapture(
  input: PostTourCaptureInput,
): ValidationResult {
  // If the submitter is a buyer, they cannot set internal fields.
  if (input.submittedBy === "buyer" && input.internal !== undefined) {
    return {
      ok: false,
      code: "buyer_cannot_set_internal",
      message: "Buyers cannot set internal-only observation fields",
    };
  }

  // Sentiment must be valid
  if (!TOUR_SENTIMENTS.includes(input.buyerVisible.sentiment)) {
    return {
      ok: false,
      code: "invalid_sentiment",
      message: `Sentiment must be one of ${TOUR_SENTIMENTS.join(", ")}`,
    };
  }

  // Readiness must be valid
  if (!OFFER_READINESS.includes(input.buyerVisible.offerReadiness)) {
    return {
      ok: false,
      code: "invalid_readiness",
      message: `Offer readiness must be one of ${OFFER_READINESS.join(", ")}`,
    };
  }

  // Concerns: count + category + severity
  if (input.buyerVisible.concerns.length > MAX_CONCERNS) {
    return {
      ok: false,
      code: "too_many_concerns",
      message: `Maximum ${MAX_CONCERNS} concerns per observation`,
    };
  }
  for (const concern of input.buyerVisible.concerns) {
    if (!CONCERN_CATEGORIES.includes(concern.category)) {
      return {
        ok: false,
        code: "invalid_concern_category",
        message: `Invalid concern category: ${concern.category}`,
      };
    }
    if (
      !Number.isInteger(concern.severity) ||
      concern.severity < 1 ||
      concern.severity > 5
    ) {
      return {
        ok: false,
        code: "invalid_concern_severity",
        message: "Concern severity must be an integer 1-5",
      };
    }
  }

  // Highlights count
  if (input.buyerVisible.highlights.length > MAX_HIGHLIGHTS) {
    return {
      ok: false,
      code: "too_many_highlights",
      message: `Maximum ${MAX_HIGHLIGHTS} highlights per observation`,
    };
  }

  // Notes length
  if (
    input.buyerVisible.buyerNotes &&
    input.buyerVisible.buyerNotes.length > MAX_NOTES_LENGTH
  ) {
    return {
      ok: false,
      code: "notes_too_long",
      message: `Buyer notes must be ≤${MAX_NOTES_LENGTH} characters`,
    };
  }
  if (
    input.internal?.internalNotes &&
    input.internal.internalNotes.length > MAX_NOTES_LENGTH
  ) {
    return {
      ok: false,
      code: "notes_too_long",
      message: `Internal notes must be ≤${MAX_NOTES_LENGTH} characters`,
    };
  }

  // Sanitize: trim whitespace on notes, dedupe highlights + concerns
  const dedupedHighlights = Array.from(
    new Set(input.buyerVisible.highlights.map((h) => h.trim()).filter((h) => h.length > 0)),
  );
  const dedupedConcerns = dedupeConcerns(input.buyerVisible.concerns);

  const sanitized: PostTourCaptureInput = {
    ...input,
    buyerVisible: {
      ...input.buyerVisible,
      concerns: dedupedConcerns,
      highlights: dedupedHighlights,
      buyerNotes: input.buyerVisible.buyerNotes?.trim(),
    },
    internal: input.internal
      ? {
          ...input.internal,
          internalNotes: input.internal.internalNotes?.trim(),
          negotiationSignals: input.internal.negotiationSignals?.trim(),
        }
      : undefined,
  };

  return { ok: true, sanitized };
}

function dedupeConcerns(concerns: TourConcern[]): TourConcern[] {
  const seen = new Map<string, TourConcern>();
  for (const c of concerns) {
    const key = `${c.category}:${c.label.trim().toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || c.severity > existing.severity) {
      seen.set(key, { ...c, label: c.label.trim() });
    }
  }
  return Array.from(seen.values());
}

// ───────────────────────────────────────────────────────────────────────────
// Signal extraction — for downstream engines
// ───────────────────────────────────────────────────────────────────────────

/**
 * Structured signals extracted from a post-tour capture that downstream
 * engines (pricing, leverage, offer) can consume without parsing freeform
 * text. This is the stable contract between post-tour capture and the
 * AI engines.
 */
export interface PostTourSignals {
  /** 0-1 where 1 = very positive. Mapped from sentiment. */
  sentimentScore: number;
  /** 0-1 where 1 = ready to offer now. Mapped from readiness. */
  readinessScore: number;
  /** Sum of concern severities — higher = more friction. */
  totalConcernWeight: number;
  /** Count of concerns by category. Stable for aggregation. */
  concernCountByCategory: Partial<Record<ConcernCategory, number>>;
  /** True when any dealbreaker (severity 5) concern exists. */
  hasDealbreaker: boolean;
  /** Count of highlights the buyer noted. More = more interested. */
  highlightCount: number;
  /** Broker's readiness assessment, if available. Differs from buyer self-report. */
  brokerReadinessScore?: number;
  /** Competing interest intensity, mapped to 0-1. */
  competingInterestScore?: number;
}

const SENTIMENT_TO_SCORE: Record<TourSentiment, number> = {
  very_positive: 1.0,
  positive: 0.75,
  neutral: 0.5,
  negative: 0.25,
  very_negative: 0.0,
};

const READINESS_TO_SCORE: Record<OfferReadiness, number> = {
  ready_now: 1.0,
  ready_soon: 0.75,
  needs_time: 0.4,
  not_interested: 0.0,
  unknown: 0.5,
};

const COMPETING_TO_SCORE: Record<"none" | "low" | "moderate" | "high", number> = {
  none: 0.0,
  low: 0.25,
  moderate: 0.6,
  high: 1.0,
};

/**
 * Extract structured signals from a post-tour capture. Pure function —
 * consumers can call this without hitting the database. Works on the
 * buyer-visible data only; `includeInternal=true` adds broker signals.
 */
export function extractPostTourSignals(
  capture: PostTourCaptureInput,
  options: { includeInternal?: boolean } = {},
): PostTourSignals {
  const bv = capture.buyerVisible;

  const totalConcernWeight = bv.concerns.reduce(
    (sum, c) => sum + c.severity,
    0,
  );

  const concernCountByCategory: Partial<Record<ConcernCategory, number>> = {};
  for (const concern of bv.concerns) {
    concernCountByCategory[concern.category] =
      (concernCountByCategory[concern.category] ?? 0) + 1;
  }

  const hasDealbreaker = bv.concerns.some((c) => c.severity === 5);

  const signals: PostTourSignals = {
    sentimentScore: SENTIMENT_TO_SCORE[bv.sentiment],
    readinessScore: READINESS_TO_SCORE[bv.offerReadiness],
    totalConcernWeight,
    concernCountByCategory,
    hasDealbreaker,
    highlightCount: bv.highlights.length,
  };

  if (options.includeInternal && capture.internal) {
    if (capture.internal.brokerReadinessAssessment) {
      signals.brokerReadinessScore =
        READINESS_TO_SCORE[capture.internal.brokerReadinessAssessment];
    }
    if (capture.internal.competingInterest) {
      signals.competingInterestScore =
        COMPETING_TO_SCORE[capture.internal.competingInterest];
    }
  }

  return signals;
}
