// ═══════════════════════════════════════════════════════════════════════════
// Lead Attribution (KIN-819) — pure TypeScript
//
// Parses visitor marketing attribution from UTM parameters and referrer
// data into a typed `Touch` object. Used by both the Next.js app (to
// capture touches on public requests) and by the Convex mirror at
// `convex/lib/attribution.ts` during the handoff mutation.
//
// This file is the canonical implementation; `convex/lib/attribution.ts`
// is a hand-maintained byte-for-byte mirror because Convex's tsconfig
// cannot import from `../src`. Any change here MUST be mirrored there
// and vice versa.
//
// Design contract:
//   - All functions are pure — they take typed inputs and return typed
//     outputs, with no I/O and no global state. Testability is the
//     highest priority.
//   - All timestamps are ISO 8601 UTC strings so they round-trip through
//     Convex without custom codecs.
//   - When UTM parameters are present they always win over referrer
//     inference. UTMs are explicit signals the marketer attached to
//     the link; we never second-guess them.
//   - When UTM parameters are absent we fall back to referrer inference
//     using a small allowlist of known search and social hosts. Unknown
//     referrers are classified as "referral" with the raw hostname as
//     the source. Missing referrers are "direct / none".
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single captured marketing touch — the shape persisted on both
 * `leadAttribution.firstTouch` and `leadAttribution.lastTouch`.
 */
export interface Touch {
  /** Traffic source. E.g. "google", "facebook", "direct", "newsletter". */
  source: string;
  /** Medium. E.g. "cpc", "organic", "email", "social", "referral", "none". */
  medium: string;
  /** Optional campaign name (utm_campaign). */
  campaign?: string;
  /** Optional ad creative identifier (utm_content). */
  content?: string;
  /** Optional search term (utm_term). */
  term?: string;
  /** Path-and-query of the landing page the visitor arrived on. */
  landingPage: string;
  /** Raw referrer URL if present. */
  referrer?: string;
  /** ISO 8601 UTC timestamp when the touch was captured. */
  timestamp: string;
}

/**
 * Hostnames treated as search engines when inferring source from a
 * referrer. Order does not matter; match is by "host === h" or
 * "host ends with .h".
 */
export const SEARCH_ENGINE_HOSTS: readonly string[] = [
  "google.com",
  "google.co",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "brave.com",
  "search.brave.com",
];

/**
 * Hostnames treated as social networks when inferring source from a
 * referrer. Order does not matter; match is by "host === h" or
 * "host ends with .h".
 */
export const SOCIAL_HOSTS: readonly string[] = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
  "reddit.com",
  "pinterest.com",
  "youtube.com",
];

/**
 * Extract the hostname from a referrer URL. Returns null if the URL is
 * missing, malformed, or has no host component.
 */
function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = trimmed.startsWith("http")
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    if (!host) return null;
    // Strip leading "www." so "www.google.com" and "google.com" match.
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * Return the allowlist entry that matches the given hostname, either
 * exactly or as a subdomain. Returns null on miss.
 */
function matchAllowlist(
  host: string,
  allowlist: readonly string[]
): string | null {
  for (const h of allowlist) {
    if (host === h) return h;
    if (host.endsWith(`.${h}`)) return h;
  }
  return null;
}

/**
 * Canonical short name for a known host — the part before the first dot,
 * e.g. "google.com" → "google", "x.com" → "x".
 */
function shortNameFor(host: string): string {
  const firstDot = host.indexOf(".");
  return firstDot === -1 ? host : host.slice(0, firstDot);
}

/**
 * Infer the source and medium of a visit from a referrer URL.
 *
 *   - No referrer / malformed → { source: "direct", medium: "none" }
 *   - Known search host → { source: <short name of matched entry>, medium: "organic" }
 *   - Known social host → { source: <short name of matched entry>, medium: "social" }
 *   - Any other host → { source: <host>, medium: "referral" }
 *
 * When the referrer is a subdomain of an allowlisted host (e.g.
 * `news.google.com`) we use the short name of the MATCHED ENTRY
 * (`google`), not the raw hostname (`news`) — otherwise mail.google
 * and news.google would look like different sources.
 */
export function inferSourceFromReferrer(referrer?: string): {
  source: string;
  medium: string;
} {
  const host = hostnameOf(referrer);
  if (!host) return { source: "direct", medium: "none" };

  const searchMatch = matchAllowlist(host, SEARCH_ENGINE_HOSTS);
  if (searchMatch) {
    return { source: shortNameFor(searchMatch), medium: "organic" };
  }
  const socialMatch = matchAllowlist(host, SOCIAL_HOSTS);
  if (socialMatch) {
    return { source: shortNameFor(socialMatch), medium: "social" };
  }
  return { source: host, medium: "referral" };
}

/**
 * Normalize an optional UTM parameter value — treats empty strings,
 * whitespace-only values, and missing values as absent.
 */
function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Parse UTM parameters and referrer context into a `Touch`.
 *
 * UTM precedence:
 *   - If `utm_source` is present and non-empty it wins. `utm_medium`
 *     defaults to "unknown" when `utm_source` is supplied without a
 *     medium — we never silently promote a known referrer over an
 *     explicit marketer tag.
 *   - Otherwise we infer source/medium from the referrer via
 *     `inferSourceFromReferrer`.
 *
 * The `timestamp` argument is optional and defaults to "now" so callers
 * on the request path don't have to plumb a clock. Tests SHOULD always
 * pass an explicit timestamp to keep assertions deterministic.
 */
export function parseUtmParams(params: {
  url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landingPage: string;
  timestamp?: string;
}): Touch {
  const utmSource = cleanOptional(params.utm_source);
  const utmMedium = cleanOptional(params.utm_medium);
  const campaign = cleanOptional(params.utm_campaign);
  const content = cleanOptional(params.utm_content);
  const term = cleanOptional(params.utm_term);
  const referrer = cleanOptional(params.referrer);
  const timestamp = params.timestamp ?? new Date().toISOString();

  let source: string;
  let medium: string;
  if (utmSource) {
    source = utmSource;
    medium = utmMedium ?? "unknown";
  } else {
    const inferred = inferSourceFromReferrer(referrer);
    source = inferred.source;
    medium = inferred.medium;
  }

  const touch: Touch = {
    source,
    medium,
    landingPage: params.landingPage,
    timestamp,
  };
  if (campaign !== undefined) touch.campaign = campaign;
  if (content !== undefined) touch.content = content;
  if (term !== undefined) touch.term = term;
  if (referrer !== undefined) touch.referrer = referrer;
  return touch;
}

/**
 * Decide whether two touches represent distinct visits. Used by the
 * Convex capture mutation to decide whether to bump `lastTouch` and
 * `touchCount` or leave the existing row alone.
 *
 * Two touches are distinct when any of `source`, `medium`, or
 * `campaign` differ. Landing page and referrer are ignored on purpose
 * — a visitor bouncing between two pages of the same campaign is still
 * the same touch.
 */
export function isDistinctTouch(previous: Touch, next: Touch): boolean {
  if (previous.source !== next.source) return true;
  if (previous.medium !== next.medium) return true;
  if ((previous.campaign ?? "") !== (next.campaign ?? "")) return true;
  return false;
}
