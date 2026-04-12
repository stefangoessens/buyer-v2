import type { SourcePlatform } from "./types";

interface PatternMatch {
  listingId: string;
  addressHint: string | null;
}

type PatternMatcher = (url: URL) => PatternMatch | null;

/**
 * Zillow patterns:
 * - zillow.com/homedetails/{address}/{zpid}_zpid/
 * - zillow.com/homes/{zpid}_zpid/
 * - zillow.com/b/{something}/
 * Extract zpid from path
 */
function matchZillow(url: URL): PatternMatch | null {
  const zpidMatch = url.pathname.match(/(\d+)_zpid/);
  if (zpidMatch) {
    const addressMatch = url.pathname.match(/\/homedetails\/([^/]+)\//);
    let addressHint: string | null = null;
    if (addressMatch) {
      try {
        addressHint = decodeURIComponent(addressMatch[1]).replace(/-/g, " ");
      } catch {
        addressHint = addressMatch[1].replace(/-/g, " ");
      }
    }
    return { listingId: zpidMatch[1], addressHint };
  }
  return null;
}

/**
 * Redfin patterns:
 * - redfin.com/{state}/{city}/{address}/home/{id}
 * Extract home ID from path
 */
function matchRedfin(url: URL): PatternMatch | null {
  const homeMatch = url.pathname.match(/\/home\/(\d+)/);
  if (homeMatch) {
    const pathParts = url.pathname.split("/home/")[0].split("/").filter(Boolean);
    const addressHint =
      pathParts.length >= 3
        ? pathParts.slice(2).join(" ").replace(/-/g, " ")
        : null;
    return { listingId: homeMatch[1], addressHint };
  }
  return null;
}

/**
 * Realtor.com patterns:
 * - realtor.com/realestateandhomes-detail/{address}
 * - realtor.com/realestateandhomes-detail/M{mls-id}
 * Extract from path
 */
function matchRealtor(url: URL): PatternMatch | null {
  const detailMatch = url.pathname.match(
    /\/realestateandhomes-detail\/([^/]+)/,
  );
  if (detailMatch) {
    const slug = detailMatch[1];
    const addressHint = slug.startsWith("M") ? null : slug.replace(/_/g, " ");
    return { listingId: slug, addressHint };
  }
  return null;
}

/** Portal domain -> platform + matcher mapping */
export const PORTAL_MATCHERS: Array<{
  platform: SourcePlatform;
  domains: string[];
  match: PatternMatcher;
}> = [
  {
    platform: "zillow",
    domains: ["zillow.com", "www.zillow.com"],
    match: matchZillow,
  },
  {
    platform: "redfin",
    domains: ["redfin.com", "www.redfin.com"],
    match: matchRedfin,
  },
  {
    platform: "realtor",
    domains: ["realtor.com", "www.realtor.com"],
    match: matchRealtor,
  },
];
