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

// ─── Merge Engine Types ─────────────────────────────────────────────────────

/** Source priority for conflict resolution (lower = higher priority) */
export const SOURCE_PRIORITY: Record<string, number> = {
  county: 0, // County records highest priority for tax/legal
  zillow: 1,
  redfin: 2,
  realtor: 3,
  manual: 4,
};

/** Per-field provenance tracking */
export interface FieldProvenance {
  source: string;
  value: unknown;
  confidence: number; // 0-1
  fetchedAt: string;
  conflictFlag: boolean;
}

/** Source record input for merge */
export interface SourceRecord {
  sourcePlatform: string;
  fetchedAt: string;
  data: Record<string, unknown>;
}

/** Result of merging multiple source records */
export interface MergeResult {
  mergedFields: Record<string, unknown>;
  provenance: Record<string, FieldProvenance>;
  conflicts: Array<{
    field: string;
    sources: Array<{ platform: string; value: unknown }>;
    resolved: unknown;
    resolution: string;
  }>;
  sourceCount: number;
  mergedAt: string;
}
