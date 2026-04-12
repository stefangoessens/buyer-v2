/**
 * Limited external counterparty access types (KIN-828).
 *
 * Models the narrow token-based access a listing agent, listing broker, or
 * other external party uses to interact with a single deal-room context
 * without ever getting a full user account.
 *
 * Principles:
 *   1. Tokens are scoped to one deal room (and optionally one offer).
 *   2. Tokens carry an explicit action allowlist — they cannot be used for
 *      anything not on that list, even with valid credentials.
 *   3. Tokens are stored hashed — the plaintext is only returned once, at
 *      issue time, and is never recoverable afterwards.
 *   4. Every use is audited with a structured event; revocation is a first-
 *      class state, not a deletion.
 */

/** The fixed set of actions an external-access token may authorize. */
export const EXTERNAL_ACCESS_ACTIONS = [
  "view_offer",
  "submit_response",
  "confirm_compensation",
  "acknowledge_receipt",
] as const;

export type ExternalAccessAction = (typeof EXTERNAL_ACCESS_ACTIONS)[number];

/** Role label for the external party. Used for audit display; NOT a permission. */
export const EXTERNAL_ROLES = [
  "listing_agent",
  "listing_broker",
  "cooperating_broker",
  "other",
] as const;

export type ExternalRole = (typeof EXTERNAL_ROLES)[number];

/** Reasons a token check can deny access. Stable for client handling. */
export type TokenDenialReason =
  | "not_found"
  | "expired"
  | "revoked"
  | "action_not_allowed"
  | "scope_mismatch";

/**
 * Result of a token validation check. The result is either a granted scope
 * OR a denial with a structured reason — never both. This shape lets the
 * backend return denial details to the client without leaking whether a
 * token ever existed (both "not_found" and "revoked" look the same over
 * the wire; the distinction is only in server logs for debugging).
 */
export type TokenValidationResult =
  | {
      granted: true;
      allowedActions: ExternalAccessAction[];
      dealRoomId: string;
      offerId?: string;
      expiresAt: string;
      role: ExternalRole;
    }
  | {
      granted: false;
      reason: TokenDenialReason;
    };

/** Shape used for recording an audit event about a token interaction. */
export type TokenEventType =
  | "issued"
  | "accessed"
  | "submitted"
  | "denied"
  | "revoked";

export interface TokenEventMetadata {
  attemptedAction?: ExternalAccessAction;
  denialReason?: TokenDenialReason;
  /** Free-form context for submissions (e.g., offer response summary). Never PII. */
  summary?: string;
}
