// ═══════════════════════════════════════════════════════════════════════════
// SMS Intake Helpers (KIN-776) — CONVEX MIRROR
//
// This file is a hand-maintained mirror of `src/lib/intake/sms.ts`. Convex's
// tsconfig cannot import from `../src`, so the pure helpers used by the
// SMS webhook handler have to live twice: once for Next.js + tests, and
// once for Convex functions.
//
// RULES:
//   - Any change here MUST be mirrored in `src/lib/intake/sms.ts`
//   - Any change there MUST be mirrored here
//   - Keep the module pure: no Convex imports, no DB, no Twilio SDK
//   - Crypto goes through the Web Crypto API which exists in both runtimes
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
 */
export function extractUrl(body: string): string | null {
  if (!body) return null;

  // Pass 1: any http(s) URL anywhere in the body.
  const withProtocol = body.match(/https?:\/\/[^\s]+/i);
  if (withProtocol) {
    return stripTrailingPunctuation(withProtocol[0]);
  }

  // Pass 2: bare portal domain with a path.
  const bareDomain = body.match(
    /\b((?:www\.)?(?:zillow\.com|redfin\.com|realtor\.com)\/[^\s]+)/i,
  );
  if (bareDomain) {
    return stripTrailingPunctuation(bareDomain[1]);
  }

  return null;
}

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
 * See `src/lib/intake/sms.ts` for the full rule description.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

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
 * Format: `<baseUrl>/deal-room/<dealRoomId>?t=<timestamp>&sig=<hmacHex>`
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
 * Returns `{ valid: true, dealRoomId }` or `{ valid: false, reason }`.
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

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
