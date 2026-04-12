// ═══════════════════════════════════════════════════════════════════════════
// Lead Attribution (KIN-819) — CONVEX MIRROR
//
// This file is a hand-maintained mirror of
// `src/lib/marketing/attribution.ts`. Convex's tsconfig cannot import
// modules from `../src`, so the pure computation logic has to live
// twice: once for the Next.js app, once for Convex functions.
//
// RULES:
//   - Any change here MUST be mirrored in src/lib/marketing/attribution.ts
//   - Any change there MUST be mirrored here
//   - The exported shapes (types + function signatures) are identical
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single captured marketing touch — the shape persisted on both
 * `leadAttribution.firstTouch` and `leadAttribution.lastTouch`.
 */
export interface Touch {
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
  term?: string;
  landingPage: string;
  referrer?: string;
  timestamp: string;
}

export const SEARCH_ENGINE_HOSTS: readonly string[] = [
  "google.com",
  "google.co",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "brave.com",
  "search.brave.com",
];

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
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

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

function shortNameFor(host: string): string {
  const firstDot = host.indexOf(".");
  return firstDot === -1 ? host : host.slice(0, firstDot);
}

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

function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

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

export function isDistinctTouch(previous: Touch, next: Touch): boolean {
  if (previous.source !== next.source) return true;
  if (previous.medium !== next.medium) return true;
  if ((previous.campaign ?? "") !== (next.campaign ?? "")) return true;
  return false;
}
