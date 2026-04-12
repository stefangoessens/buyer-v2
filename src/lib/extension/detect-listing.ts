/**
 * Chrome extension listing page detection (KIN-816).
 *
 * Pure TS — imported by both the extension build and Vitest. The
 * extension background worker calls `detectListingPage(tab.url)` on
 * every tab update to decide whether to enable the action badge and
 * offer the "Save to buyer-v2" CTA.
 *
 * Detection reuses the canonical listing URL parser from KIN-774
 * (parseListingUrl) so supported portal rules live in exactly one
 * place. The extension never duplicates portal parsing logic — it
 * forwards the canonical URL to the backend intake flow and lets
 * Convex mutations handle the rest.
 */

import { parseListingUrl } from "@/lib/intake/parser";

export type DetectionStatus =
  /** URL is a recognizable listing on a supported portal. */
  | "supported_listing"
  /** URL is on a supported portal but missing a listing ID (index page). */
  | "supported_portal_no_listing"
  /** URL is not on any supported portal. */
  | "unsupported_portal"
  /** URL is malformed or unparseable. */
  | "invalid_url"
  /** URL is empty or missing (e.g. chrome://newtab). */
  | "empty";

export interface DetectionResult {
  status: DetectionStatus;
  /** The portal platform if detected. */
  platform?: "zillow" | "redfin" | "realtor";
  /** The listing ID if extracted. */
  listingId?: string;
  /** The normalized URL to forward to the intake backend. */
  normalizedUrl?: string;
  /** Human-readable message for the popup UI. */
  message: string;
}

/**
 * Detect whether a URL is a forwarded-eligible listing page. Returns
 * a typed result so the extension popup and background worker can
 * render the right UI state without re-parsing the URL.
 */
export function detectListingPage(url: string | undefined): DetectionResult {
  if (!url || url.trim().length === 0) {
    return { status: "empty", message: "No URL on the current tab." };
  }

  // Extension-specific URLs (chrome://, about:, moz-extension://, etc.)
  // are never listings — fail fast without running the parser.
  if (
    url.startsWith("chrome://") ||
    url.startsWith("about:") ||
    url.startsWith("moz-extension://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://")
  ) {
    return { status: "empty", message: "Browser internal page." };
  }

  const parsed = parseListingUrl(url);

  if (parsed.success) {
    return {
      status: "supported_listing",
      platform: parsed.data.platform,
      listingId: parsed.data.listingId,
      normalizedUrl: parsed.data.normalizedUrl,
      message: `${portalLabel(parsed.data.platform)} listing detected. Click to save to buyer-v2.`,
    };
  }

  // Map parser error codes into detection states the extension can render.
  switch (parsed.error.code) {
    case "malformed_url":
      return { status: "invalid_url", message: "Invalid URL on the current tab." };
    case "missing_listing_id":
      return {
        status: "supported_portal_no_listing",
        message:
          "Supported portal, but this page isn't a specific listing. Open a listing page first.",
      };
    case "unsupported_url":
      return {
        status: "unsupported_portal",
        message:
          "Not a supported listing portal. buyer-v2 supports Zillow, Redfin, and Realtor.com.",
      };
    default:
      return { status: "unsupported_portal", message: "Not a supported listing." };
  }
}

function portalLabel(platform: "zillow" | "redfin" | "realtor"): string {
  switch (platform) {
    case "zillow":
      return "Zillow";
    case "redfin":
      return "Redfin";
    case "realtor":
      return "Realtor.com";
  }
}

/**
 * Build the buyer-v2 intake URL that the extension should forward the
 * detected listing to. The extension opens this in a new tab, which
 * lands the user on the canonical intake flow regardless of auth state
 * — the web app handles signed-in / signed-out / duplicate routing.
 *
 * The `?source=extension` parameter lets the backend/analytics layer
 * attribute the intake correctly (matches KIN-860 analytics taxonomy).
 */
export function buildIntakeForwardUrl(
  buyerV2BaseUrl: string,
  normalizedListingUrl: string,
): string {
  const base = buyerV2BaseUrl.replace(/\/$/, "");
  const encoded = encodeURIComponent(normalizedListingUrl);
  return `${base}/intake?url=${encoded}&source=extension`;
}
