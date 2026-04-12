// ═══════════════════════════════════════════════════════════════════════════
// SMS Intake Helpers (KIN-776)
//
// Pure TS helpers used by the Convex webhook handler and by tests. No Twilio
// SDK, no network calls, no Convex imports — the Twilio webhook validation
// and the persistence live in the Convex layer (convex/smsIntake.ts), and
// the Convex runtime loads a byte-for-byte mirror of this module from
// `convex/lib/smsIntakeCompute.ts` because Convex cannot import `src/`.
//
// Scope of this module:
//   - classify an inbound SMS body (STOP / START / HELP / URL / text / empty)
//   - extract the first plausible URL from a message body
//   - normalize and hash phone numbers (SHA-256, hex) so the backend never
//     stores raw phone numbers for consent tracking
//   - build and verify HMAC-SHA256 signed reply links so a link we text a
//     user can't be forged or replayed past its expiry
//
// All crypto goes through the Web Crypto API, which is available in the
// Convex Node runtime, in Node 20+, and in Vitest. No external dependencies.
// ═══════════════════════════════════════════════════════════════════════════

/** CTIA / TCPA conventional STOP (opt-out) keywords. */
export const STOP_KEYWORDS: readonly string[] = [
  "STOP",
  "CANCEL",
  "QUIT",
  "END",
  "OPTOUT",
  "OPT-OUT",
  "UNSUBSCRIBE",
];

/** Supported START (re-opt-in) keywords. */
export const START_KEYWORDS: readonly string[] = ["START", "UNSTOP", "YES"];

/** HELP keyword — must always respond regardless of opt-out state. */
export const HELP_KEYWORDS: readonly string[] = ["HELP", "INFO"];

/**
 * Classified inbound SMS intent. Callers switch on `kind` to decide what
 * to do next — the classifier itself is pure and never touches state.
 */
export type SmsIntakeIntent =
  | { kind: "stop" }
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "url"; url: string }
  | { kind: "empty" }
  | { kind: "text_only"; text: string };

// ───────────────────────────────────────────────────────────────────────────
// Classification
// ───────────────────────────────────────────────────────────────────────────

/**
 * Classify an inbound SMS body into a parse intent.
 *
 * Decision order:
 *   1. Empty body → `empty`
 *   2. Exact keyword match (case-insensitive, trimmed) for STOP / START / HELP
 *   3. Any URL found via `extractUrl` → `url`
 *   4. Fallback → `text_only`
 *
 * Keyword detection tolerates surrounding whitespace and mixed case, but
 * requires the whole trimmed body to equal the keyword. Long messages that
 * happen to contain "stop" inside a sentence are NOT opt-outs — that's
 * the CTIA guidance and keeps us from accidentally suppressing users who
 * type "I want to stop by the open house".
 */
export function classifyInboundSms(body: string): SmsIntakeIntent {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { kind: "empty" };
  }

  const upper = trimmed.toUpperCase();

  if (STOP_KEYWORDS.includes(upper)) {
    return { kind: "stop" };
  }
  if (START_KEYWORDS.includes(upper)) {
    return { kind: "start" };
  }
  if (HELP_KEYWORDS.includes(upper)) {
    return { kind: "help" };
  }

  const url = extractUrl(trimmed);
  if (url) {
    return { kind: "url", url };
  }

  return { kind: "text_only", text: trimmed };
}

/**
 * Extract the first URL from a message body. Handles URLs with or without
 * a protocol, with trailing punctuation, and surrounded by other text.
 *
 * Behaviour:
 *   - Prefers URLs with an explicit protocol via the first regex pass.
 *   - Falls back to a second pass that recognises bare domains for the
 *     supported real-estate portals (zillow.com / redfin.com / realtor.com)
 *     so users who paste a copied link without the `https://` prefix still
 *     get the happy path.
 *   - Strips trailing punctuation commonly found at the end of sentences
 *     so "Check this out: https://zillow.com/..." doesn't leak a dangling
 *     period or comma into the stored URL.
 *   - Returns `null` when no URL-like token is found.
 */
export function extractUrl(body: string): string | null {
  if (!body) return null;

  // Pass 1: any http(s) URL anywhere in the body.
  const withProtocol = body.match(/https?:\/\/[^\s]+/i);
  if (withProtocol) {
    return stripTrailingPunctuation(withProtocol[0]);
  }

  // Pass 2: bare portal domain with a path, e.g. `zillow.com/homedetails/...`.
  // We only recognise the supported portals here — a stray "example.com"
  // shouldn't be interpreted as a listing link.
  const bareDomain = body.match(
    /\b((?:www\.)?(?:zillow\.com|redfin\.com|realtor\.com)\/[^\s]+)/i,
  );
  if (bareDomain) {
    return stripTrailingPunctuation(bareDomain[1]);
  }

  return null;
}

/**
 * Remove trailing punctuation frequently appended after a URL in prose.
 * We deliberately do NOT strip closing characters that could legitimately
 * be part of a path (e.g. `/`), and we keep stripping until we hit a
 * character that isn't terminal punctuation.
 */
function stripTrailingPunctuation(url: string): string {
  const terminals = new Set([
    ".",
    "?",
    "!",
    ",",
    ";",
    ":",
    ")",
    "}",
    "]",
    '"',
    "'",
  ]);
  let end = url.length;
  while (end > 0 && terminals.has(url.charAt(end - 1))) {
    end -= 1;
  }
  return url.slice(0, end);
}

// ───────────────────────────────────────────────────────────────────────────
// Phone numbers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Normalize a phone number to E.164 format (e.g. `+13055551234`).
 *
 * This is a deliberately small implementation — we do NOT try to emulate
 * libphonenumber. The rules are:
 *   - keep only digits and a leading `+`
 *   - if the input already starts with `+`, trust whatever follows (as
 *     long as it's 8-15 digits per E.164)
 *   - otherwise, treat it as a US/CA number: 10 digits → prepend `+1`,
 *     11 digits starting with `1` → prepend `+`
 *   - everything else → return null
 *
 * Returns `null` for empty or obviously non-phone input. The caller
 * (the Convex mutation) still validates that the hashed result is
 * stable before using it as a consent key.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  // Strip everything that isn't a digit. We intentionally drop the `+`
  // here because we re-add it based on the detection below.
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (hasPlus) {
    // Any explicit country code — accept anything in the E.164 digit range.
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // No country code on the input — default to US/CA (+1).
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Hash a (preferably already-normalized) phone number with SHA-256 and
 * return the lowercase hex digest. Used as the consent key and intake
 * dedupe key since we never store raw phone numbers in the backend.
 *
 * Uses the Web Crypto API, which works in Convex's Node runtime AND in
 * Vitest/Node 20+ tests. No external dependency.
 */
export async function hashPhone(normalized: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

// ───────────────────────────────────────────────────────────────────────────
// Signed reply links
// ───────────────────────────────────────────────────────────────────────────

/** Default max age for a signed link — 7 days (matches task spec). */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build a signed reply link using HMAC-SHA256 with a shared secret.
 *
 * Format: `<baseUrl>/deal-room/<dealRoomId>?t=<timestamp>&sig=<hmacHex>`
 *
 * The signature covers `<dealRoomId>:<timestamp>` so links can't be forged
 * or replayed past the expiry — and swapping the dealRoomId in the URL
 * invalidates the signature.
 *
 * `baseUrl` is trimmed of trailing slashes so callers can pass either
 * `https://example.com` or `https://example.com/` and get the same result.
 */
export async function buildSignedLink(
  baseUrl: string,
  dealRoomId: string,
  secret: string,
  timestamp?: number,
): Promise<string> {
  const ts = timestamp ?? Date.now();
  const payload = `${dealRoomId}:${ts}`;
  const sig = await hmacSha256Hex(secret, payload);
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/deal-room/${dealRoomId}?t=${ts}&sig=${sig}`;
}

/**
 * Verify a signed link built by `buildSignedLink`.
 *
 * Returns either `{ valid: true, dealRoomId }` or `{ valid: false, reason }`.
 * Reasons:
 *   - `malformed_url` — not a parseable URL at all
 *   - `missing_params` — no t/sig query parameter
 *   - `missing_deal_room` — couldn't extract the deal-room id from the path
 *   - `expired` — older than `maxAgeMs`
 *   - `future` — timestamp in the future (clock skew / tampering)
 *   - `bad_signature` — recomputed HMAC doesn't match
 *
 * The signature comparison uses a constant-time compare so we don't leak
 * which byte mismatched.
 */
export async function verifySignedLink(
  url: string,
  secret: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<
  { valid: true; dealRoomId: string } | { valid: false; reason: string }
> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "malformed_url" };
  }

  const match = parsed.pathname.match(/\/deal-room\/([^/?#]+)/);
  if (!match) {
    return { valid: false, reason: "missing_deal_room" };
  }
  const dealRoomId = match[1];

  const tRaw = parsed.searchParams.get("t");
  const sig = parsed.searchParams.get("sig");
  if (!tRaw || !sig) {
    return { valid: false, reason: "missing_params" };
  }

  const ts = Number.parseInt(tRaw, 10);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { valid: false, reason: "missing_params" };
  }

  const now = Date.now();
  if (ts > now + 60_000) {
    // Allow a tiny bit of clock skew, but anything meaningfully in the
    // future is either tampering or a broken signer — treat it as invalid.
    return { valid: false, reason: "future" };
  }
  if (now - ts > maxAgeMs) {
    return { valid: false, reason: "expired" };
  }

  const expected = await hmacSha256Hex(secret, `${dealRoomId}:${ts}`);
  if (!constantTimeEqualHex(expected, sig)) {
    return { valid: false, reason: "bad_signature" };
  }

  return { valid: true, dealRoomId };
}

// ───────────────────────────────────────────────────────────────────────────
// Crypto primitives
// ───────────────────────────────────────────────────────────────────────────

/** Compute HMAC-SHA256 over `message` with `key` and return lowercase hex. */
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return bytesToHex(new Uint8Array(sig));
}

/** Convert a byte array to a lowercase hex string. */
function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Constant-time comparison for two hex strings of equal expected length.
 * Returns false immediately for mismatched lengths (that's safe — the
 * attacker already knows the expected length from the signer's output).
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
