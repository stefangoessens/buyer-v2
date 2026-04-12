import type { ParseResult } from "./types";
import { PORTAL_MATCHERS } from "./patterns";

/**
 * Parse a real estate portal URL into normalized metadata.
 *
 * Supports Zillow, Redfin, and Realtor.com URLs.
 * Returns a typed result: success with metadata, or failure with error code.
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
