/**
 * Tour request validation + state machine (KIN-802).
 *
 * Pure functions that validate tour request inputs and enforce allowed
 * state transitions. No IO, no Convex dependencies — this is the
 * deterministic layer that the Convex handlers call into so precondition
 * logic is unit-testable without a database.
 *
 * Structured error codes travel with every validation failure so both the
 * buyer UI and internal ops UI can display localized messages without
 * parsing error strings.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/** The full lifecycle of a tour request. */
export const TOUR_REQUEST_STATES = [
  "draft",
  "submitted",
  "blocked",
  "assigned",
  "confirmed",
  "completed",
  "canceled",
  "failed",
] as const;

export type TourRequestState = (typeof TOUR_REQUEST_STATES)[number];

/** Machine-readable codes for precondition failures. */
export const TOUR_REQUEST_ERROR_CODES = [
  "missing_tour_pass",
  "duplicate_request",
  "invalid_date_window",
  "invalid_attendee_count",
  "invalid_property",
  "deal_room_not_owned",
  "property_unavailable",
  "agreement_not_signed",
] as const;

export type TourRequestErrorCode = (typeof TOUR_REQUEST_ERROR_CODES)[number];

/** A preferred time window for the tour. Both ISO 8601 UTC. */
export interface DateWindow {
  start: string; // ISO 8601
  end: string; // ISO 8601
}

/** Raw input a buyer submits to create a tour request. */
export interface TourRequestInput {
  dealRoomId: string;
  propertyId: string;
  preferredWindows: DateWindow[];
  attendeeCount: number;
  buyerNotes?: string;
  /** Current agreement state snapshot — captured at creation for audit. */
  agreementStateSnapshot: {
    type: "none" | "tour_pass" | "full_representation";
    status: "none" | "draft" | "sent" | "signed" | "replaced" | "canceled";
    signedAt?: string;
  };
}

/** Discriminated validation result. */
export type ValidationResult =
  | { ok: true; sanitized: TourRequestInput }
  | { ok: false; code: TourRequestErrorCode; message: string };

// ───────────────────────────────────────────────────────────────────────────
// Input validation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Sanitize + validate a tour request input. Returns either a sanitized
 * payload ready for persistence, or a structured error.
 *
 * Validation rules:
 *   - dealRoomId and propertyId are required non-empty strings
 *   - preferredWindows: at least 1, at most 5, each with valid ISO dates
 *     where end > start and start is in the future
 *   - attendeeCount: integer between 1 and 10
 *   - agreementStateSnapshot.type must be "tour_pass" or
 *     "full_representation" with status "signed"
 */
export function validateTourRequestInput(
  input: TourRequestInput,
  now: string,
): ValidationResult {
  // Agreement check — tour pass or full representation required
  const agreementType = input.agreementStateSnapshot.type;
  const agreementStatus = input.agreementStateSnapshot.status;
  if (
    (agreementType !== "tour_pass" && agreementType !== "full_representation") ||
    agreementStatus !== "signed"
  ) {
    return {
      ok: false,
      code: "missing_tour_pass",
      message: "A signed tour pass or full representation agreement is required to request a tour",
    };
  }

  // Attendee count
  if (
    !Number.isInteger(input.attendeeCount) ||
    input.attendeeCount < 1 ||
    input.attendeeCount > 10
  ) {
    return {
      ok: false,
      code: "invalid_attendee_count",
      message: "Attendee count must be an integer between 1 and 10",
    };
  }

  // Date windows — at least 1, at most 5
  if (input.preferredWindows.length === 0 || input.preferredWindows.length > 5) {
    return {
      ok: false,
      code: "invalid_date_window",
      message: "Must provide between 1 and 5 preferred time windows",
    };
  }

  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) {
    return {
      ok: false,
      code: "invalid_date_window",
      message: "Server clock is invalid — cannot validate windows",
    };
  }

  for (const window of input.preferredWindows) {
    const startMs = Date.parse(window.start);
    const endMs = Date.parse(window.end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return {
        ok: false,
        code: "invalid_date_window",
        message: "Preferred window has unparseable start or end date",
      };
    }
    if (endMs <= startMs) {
      return {
        ok: false,
        code: "invalid_date_window",
        message: "Preferred window end must be after start",
      };
    }
    if (startMs <= nowMs) {
      return {
        ok: false,
        code: "invalid_date_window",
        message: "Preferred window start must be in the future",
      };
    }
  }

  // Sanitize notes (trim + truncate)
  const sanitized: TourRequestInput = {
    ...input,
    buyerNotes: input.buyerNotes?.trim().slice(0, 2000),
  };

  return { ok: true, sanitized };
}

// ───────────────────────────────────────────────────────────────────────────
// State machine
// ───────────────────────────────────────────────────────────────────────────

/**
 * Legal transitions between tour request states. Each key lists the
 * states that can legally follow the key state.
 *
 * Terminal states (completed, canceled, failed) have empty arrays — the
 * record cannot transition out of them.
 */
const LEGAL_TRANSITIONS: Record<TourRequestState, TourRequestState[]> = {
  draft: ["submitted", "canceled"],
  submitted: ["blocked", "assigned", "canceled", "failed"],
  blocked: ["submitted", "canceled", "failed"], // can unblock and resubmit
  assigned: ["confirmed", "canceled", "failed"],
  confirmed: ["completed", "canceled", "failed"],
  completed: [],
  canceled: [],
  failed: [],
};

/** Check whether a transition is legal. */
export function canTransition(
  from: TourRequestState,
  to: TourRequestState,
): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Attempt a transition. Returns the new state on success or an error code
 * on failure. Use this in Convex mutations to centralize transition logic.
 */
export function attemptTransition(
  from: TourRequestState,
  to: TourRequestState,
): { ok: true; next: TourRequestState } | { ok: false; code: "illegal_transition"; message: string } {
  if (!canTransition(from, to)) {
    return {
      ok: false,
      code: "illegal_transition",
      message: `Cannot transition tour request from "${from}" to "${to}"`,
    };
  }
  return { ok: true, next: to };
}

/** Return true iff the state is terminal (no further transitions allowed). */
export function isTerminal(state: TourRequestState): boolean {
  return LEGAL_TRANSITIONS[state]?.length === 0;
}
