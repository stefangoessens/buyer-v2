import { EnrichmentFailure, wrapUnknownError } from "@/lib/enrichment/errors";
import type {
  AgentObservation,
  BrowserUseFallbackContext,
  BrowserUseFallbackResult,
  EnrichmentError,
  EnrichmentResult,
  EnrichmentSource,
  FallbackReason,
  GeoKind,
  NeighborhoodSale,
  PortalName,
} from "@/lib/enrichment/types";
import { FALLBACK_REASONS } from "@/lib/enrichment/types";

export interface EnrichmentFetchAdapters {
  femaFlood(args: {
    lat: number;
    lng: number;
    propertyId: string;
  }): Promise<{ zone: string; bfe?: number; citation: string }>;
  countyAppraiser(args: {
    folioNumber?: string;
    address: string;
    propertyId: string;
  }): Promise<{ assessedValue: number; yearBuilt?: number; citation: string }>;
  censusGeocode(args: {
    address: string;
    propertyId: string;
  }): Promise<{ lat: number; lng: number; tract: string; citation: string }>;
  crossPortalMatch(args: {
    canonicalId: string;
    propertyId: string;
  }): Promise<{
    zillowId?: string;
    redfinId?: string;
    realtorId?: string;
    citation: string;
  }>;
  listingAgentProfile(args: {
    portal: "zillow" | "redfin" | "realtor";
    profileUrl: string;
    propertyId: string;
  }): Promise<{ observation: AgentObservation; citation: string }>;
  neighborhoodMarket(args: {
    geoKey: string;
    geoKind: GeoKind;
    windowDays: number;
  }): Promise<{ sales: NeighborhoodSale[]; citation: string }>;
  portalEstimates(args: {
    propertyId: string;
    portal: PortalName;
    canonicalId: string;
  }): Promise<{
    value: number;
    low?: number;
    high?: number;
    asOfDate?: string;
    citation: string;
  }>;
  recentSales(args: {
    geoKey: string;
    windowDays: number;
  }): Promise<{ sales: NeighborhoodSale[]; citation: string }>;
  /**
   * KIN-784: Browser Use fallback. Runs when deterministic extraction
   * fails for an explicit reason. The implementation lives in the Python
   * worker lane; this contract is the handoff.
   */
  browserUseFallback(args: {
    propertyId: string;
    sourceUrl: string;
    portal: PortalName | "unknown";
    reason: FallbackReason;
    note?: string;
  }): Promise<{ result: BrowserUseFallbackResult; citation: string }>;
}

export interface WorkerJob {
  propertyId: string;
  source: EnrichmentSource;
  context: Record<string, unknown>;
}

export type WorkerOutcome =
  | { kind: "success"; result: EnrichmentResult }
  | { kind: "failure"; error: EnrichmentError };

export async function runEnrichmentJob(
  job: WorkerJob,
  adapters: EnrichmentFetchAdapters,
  now: () => Date = () => new Date(),
): Promise<WorkerOutcome> {
  try {
    const payload = await dispatch(job, adapters);
    const result: EnrichmentResult = {
      source: job.source,
      propertyId: job.propertyId,
      payload: payload.data,
      citation: payload.citation,
      fetchedAt: now().toISOString(),
    };
    return { kind: "success", result };
  } catch (err) {
    const failure = wrapUnknownError(err, job.source, job.propertyId);
    return { kind: "failure", error: failure.toResult() };
  }
}

interface DispatchPayload {
  data: unknown;
  citation: string;
}

async function dispatch(
  job: WorkerJob,
  adapters: EnrichmentFetchAdapters,
): Promise<DispatchPayload> {
  const ctx = job.context;
  switch (job.source) {
    case "fema_flood": {
      const lat = requireNumber(job, ctx, "lat");
      const lng = requireNumber(job, ctx, "lng");
      const { citation, ...data } = await adapters.femaFlood({
        lat,
        lng,
        propertyId: job.propertyId,
      });
      return { data, citation };
    }
    case "county_appraiser": {
      const address = requireString(job, ctx, "address");
      const folioNumber = optionalString(ctx, "folioNumber");
      const { citation, ...data } = await adapters.countyAppraiser({
        address,
        folioNumber,
        propertyId: job.propertyId,
      });
      return { data, citation };
    }
    case "census_geocode": {
      const address = requireString(job, ctx, "address");
      const { citation, ...data } = await adapters.censusGeocode({
        address,
        propertyId: job.propertyId,
      });
      return { data, citation };
    }
    case "cross_portal_match": {
      const canonicalId = requireString(job, ctx, "canonicalId");
      const { citation, ...data } = await adapters.crossPortalMatch({
        canonicalId,
        propertyId: job.propertyId,
      });
      return { data, citation };
    }
    case "listing_agent_profile": {
      const portal = requirePortal(job, ctx, "portal");
      const profileUrl = requireString(job, ctx, "profileUrl");
      const { citation, ...data } = await adapters.listingAgentProfile({
        portal,
        profileUrl,
        propertyId: job.propertyId,
      });
      return { data, citation };
    }
    case "neighborhood_market": {
      const geoKey = requireString(job, ctx, "geoKey");
      const geoKind = requireGeoKind(job, ctx, "geoKind");
      const windowDays = requireNumber(job, ctx, "windowDays");
      const { citation, ...data } = await adapters.neighborhoodMarket({
        geoKey,
        geoKind,
        windowDays,
      });
      return { data, citation };
    }
    case "portal_estimates": {
      const portal = requirePortalName(job, ctx, "portal");
      const canonicalId = requireString(job, ctx, "canonicalId");
      // Never merge portal estimates across portals — each is stored raw.
      const { citation, ...data } = await adapters.portalEstimates({
        portal,
        canonicalId,
        propertyId: job.propertyId,
      });
      return { data, citation };
    }
    case "recent_sales": {
      const geoKey = requireString(job, ctx, "geoKey");
      const windowDays = requireNumber(job, ctx, "windowDays");
      const { citation, ...data } = await adapters.recentSales({
        geoKey,
        windowDays,
      });
      return { data, citation };
    }
    case "browser_use_fallback": {
      const sourceUrl = requireString(job, ctx, "sourceUrl");
      const portal = requireFallbackPortal(job, ctx, "portal");
      const reason = requireFallbackReason(job, ctx, "reason");
      const note = optionalString(ctx, "note");
      const { citation, ...data } = await adapters.browserUseFallback({
        propertyId: job.propertyId,
        sourceUrl,
        portal,
        reason,
        note,
      });
      return { data, citation };
    }
  }
}

function requireString(
  job: WorkerJob,
  ctx: Record<string, unknown>,
  key: string,
): string {
  const value = ctx[key];
  if (typeof value !== "string" || value.length === 0) {
    throw parseError(job, `Missing context.${key} (expected string)`);
  }
  return value;
}

function optionalString(
  ctx: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = ctx[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireNumber(
  job: WorkerJob,
  ctx: Record<string, unknown>,
  key: string,
): number {
  const value = ctx[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw parseError(job, `Missing context.${key} (expected number)`);
  }
  return value;
}

function requirePortal(
  job: WorkerJob,
  ctx: Record<string, unknown>,
  key: string,
): "zillow" | "redfin" | "realtor" {
  const value = ctx[key];
  if (value === "zillow" || value === "redfin" || value === "realtor") {
    return value;
  }
  throw parseError(job, `Missing context.${key} (expected portal)`);
}

function requirePortalName(
  job: WorkerJob,
  ctx: Record<string, unknown>,
  key: string,
): PortalName {
  const value = ctx[key];
  if (value === "zillow" || value === "redfin" || value === "realtor") {
    return value;
  }
  throw parseError(job, `Missing context.${key} (expected portal name)`);
}

function requireGeoKind(
  job: WorkerJob,
  ctx: Record<string, unknown>,
  key: string,
): GeoKind {
  const value = ctx[key];
  if (value === "zip" || value === "subdivision" || value === "city") {
    return value;
  }
  throw parseError(job, `Missing context.${key} (expected GeoKind)`);
}

function requireFallbackPortal(
  job: WorkerJob,
  ctx: Record<string, unknown>,
  key: string,
): PortalName | "unknown" {
  const value = ctx[key];
  if (
    value === "zillow" ||
    value === "redfin" ||
    value === "realtor" ||
    value === "unknown"
  ) {
    return value;
  }
  throw parseError(job, `Missing context.${key} (expected portal or unknown)`);
}

function requireFallbackReason(
  job: WorkerJob,
  ctx: Record<string, unknown>,
  key: string,
): FallbackReason {
  const value = ctx[key];
  if (
    typeof value === "string" &&
    (FALLBACK_REASONS as readonly string[]).includes(value)
  ) {
    return value as FallbackReason;
  }
  throw parseError(job, `Missing context.${key} (expected FallbackReason)`);
}

function parseError(job: WorkerJob, message: string): EnrichmentFailure {
  return new EnrichmentFailure({
    code: "parse_error",
    source: job.source,
    propertyId: job.propertyId,
    message,
  });
}

function notImplemented(source: EnrichmentSource): () => never {
  return () => {
    throw new EnrichmentFailure({
      code: "not_found",
      source,
      propertyId: "",
      message: `Adapter for ${source} is not implemented`,
    });
  };
}

export const stubAdapters: EnrichmentFetchAdapters = {
  femaFlood: async () => notImplemented("fema_flood")(),
  countyAppraiser: async () => notImplemented("county_appraiser")(),
  censusGeocode: async () => notImplemented("census_geocode")(),
  crossPortalMatch: async () => notImplemented("cross_portal_match")(),
  listingAgentProfile: async () => notImplemented("listing_agent_profile")(),
  neighborhoodMarket: async () => notImplemented("neighborhood_market")(),
  portalEstimates: async () => notImplemented("portal_estimates")(),
  recentSales: async () => notImplemented("recent_sales")(),
  browserUseFallback: async () => notImplemented("browser_use_fallback")(),
};
