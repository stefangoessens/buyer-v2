export type {
  SourcePlatform,
  ParseErrorCode,
  ParseError,
  PortalMetadata,
  ParseResult,
} from "../../../packages/shared/src/intake-parser";

// ─── Merge Engine Types ─────────────────────────────────────────────────────

/** Source priority for conflict resolution (lower = higher priority) */
export const SOURCE_PRIORITY: Record<string, number> = {
  zillow: 1,
  redfin: 2,
  realtor: 3,
  county: 4, // County is NOT globally highest — only preferred for tax/legal via getFieldPriority
  manual: 5,
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
