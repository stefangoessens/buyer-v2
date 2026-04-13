/**
 * Background enrichment pipeline types (KIN-782).
 *
 * Enrichment augments extracted property records with secondary data
 * sources: flood zones, public records, cross-portal matches, listing-agent
 * profile stats, and neighborhood market context. Jobs run async after
 * primary extraction so the deal room can progressively render as data
 * lands. Failures are isolated per source; a single failed source never
 * corrupts the canonical property record.
 */

// ───────────────────────────────────────────────────────────────────────────
// Source registry
// ───────────────────────────────────────────────────────────────────────────

/**
 * Every enrichment runs under one of these source names. Adding a source
 * means: 1) adding it here, 2) registering its worker in
 * `src/lib/ai/engines/enrichmentWorker.ts`, 3) extending the Convex
 * `enrichmentJobs.source` validator.
 */
export const ENRICHMENT_SOURCES = [
  "fema_flood",
  "county_appraiser",
  "census_geocode",
  "cross_portal_match",
  "listing_agent_profile",
  "neighborhood_market",
  "portal_estimates",
  "recent_sales",
  // KIN-784: Browser Use fallback runs when deterministic extraction fails.
  // Treated as an enrichment source so it reuses idempotency, retry, and
  // operator-visible status infrastructure. The actual Browser Use execution
  // lives in the Python worker; this is the orchestration contract.
  "browser_use_fallback",
] as const;

export type EnrichmentSource = (typeof ENRICHMENT_SOURCES)[number];

/** Sources that must succeed before the deal room considers a property
 * "enriched enough" to show AI engine output. Failures here still don't
 * corrupt the record — they just leave the UI in a degraded state. */
export const CRITICAL_SOURCES: readonly EnrichmentSource[] = [
  "cross_portal_match",
  "portal_estimates",
];

/** Default priority per source — lower number = higher priority. Browser
 * Use fallback sits at priority 5 because when it fires, the deterministic
 * extractor has already failed and the deal room is blocked waiting. */
export const SOURCE_PRIORITY: Record<EnrichmentSource, number> = {
  browser_use_fallback: 5,
  cross_portal_match: 10,
  portal_estimates: 20,
  census_geocode: 30,
  fema_flood: 40,
  county_appraiser: 50,
  listing_agent_profile: 60,
  neighborhood_market: 70,
  recent_sales: 80,
};

/** Default retry budget per source. Browser Use is expensive and flaky so
 * we cap at 2 attempts and escalate to manual ops after. */
export const SOURCE_MAX_ATTEMPTS: Record<EnrichmentSource, number> = {
  browser_use_fallback: 2,
  cross_portal_match: 2,
  portal_estimates: 3,
  census_geocode: 2,
  fema_flood: 3,
  county_appraiser: 3,
  listing_agent_profile: 2,
  neighborhood_market: 2,
  recent_sales: 2,
};

// ───────────────────────────────────────────────────────────────────────────
// Job lifecycle
// ───────────────────────────────────────────────────────────────────────────

export type EnrichmentJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface EnrichmentJob {
  propertyId: string;
  source: EnrichmentSource;
  status: EnrichmentJobStatus;
  attempt: number;
  maxAttempts: number;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRetryAt?: string;
  errorCode?: string;
  errorMessage?: string;
  dedupeKey: string;
  resultRef?: string;
  priority: number;
}

/** Result returned by a source worker after it finishes. */
export interface EnrichmentResult<T = unknown> {
  source: EnrichmentSource;
  propertyId: string;
  payload: T;
  /** Caller supplies a short citation — URL or source identifier. */
  citation: string;
  fetchedAt: string;
}

/** Typed error returned when a source worker fails. */
export interface EnrichmentError {
  source: EnrichmentSource;
  propertyId: string;
  code: EnrichmentErrorCode;
  message: string;
  retryable: boolean;
}

export type EnrichmentErrorCode =
  | "network_error"
  | "not_found"
  | "rate_limited"
  | "parse_error"
  | "unauthorized"
  | "timeout"
  | "unknown";

/** Retryable errors — the scheduler will schedule `nextRetryAt`. */
export const RETRYABLE_ERRORS: readonly EnrichmentErrorCode[] = [
  "network_error",
  "rate_limited",
  "timeout",
];

// ───────────────────────────────────────────────────────────────────────────
// Canonical listing-agent record
// ───────────────────────────────────────────────────────────────────────────

/** Per-field provenance entry — which source filled this field, when. */
export interface FieldProvenance {
  source: string;
  fetchedAt: string;
}

export interface ListingAgentProfile {
  canonicalAgentId: string;
  name: string;
  phone?: string;
  email?: string;
  brokerage?: string;
  zillowProfileUrl?: string;
  redfinProfileUrl?: string;
  realtorProfileUrl?: string;
  activeListings?: number;
  soldCount?: number;
  avgDaysOnMarket?: number;
  medianListToSellRatio?: number;
  priceCutFrequency?: number;
  recentActivityCount?: number;
  provenance: Record<string, FieldProvenance>;
  lastRefreshedAt: string;
}

/** Raw observation of an agent from a single portal — the input to merge. */
export interface AgentObservation {
  source: "zillow" | "redfin" | "realtor";
  name: string;
  phone?: string;
  email?: string;
  brokerage?: string;
  profileUrl?: string;
  activeListings?: number;
  soldCount?: number;
  avgDaysOnMarket?: number;
  medianListToSellRatio?: number;
  priceCutFrequency?: number;
  recentActivityCount?: number;
  fetchedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Neighborhood market context
// ───────────────────────────────────────────────────────────────────────────

export type GeoKind = "zip" | "subdivision" | "city";

export type MarketTrajectory = "rising" | "flat" | "falling";

export interface NeighborhoodContext {
  geoKey: string;
  geoKind: GeoKind;
  windowDays: number;
  medianDom?: number;
  medianPricePerSqft?: number;
  medianListPrice?: number;
  inventoryCount?: number;
  pendingCount?: number;
  salesVelocity?: number;
  trajectory?: MarketTrajectory;
  provenance: FieldProvenance;
  lastRefreshedAt: string;
}

/** Raw sale used when computing `NeighborhoodContext` aggregates. */
export interface NeighborhoodSale {
  soldPrice: number;
  soldDate: string;
  listPrice?: number;
  sqft?: number;
  dom?: number;
  status: "sold" | "pending" | "active";
}

// ───────────────────────────────────────────────────────────────────────────
// Per-portal property estimate
// ───────────────────────────────────────────────────────────────────────────

export type PortalName = "zillow" | "redfin" | "realtor";

export interface PortalEstimate {
  propertyId: string;
  portal: PortalName;
  estimateValue: number;
  estimateLow?: number;
  estimateHigh?: number;
  asOfDate?: string;
  provenance: FieldProvenance;
  capturedAt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Stored enrichment artifacts
// ───────────────────────────────────────────────────────────────────────────

export type SnapshotSource =
  | "fema_flood"
  | "county_appraiser"
  | "census_geocode"
  | "cross_portal_match";

export interface PropertyEnrichmentSnapshot<T = unknown> {
  propertyId: string;
  source: SnapshotSource;
  payload: T;
  provenance: FieldProvenance;
  lastRefreshedAt: string;
}

export interface RecentComparableSale {
  propertyId: string;
  portal: PortalName;
  canonicalId: string;
  address: string;
  soldPrice: number;
  soldDate: string;
  listPrice?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  lotSize?: number;
  propertyType?: string;
  waterfront?: boolean;
  pool?: boolean;
  hoaFee?: number;
  subdivision?: string;
  zip?: string;
  dom?: number;
  provenance: FieldProvenance;
  capturedAt: string;
}

export interface PortalEstimateRequestTarget {
  portal: PortalName;
  canonicalId: string;
}

export interface ListingAgentPortalTarget {
  portal: PortalName;
  propertyExternalId?: string;
  profileUrl?: string;
}

export interface NeighborhoodMarketRequest {
  geoKey: string;
  geoKind: GeoKind;
  windowDays: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Dedupe / cache helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Dedupe key for an enrichment job. Enrichment jobs are idempotent —
 * enqueueing the same (propertyId, source, dedupe hint) twice in a short
 * window must not double-fetch. Callers pass a stable hint (e.g., a
 * content hash or a time bucket) to distinguish "retry the same thing"
 * from "refresh because the upstream data changed".
 */
export function buildDedupeKey(
  propertyId: string,
  source: EnrichmentSource,
  hint = "",
): string {
  return `${propertyId}::${source}::${hint}`;
}

/** Cache freshness horizons per source, in hours. After this, a job is
 * considered stale and eligible for a scheduled refresh. Browser Use
 * fallback never auto-refreshes — every run is explicitly triggered by
 * an extraction failure, so the TTL only gates same-hour dedup. */
export const SOURCE_CACHE_TTL_HOURS: Record<EnrichmentSource, number> = {
  browser_use_fallback: 1,
  cross_portal_match: 72,
  portal_estimates: 24,
  census_geocode: 24 * 30,
  fema_flood: 24 * 30,
  county_appraiser: 24 * 7,
  listing_agent_profile: 24 * 3,
  neighborhood_market: 24,
  recent_sales: 12,
};

// ───────────────────────────────────────────────────────────────────────────
// Browser Use fallback (KIN-784)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Typed reasons for escalating from deterministic extraction to Browser
 * Use fallback. Each reason maps to a specific extractor failure mode so
 * operators can audit why a fallback was triggered.
 */
export const FALLBACK_REASONS = [
  "parser_schema_drift",
  "anti_bot_block",
  "vendor_unavailable",
  "unsupported_portal",
  "manual_override",
] as const;

export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export const FALLBACK_REASON_LABELS: Record<FallbackReason, string> = {
  parser_schema_drift:
    "Deterministic parser hit unexpected page structure",
  anti_bot_block:
    "Portal returned anti-bot block / captcha / rate-limit page",
  vendor_unavailable:
    "Upstream vendor (Bright Data, etc.) unavailable or failing",
  unsupported_portal:
    "URL belongs to a portal with no deterministic extractor",
  manual_override:
    "Operator explicitly requested Browser Use fallback run",
};

/**
 * Context passed to a Browser Use fallback job. Links back to the
 * originating intake attempt so the resulting canonical property record
 * preserves provenance ("extracted by Browser Use fallback after X").
 */
export interface BrowserUseFallbackContext {
  /** The property we're trying to populate. */
  propertyId: string;
  /** Source URL the deterministic extractor tried and failed on. */
  sourceUrl: string;
  /** Which portal this URL is on (may be "unknown" for unsupported). */
  portal: PortalName | "unknown";
  /** Why the fallback was triggered. */
  reason: FallbackReason;
  /** The original extractor error code, for audit + root-cause analysis. */
  originatingErrorCode?: EnrichmentErrorCode;
  /** Optional free-form context from the caller — shows up in ops UI. */
  note?: string;
}

/**
 * The typed payload a Browser Use worker returns after a successful run.
 * Fields match the canonical property subset; the Convex layer merges
 * these back into `properties` via `propertyMerge` — same path as
 * deterministic extractors.
 */
export interface BrowserUseFallbackResult {
  /** Reference to the originating context for traceability. */
  sourceUrl: string;
  portal: PortalName | "unknown";
  /** Canonical property fields extracted by the Browser Use agent. */
  canonicalFields: Record<string, unknown>;
  /** How confident the agent is about its output (0-1). */
  confidence: number;
  /** Screenshots / DOM snapshots captured for operator review. */
  evidence: Array<{ kind: "screenshot" | "html" | "json"; url: string }>;
  /** Which reason was used to trigger this run. */
  reason: FallbackReason;
  capturedAt: string;
}
