// ═══════════════════════════════════════════════════════════════════════════
// Waitlist signup validation helpers (KIN-1088).
//
// Pure, side-effect-free validation logic for the public
// `waitlistSignups.upsert` mutation. Lives in `convex/lib` so the
// mutation imports it directly and so vitest can unit-test it without a
// running Convex environment (matches the existing pattern used by
// `convex/lib/externalAccessSession.ts`, `convex/lib/promptVersion.ts`,
// and friends).
//
// Why a separate file: the upsert mutation needs DB access for dedupe
// and rate limiting, but the regex/normalization logic is pure and
// must be exercised by tests. Splitting them keeps the mutation focused
// and the validators testable.
// ═══════════════════════════════════════════════════════════════════════════

/** Reasons the mutation can refuse a submission. */
export type WaitlistRejectReason =
  | "honeypot"
  | "rate_limited"
  | "invalid_email"
  | "invalid_state"
  | "invalid_zip";

/** Result returned by the upsert mutation. */
export type WaitlistUpsertResult =
  | { ok: true }
  | { ok: false; reason: WaitlistRejectReason };

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * Minimal RFC-5321-ish email regex: `local@domain.tld`. We deliberately
 * keep this loose — strict validation belongs at delivery time, not at
 * the demand-capture boundary.
 */
export const WAITLIST_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** US zip is exactly 5 digits. We do not accept ZIP+4 here. */
export const WAITLIST_ZIP_REGEX = /^\d{5}$/;

/** Two uppercase letters — matches the `values()` of `US_STATES`. */
export const WAITLIST_STATE_CODE_REGEX = /^[A-Z]{2}$/;

/**
 * Refuse a re-submit on the same (email, state) pair within this window.
 * Tuned to absorb double-clicks and bounce-back retries while still
 * letting a human correct a typo within a few seconds.
 */
export const WAITLIST_RATE_LIMIT_WINDOW_MS = 60_000;

// ─── Pure helpers ─────────────────────────────────────────────────────────

/** Lowercase + trim. Always run before storing or comparing. */
export function normalizeWaitlistEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Trim + uppercase. Always run before storing or comparing. */
export function normalizeWaitlistStateCode(stateCode: string): string {
  return stateCode.trim().toUpperCase();
}

/**
 * Bots tend to fill hidden inputs; humans leave them blank. Returns
 * `true` when the request is a bot — the mutation should reject.
 */
export function isWaitlistHoneypotTripped(
  honeypot: string | undefined,
): boolean {
  return typeof honeypot === "string" && honeypot.length > 0;
}

/** True when the normalized email passes the loose regex check. */
export function isValidWaitlistEmail(normalizedEmail: string): boolean {
  return WAITLIST_EMAIL_REGEX.test(normalizedEmail);
}

/** True when the normalized state code is exactly two uppercase letters. */
export function isValidWaitlistStateCode(upperState: string): boolean {
  return WAITLIST_STATE_CODE_REGEX.test(upperState);
}

/**
 * `undefined` and empty strings are accepted (zip is optional). When
 * present, the value must be exactly 5 digits.
 */
export function isValidWaitlistZip(zip: string | undefined): boolean {
  if (zip === undefined || zip === "") return true;
  return WAITLIST_ZIP_REGEX.test(zip);
}

/**
 * Returns true when the timestamp `lastUpdatedAtIso` is within the
 * rate-limit window relative to `nowMs`. Tolerates malformed ISO
 * strings by treating them as "long ago" (no rate limit applied).
 */
export function isWithinWaitlistRateLimitWindow(
  lastUpdatedAtIso: string,
  nowMs: number,
): boolean {
  const last = Date.parse(lastUpdatedAtIso);
  if (Number.isNaN(last)) return false;
  return nowMs - last < WAITLIST_RATE_LIMIT_WINDOW_MS;
}
