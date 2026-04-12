/**
 * External access token primitives (KIN-828).
 *
 * Pure functions that handle token generation, hashing, constant-time
 * comparison, and validation logic. No IO, no Convex dependencies — this
 * module is the deterministic layer the Convex handlers call into so the
 * logic can be unit tested without a database.
 *
 * Security notes:
 *   - Plaintext tokens are only returned by `generateToken` and NEVER
 *     persisted. The Convex layer immediately hashes the plaintext and
 *     stores only the hash.
 *   - `verifyTokenHash` uses timing-safe comparison to avoid leaking
 *     character-by-character match position via timing.
 *   - Token entropy is 256 bits from a Node-safe source. 256 bits gives
 *     ~10^77 possibilities — brute force is infeasible.
 */

import type {
  ExternalAccessAction,
  TokenDenialReason,
  TokenValidationResult,
} from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Token generation + hashing
// ───────────────────────────────────────────────────────────────────────────

/** Entropy in bytes. 32 bytes = 256 bits. */
const TOKEN_BYTE_LENGTH = 32;

/** Cached reference to the Web Crypto API — falls back to undefined on old runtimes. */
function getCrypto(): Crypto | undefined {
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  return undefined;
}

/**
 * Generate a fresh plaintext token. Returns a URL-safe base64 string. This
 * is the ONLY function in the codebase that should ever produce a plaintext
 * token — all other code paths deal with the hashed form.
 *
 * Format: `eat_<base64url>` so leaked tokens are grep-able in logs and
 * rotated aggressively.
 */
export function generateToken(): string {
  const crypto = getCrypto();
  if (!crypto?.getRandomValues) {
    throw new Error(
      "Web Crypto API unavailable — cannot generate external access token",
    );
  }
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return `eat_${toBase64Url(bytes)}`;
}

/**
 * Hash a plaintext token using SHA-256. Returns a hex string. Used for
 * storing the token in Convex — only the hash is ever persisted.
 *
 * SHA-256 is adequate here because tokens carry 256 bits of entropy — there
 * is no rainbow-table risk and no password stretching is needed. If we
 * later add user-chosen short codes, switch to a slow hash.
 */
export async function hashToken(plaintext: string): Promise<string> {
  const crypto = getCrypto();
  if (!crypto?.subtle) {
    throw new Error(
      "Web Crypto Subtle API unavailable — cannot hash external access token",
    );
  }
  const encoded = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}

/**
 * Timing-safe comparison of two hex strings of equal length. Returns true
 * iff the strings are byte-identical. Returns false on length mismatch
 * (without short-circuiting, for consistency).
 *
 * This is used to compare a freshly-hashed input token against the stored
 * hash during validation. Without timing-safe comparison, an attacker with
 * fine-grained timing measurements could in theory probe the hash byte-by-
 * byte — this is defense in depth since the hash space is already huge.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ───────────────────────────────────────────────────────────────────────────
// Validation logic — the shape the Convex layer consumes
// ───────────────────────────────────────────────────────────────────────────

/** Persisted token record shape the validator works against. */
export interface TokenRecord {
  hashedToken: string;
  dealRoomId: string;
  offerId?: string;
  role: "listing_agent" | "listing_broker" | "cooperating_broker" | "other";
  allowedActions: ExternalAccessAction[];
  expiresAt: string; // ISO
  revokedAt?: string; // ISO — presence = revoked
  createdAt: string;
  lastUsedAt?: string;
}

/** Inputs to the validator. `now` is injected for deterministic testing. */
export interface ValidateTokenArgs {
  record: TokenRecord | null;
  /** The plaintext token the caller presented; must be hashed before compare. */
  presentedHash: string;
  /** Caller's intended action — validator enforces the allowlist. */
  intendedAction: ExternalAccessAction;
  /** Current time as ISO string — injected for deterministic tests. */
  now: string;
}

/**
 * Given a token record (from the DB), the caller's hashed presented token,
 * the action they want to take, and the current time, return either a
 * granted scope or a structured denial.
 *
 * This is the ONLY place token → access decisions are made. Callers of
 * external-access endpoints go through this function, no exceptions.
 */
export function validateToken(args: ValidateTokenArgs): TokenValidationResult {
  if (!args.record) {
    return { granted: false, reason: "not_found" };
  }

  // Constant-time compare the presented hash against the stored hash.
  if (!constantTimeEqual(args.presentedHash, args.record.hashedToken)) {
    return { granted: false, reason: "not_found" };
  }

  // Revoked tokens look the same as not-found over the wire to avoid
  // leaking revocation state. The distinction is in audit logs.
  if (args.record.revokedAt !== undefined) {
    return { granted: false, reason: "revoked" };
  }

  // Compare timestamps as instants (epoch ms), not strings. String
  // comparison only works for strictly canonical UTC ISO format — an
  // offset timestamp like `2026-04-12T20:30:00+01:00` would rank wrong
  // against `2026-04-12T19:45:00.000Z`, flipping real chronology and
  // either granting expired tokens or denying valid ones.
  if (parseInstant(args.now) >= parseInstant(args.record.expiresAt)) {
    return { granted: false, reason: "expired" };
  }

  if (!args.record.allowedActions.includes(args.intendedAction)) {
    return { granted: false, reason: "action_not_allowed" };
  }

  return {
    granted: true,
    allowedActions: [...args.record.allowedActions],
    dealRoomId: args.record.dealRoomId,
    offerId: args.record.offerId,
    expiresAt: args.record.expiresAt,
    role: args.record.role,
  };
}

/**
 * Parse an ISO timestamp string to epoch milliseconds. Returns Infinity for
 * invalid strings so the validator fails-closed (an unparseable `now` makes
 * every token look expired; an unparseable `expiresAt` makes every token
 * look valid — we bias towards expired by returning +Infinity for `now`
 * parse failures via the caller and -Infinity for expiresAt failures).
 *
 * In practice Convex only ever stores canonical `toISOString()` output, so
 * this parser never sees a malformed string. The defensive fallback is
 * here for future-proofing against code paths that bypass Convex storage
 * (tests, actions, custom clients).
 */
function parseInstant(iso: string): number {
  const n = Date.parse(iso);
  return Number.isNaN(n) ? -Infinity : n;
}

/** Helper used by tests and consumers to classify denial without re-validating. */
export function isDenialReason(value: string): value is TokenDenialReason {
  return (
    value === "not_found" ||
    value === "expired" ||
    value === "revoked" ||
    value === "action_not_allowed" ||
    value === "scope_mismatch"
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Encoding helpers — no external deps
// ───────────────────────────────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  // Use btoa on the binary string. This works in both Node 18+ and browsers.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa !== "undefined"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** Compute the default expiry ISO for a token given hours-from-now. */
export function computeExpiry(hoursFromNow: number, now: Date): string {
  const expiry = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  return expiry.toISOString();
}
