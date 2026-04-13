/**
 * Listing-side structured response types + validation (KIN-840).
 *
 * Pure types and validators for the narrow external-access flow used
 * by listing agents/brokers to submit structured responses without
 * needing an internal account. Builds on the KIN-828 external access
 * token model: a valid token + an allowed action grants the right to
 * submit a response scoped to the token's deal room (and optionally
 * offer).
 *
 * The response envelope captures:
 *   - Response type: offer_acknowledged, offer_countered, offer_rejected,
 *     compensation_confirmed, compensation_disputed, generic_acknowledged
 *   - Counterparty (derived from the token's role)
 *   - Structured fields for price, terms, notes
 *   - Timestamps for audit
 *
 * Every submission is one row in listingResponses and is linked back
 * to the token that authorized it. Internal users review responses
 * via the shared read model; buyers never see raw listing-side notes.
 */

// ───────────────────────────────────────────────────────────────────────────
// Response types
// ───────────────────────────────────────────────────────────────────────────

export const LISTING_RESPONSE_TYPES = [
  "offer_acknowledged",
  "offer_countered",
  "offer_rejected",
  "compensation_confirmed",
  "compensation_disputed",
  "generic_acknowledged",
] as const;

export type ListingResponseType = (typeof LISTING_RESPONSE_TYPES)[number];

/** Counterparty role (derived from the token that authorized the submission). */
export const LISTING_COUNTERPARTY_ROLES = [
  "listing_agent",
  "listing_broker",
  "cooperating_broker",
  "other",
] as const;

export type ListingCounterpartyRole =
  (typeof LISTING_COUNTERPARTY_ROLES)[number];

/** Review status — set by internal users after reading the response. */
export const LISTING_RESPONSE_REVIEW_STATUSES = [
  "unreviewed",
  "acknowledged",
  "actioned",
  "dismissed",
] as const;

export type ListingResponseReviewStatus =
  (typeof LISTING_RESPONSE_REVIEW_STATUSES)[number];

// ───────────────────────────────────────────────────────────────────────────
// Payload shape
// ───────────────────────────────────────────────────────────────────────────

/** Counter-offer payload: when `type = offer_countered`. */
export interface CounterOfferPayload {
  counterPrice?: number;
  counterEarnestMoney?: number;
  counterClosingDate?: string; // ISO date
  requestedConcessions?: string;
  sellerCreditsRequested?: number;
}

/** Compensation confirmation payload: when `type = compensation_*`. */
export interface CompensationPayload {
  /** Confirmed compensation percent (e.g., 2.5 for 2.5%). */
  confirmedPct?: number;
  /** Confirmed compensation flat amount in USD. */
  confirmedFlat?: number;
  /** Dispute reason if compensation_disputed. */
  disputeReason?: string;
}

/** Full listing response input — the envelope submitted via token auth. */
export interface ListingResponseInput {
  /** The token that authorizes this submission (hashed form). */
  tokenHash: string;
  /** Counterparty who is submitting (from the token record). */
  counterpartyRole: ListingCounterpartyRole;
  /** Deal room the token was scoped to. */
  dealRoomId: string;
  /** Optional offer scope. When present, the token was scoped to this offer. */
  offerId?: string;
  responseType: ListingResponseType;
  /** Freeform message from the counterparty. Capped at 4000 characters. */
  message?: string;
  counterOffer?: CounterOfferPayload;
  compensation?: CompensationPayload;
}

// ───────────────────────────────────────────────────────────────────────────
// Validation
// ───────────────────────────────────────────────────────────────────────────

export const LISTING_RESPONSE_ERROR_CODES = [
  "invalid_response_type",
  "missing_counter_offer_payload",
  "missing_compensation_payload",
  "invalid_counter_price",
  "invalid_earnest_money",
  "invalid_closing_date",
  "invalid_compensation_pct",
  "invalid_compensation_flat",
  "missing_dispute_reason",
  "message_too_long",
  "offer_required_for_counter",
] as const;

export type ListingResponseErrorCode =
  (typeof LISTING_RESPONSE_ERROR_CODES)[number];

export type ValidationResult =
  | { ok: true; sanitized: ListingResponseInput }
  | { ok: false; code: ListingResponseErrorCode; message: string };

const MAX_MESSAGE_LENGTH = 4000;
const MAX_COUNTER_PRICE = 100_000_000; // $100M cap — sanity bound
const MAX_EARNEST_MONEY = 10_000_000; // $10M cap

/**
 * Validate and sanitize a listing response payload. Returns the
 * sanitized input on success or a structured error code on failure.
 * Pure function — no IO, no dependencies.
 */
export function validateListingResponse(
  input: ListingResponseInput,
  now: string,
): ValidationResult {
  if (!LISTING_RESPONSE_TYPES.includes(input.responseType)) {
    return {
      ok: false,
      code: "invalid_response_type",
      message: `Unknown response type: ${input.responseType}`,
    };
  }

  if (input.message !== undefined && input.message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      code: "message_too_long",
      message: `Message must be ≤${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  // Counter-offer specific validation
  if (input.responseType === "offer_countered") {
    if (!input.counterOffer) {
      return {
        ok: false,
        code: "missing_counter_offer_payload",
        message: "offer_countered response requires a counterOffer payload",
      };
    }
    if (!input.offerId) {
      return {
        ok: false,
        code: "offer_required_for_counter",
        message: "Counter-offer requires an associated offerId",
      };
    }
    const co = input.counterOffer;
    if (
      typeof co.counterPrice === "number" &&
      (co.counterPrice <= 0 || co.counterPrice > MAX_COUNTER_PRICE)
    ) {
      return {
        ok: false,
        code: "invalid_counter_price",
        message: `Counter price must be > 0 and ≤ $${MAX_COUNTER_PRICE.toLocaleString()}`,
      };
    }
    if (
      typeof co.counterEarnestMoney === "number" &&
      (co.counterEarnestMoney < 0 || co.counterEarnestMoney > MAX_EARNEST_MONEY)
    ) {
      return {
        ok: false,
        code: "invalid_earnest_money",
        message: `Earnest money must be ≥ 0 and ≤ $${MAX_EARNEST_MONEY.toLocaleString()}`,
      };
    }
    if (co.counterClosingDate !== undefined) {
      const d = Date.parse(co.counterClosingDate);
      if (Number.isNaN(d)) {
        return {
          ok: false,
          code: "invalid_closing_date",
          message: "Closing date must be a parseable ISO date",
        };
      }
      const nowMs = Date.parse(now);
      if (!Number.isNaN(nowMs) && d <= nowMs) {
        return {
          ok: false,
          code: "invalid_closing_date",
          message: "Closing date must be in the future",
        };
      }
    }
  }

  // Compensation specific validation
  if (
    input.responseType === "compensation_confirmed" ||
    input.responseType === "compensation_disputed"
  ) {
    if (!input.compensation) {
      return {
        ok: false,
        code: "missing_compensation_payload",
        message: `${input.responseType} response requires a compensation payload`,
      };
    }
    const comp = input.compensation;
    if (
      typeof comp.confirmedPct === "number" &&
      (comp.confirmedPct < 0 || comp.confirmedPct > 100)
    ) {
      return {
        ok: false,
        code: "invalid_compensation_pct",
        message: "Compensation percent must be between 0 and 100",
      };
    }
    if (
      typeof comp.confirmedFlat === "number" &&
      (comp.confirmedFlat < 0 || comp.confirmedFlat > MAX_COUNTER_PRICE)
    ) {
      return {
        ok: false,
        code: "invalid_compensation_flat",
        message: "Compensation flat amount must be ≥ 0",
      };
    }
    if (input.responseType === "compensation_disputed" && !comp.disputeReason) {
      return {
        ok: false,
        code: "missing_dispute_reason",
        message: "compensation_disputed requires disputeReason",
      };
    }
  }

  return {
    ok: true,
    sanitized: {
      ...input,
      message: input.message?.trim(),
      counterOffer: input.counterOffer
        ? {
            ...input.counterOffer,
            requestedConcessions: input.counterOffer.requestedConcessions?.trim(),
          }
        : undefined,
      compensation: input.compensation
        ? {
            ...input.compensation,
            disputeReason: input.compensation.disputeReason?.trim(),
          }
        : undefined,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Duplicate detection
// ───────────────────────────────────────────────────────────────────────────

/**
 * Detect whether a new response is a duplicate of an existing response
 * (same token, same type, within a short window). Used to prevent
 * accidental double-submissions from retries.
 */
export function isDuplicateSubmission(args: {
  existing: Array<{
    tokenHash: string;
    responseType: ListingResponseType;
    submittedAt: string;
  }>;
  incoming: { tokenHash: string; responseType: ListingResponseType };
  now: string;
  dedupeWindowSeconds?: number;
}): boolean {
  const window = (args.dedupeWindowSeconds ?? 60) * 1000;
  const nowMs = Date.parse(args.now);
  if (Number.isNaN(nowMs)) return false;

  return args.existing.some((existing) => {
    if (existing.tokenHash !== args.incoming.tokenHash) return false;
    if (existing.responseType !== args.incoming.responseType) return false;
    const submittedMs = Date.parse(existing.submittedAt);
    if (Number.isNaN(submittedMs)) return false;
    return nowMs - submittedMs < window;
  });
}
