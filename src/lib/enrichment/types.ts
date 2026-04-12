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
] as const;

export type EnrichmentSource = (typeof ENRICHMENT_SOURCES)[number];

/** Sources that must succeed before the deal room considers a property
 * "enriched enough" to show AI engine output. Failures here still don't
 * corrupt the record — they just leave the UI in a degraded state. */
export const CRITICAL_SOURCES: readonly EnrichmentSource[] = [
  "cross_portal_match",
  "portal_estimates",
];

/** Default priority per source — lower number = higher priority. */
export const SOURCE_PRIORITY: Record<EnrichmentSource, number> = {
  cross_portal_match: 10,
  portal_estimates: 20,
  census_geocode: 30,
  fema_flood: 40,
  county_appraiser: 50,
  listing_agent_profile: 60,
  neighborhood_market: 70,
  recent_sales: 80,
};

/** Default retry budget per source. */
export const SOURCE_MAX_ATTEMPTS: Record<EnrichmentSource, number> = {
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
 * considered stale and eligible for a scheduled refresh. */
export const SOURCE_CACHE_TTL_HOURS: Record<EnrichmentSource, number> = {
  cross_portal_match: 72,
  portal_estimates: 24,
  census_geocode: 24 * 30,
  fema_flood: 24 * 30,
  county_appraiser: 24 * 7,
  listing_agent_profile: 24 * 3,
  neighborhood_market: 24,
  recent_sales: 12,
};
