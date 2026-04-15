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
 * Canonical set of US state codes accepted by the waitlist mutation.
 * Mirrors the values of `US_STATES` in `src/lib/intake/address.ts` —
 * convex can't import from `src/` directly, so we duplicate the list
 * here with a contract test. If a new code is added to US_STATES,
 * it MUST also be added here (the test in
 * `src/__tests__/convex/waitlistSignups.test.ts` asserts parity).
 *
 * Regex alone isn't enough: it would happily accept `ZZ` and pollute
 * state-level demand reporting. Codex KIN-1088 review asked for an
 * allowlist, so we require the normalized state code to be present
 * here before insert/patch.
 */
export const WAITLIST_ALLOWED_STATE_CODES: ReadonlySet<string> = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI",
  "WY", "PR",
]);

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

/**
 * True when the normalized state code is a known US state / territory
 * from the canonical allowlist. We intentionally check shape first so
 * a bogus input like `"aa"` (which would pass the lowercase regex step
 * only after normalization) still lands in the allowlist check via
 * the regex gate, and then the Set lookup rejects unknown codes.
 */
export function isValidWaitlistStateCode(upperState: string): boolean {
  return (
    WAITLIST_STATE_CODE_REGEX.test(upperState) &&
    WAITLIST_ALLOWED_STATE_CODES.has(upperState)
  );
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
