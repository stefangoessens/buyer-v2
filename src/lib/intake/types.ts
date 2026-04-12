/** Supported real estate portal platforms */
export type SourcePlatform = "zillow" | "redfin" | "realtor";

/** Error codes for parse failures */
export type ParseErrorCode =
  | "unsupported_url" // Valid URL but not a supported portal
  | "malformed_url" // Not a valid URL at all
  | "invalid_domain" // URL domain doesn't match any portal
  | "missing_listing_id"; // Portal URL but can't extract listing ID

/** Parse error with typed code */
export interface ParseError {
  code: ParseErrorCode;
  message: string;
}

/** Normalized metadata extracted from a portal URL */
export interface PortalMetadata {
  platform: SourcePlatform;
  listingId: string;
  normalizedUrl: string;
  addressHint: string | null;
  rawUrl: string;
}

/** Discriminated union result */
export type ParseResult =
  | { success: true; data: PortalMetadata }
  | { success: false; error: ParseError };
