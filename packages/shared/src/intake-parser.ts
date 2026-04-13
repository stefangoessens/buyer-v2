/** Supported real estate portal platforms. */
export type SourcePlatform = "zillow" | "redfin" | "realtor";

/** Error codes for parse failures. */
export type ParseErrorCode =
  | "unsupported_url"
  | "malformed_url"
  | "invalid_domain"
  | "missing_listing_id";

/** Parse error with typed code. */
export interface ParseError {
  code: ParseErrorCode;
  message: string;
}

/** Normalized metadata extracted from a portal URL. */
export interface PortalMetadata {
  platform: SourcePlatform;
  listingId: string;
  normalizedUrl: string;
  addressHint: string | null;
  rawUrl: string;
}

/** Discriminated union result for URL parsing. */
export type ParseResult =
  | { success: true; data: PortalMetadata }
  | { success: false; error: ParseError };

interface PatternMatch {
  listingId: string;
  addressHint: string | null;
}

type PatternMatcher = (url: URL) => PatternMatch | null;

function matchZillow(url: URL): PatternMatch | null {
  const zpidMatch = url.pathname.match(/(\d+)_zpid/);
  if (!zpidMatch) return null;

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

function matchRedfin(url: URL): PatternMatch | null {
  const homeMatch = url.pathname.match(/\/home\/(\d+)/);
  if (!homeMatch) return null;

  const pathParts = url.pathname.split("/home/")[0].split("/").filter(Boolean);
  const addressHint =
    pathParts.length >= 3
      ? pathParts.slice(2).join(" ").replace(/-/g, " ")
      : null;
  return { listingId: homeMatch[1], addressHint };
}

function matchRealtor(url: URL): PatternMatch | null {
  const detailMatch = url.pathname.match(
    /\/realestateandhomes-detail\/([^/]+)/,
  );
  if (!detailMatch) return null;

  const slug = detailMatch[1];
  const addressHint = slug.startsWith("M") ? null : slug.replace(/_/g, " ");
  return { listingId: slug, addressHint };
}

const PORTAL_MATCHERS: Array<{
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

/**
 * Parse a real estate portal URL into canonical metadata.
 *
 * Supports Zillow, Redfin, and Realtor.com URLs and normalizes the returned
 * source URL so every intake surface can dedupe the same listing the same way.
 */
export function parseListingUrl(input: string): ParseResult {
  const trimmed = input.trim();

  let url: URL;
  try {
    const withProtocol = trimmed.startsWith("http")
      ? trimmed
      : `https://${trimmed}`;
    url = new URL(withProtocol);
  } catch {
    return {
      success: false,
      error: {
        code: "malformed_url",
        message: "Input is not a valid URL",
      },
    };
  }

  const hostname = url.hostname.toLowerCase();

  for (const portal of PORTAL_MATCHERS) {
    if (
      !portal.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))
    ) {
      continue;
    }

    const match = portal.match(url);
    if (!match) {
      return {
        success: false,
        error: {
          code: "missing_listing_id",
          message: `URL appears to be ${portal.platform} but no listing ID could be extracted`,
        },
      };
    }

    const normalized = new URL(url.pathname, `https://${portal.domains[0]}`);

    return {
      success: true,
      data: {
        platform: portal.platform,
        listingId: match.listingId,
        normalizedUrl: normalized.toString(),
        addressHint: match.addressHint,
        rawUrl: trimmed,
      },
    };
  }

  return {
    success: false,
    error: {
      code: "unsupported_url",
      message: `URL domain "${hostname}" is not a supported real estate portal. Supported: Zillow, Redfin, Realtor.com`,
    },
  };
}
