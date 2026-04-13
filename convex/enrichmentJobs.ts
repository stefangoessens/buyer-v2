import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { buildSchedule } from "../src/lib/enrichment/scheduler";
import {
  buildEnrichmentContexts,
  buildNeighborhoodRequests,
} from "../src/lib/enrichment/jobContext";
import { canonicalizeAgentId } from "../src/lib/enrichment/listingAgentStats";
import { computeNeighborhoodContext } from "../src/lib/enrichment/neighborhoodStats";

// ─────────────────────────────────────────────────────────────────────────
// Source / priority registries (must match src/lib/enrichment/types.ts)
// ─────────────────────────────────────────────────────────────────────────

const sourceValidator = v.union(
  v.literal("fema_flood"),
  v.literal("county_appraiser"),
  v.literal("census_geocode"),
  v.literal("cross_portal_match"),
  v.literal("listing_agent_profile"),
  v.literal("neighborhood_market"),
  v.literal("portal_estimates"),
  v.literal("recent_sales"),
  v.literal("browser_use_fallback"),
);

const snapshotSourceValidator = v.union(
  v.literal("fema_flood"),
  v.literal("county_appraiser"),
  v.literal("census_geocode"),
  v.literal("cross_portal_match"),
);

type EnrichmentSource =
  | "fema_flood"
  | "county_appraiser"
  | "census_geocode"
  | "cross_portal_match"
  | "listing_agent_profile"
  | "neighborhood_market"
  | "portal_estimates"
  | "recent_sales"
  | "browser_use_fallback";

const SOURCE_PRIORITY: Record<EnrichmentSource, number> = {
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

/** Cache freshness horizons per source, in hours. Jobs succeeded within this
 *  window are still considered fresh — `enqueueJob` returns the existing id
 *  as a no-op rather than kicking off a redundant fetch. */
const SOURCE_CACHE_TTL_HOURS: Record<EnrichmentSource, number> = {
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

function buildDedupeKey(
  propertyId: string,
  source: EnrichmentSource,
  hint = "",
): string {
  return `${propertyId}::${source}::${hint}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Mutations — job lifecycle
// ─────────────────────────────────────────────────────────────────────────

/** Idempotent enqueue keyed by dedupeKey. Pending/running rows short-circuit;
 *  fresh succeeded rows short-circuit; anything else creates a new pending row. */
export const enqueueJob = internalMutation({
  args: {
    propertyId: v.id("properties"),
    source: sourceValidator,
    priority: v.number(),
    maxAttempts: v.number(),
    dedupeKey: v.string(),
    contextJson: v.optional(v.string()),
  },
  returns: v.id("enrichmentJobs"),
  handler: async (ctx, args) => {
    // Take the LATEST row for this dedupe key, not the first. Older stale or
    // failed rows must not shadow newer pending/running/succeeded rows, or
    // idempotency collapses into "insert another pending" on every call.
    const existing = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", args.dedupeKey))
      .order("desc")
      .first();

    if (existing) {
      if (existing.status === "pending" || existing.status === "running") {
        return existing._id;
      }
      if (existing.status === "succeeded" && existing.completedAt) {
        const ttlMs = SOURCE_CACHE_TTL_HOURS[args.source] * 60 * 60 * 1000;
        const completedAtMs = Date.parse(existing.completedAt);
        if (Number.isFinite(completedAtMs) && Date.now() - completedAtMs < ttlMs) {
          return existing._id;
        }
      }
    }

    const jobId = await ctx.db.insert("enrichmentJobs", {
      propertyId: args.propertyId,
      source: args.source,
      status: "pending" as const,
      attempt: 0,
      maxAttempts: args.maxAttempts,
      priority: args.priority,
      requestedAt: new Date().toISOString(),
      dedupeKey: args.dedupeKey,
      contextJson: args.contextJson,
    });

    await ctx.db.insert("auditLog", {
      action: "enrichment_job_enqueued",
      entityType: "enrichmentJobs",
      entityId: jobId,
      details: JSON.stringify({ source: args.source, priority: args.priority }),
      timestamp: new Date().toISOString(),
    });

    return jobId;
  },
});

function safeParseJson<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function getCrossPortalIds(
  ctx: any,
  propertyId: Id<"properties">,
): Promise<{
  zillowId?: string;
  redfinId?: string;
  realtorId?: string;
}> {
  const snapshot = await ctx.db
    .query("propertyEnrichmentSnapshots")
    .withIndex("by_propertyId_and_source", (q: any) =>
      q.eq("propertyId", propertyId).eq("source", "cross_portal_match"),
    )
    .unique();

  const payload = safeParseJson<{
    zillowId?: string;
    redfinId?: string;
    realtorId?: string;
  }>(snapshot?.payloadJson);

  return payload ?? {};
}

async function buildFreshSourceMap(
  ctx: any,
  property: any,
  crossPortalIds: {
    zillowId?: string;
    redfinId?: string;
    realtorId?: string;
  },
): Promise<Map<EnrichmentSource, { lastRefreshedAt: string }>> {
  const freshSources = new Map<EnrichmentSource, { lastRefreshedAt: string }>();

  const snapshots = await ctx.db
    .query("propertyEnrichmentSnapshots")
    .withIndex("by_propertyId_and_source", (q: any) =>
      q.eq("propertyId", property._id),
    )
    .collect();
  for (const snapshot of snapshots) {
    freshSources.set(snapshot.source, {
      lastRefreshedAt: snapshot.lastRefreshedAt,
    });
  }

  const listingLinks = await ctx.db
    .query("propertyAgentLinks")
    .withIndex("by_propertyId_and_role", (q: any) =>
      q.eq("propertyId", property._id).eq("role", "listing"),
    )
    .collect();
  let latestAgentRefresh: string | undefined;
  for (const link of listingLinks) {
    const agent = await ctx.db.get(link.agentId);
    if (!agent) continue;
    if (!latestAgentRefresh || agent.lastRefreshedAt > latestAgentRefresh) {
      latestAgentRefresh = agent.lastRefreshedAt;
    }
  }
  if (latestAgentRefresh) {
    freshSources.set("listing_agent_profile", {
      lastRefreshedAt: latestAgentRefresh,
    });
  }

  const portalEstimates = await ctx.db
    .query("portalEstimates")
    .withIndex("by_propertyId_and_capturedAt", (q: any) =>
      q.eq("propertyId", property._id),
    )
    .order("desc")
    .collect();
  const latestEstimateByPortal = new Map<string, string>();
  for (const row of portalEstimates) {
    if (!latestEstimateByPortal.has(row.portal)) {
      latestEstimateByPortal.set(row.portal, row.capturedAt);
    }
  }
  if (latestEstimateByPortal.size === 3) {
    const estimateFreshness = Array.from(latestEstimateByPortal.values()).sort()[0];
    if (estimateFreshness) {
      freshSources.set("portal_estimates", {
        lastRefreshedAt: estimateFreshness,
      });
    }
  }

  const recentSales = await ctx.db
    .query("recentComparableSales")
    .withIndex("by_propertyId_and_soldDate", (q: any) =>
      q.eq("propertyId", property._id),
    )
    .order("desc")
    .collect();
  if (recentSales.length > 0) {
    const latest = recentSales
      .map((sale: any) => sale.capturedAt)
      .sort()
      .at(-1);
    if (latest) {
      freshSources.set("recent_sales", { lastRefreshedAt: latest });
    }
  }

  const neighborhoodRequests = buildNeighborhoodRequests({
    canonicalId: property.canonicalId,
    sourcePlatform: property.sourcePlatform,
    address: {
      city: property.address.city,
      formatted: property.address.formatted,
      zip: property.address.zip,
    },
    subdivision: property.subdivision,
  });
  if (neighborhoodRequests.length > 0) {
    let oldestRefresh: string | undefined;
    let complete = true;

    for (const request of neighborhoodRequests) {
      const row = await ctx.db
        .query("neighborhoodMarketContext")
        .withIndex("by_geoKey_and_windowDays", (q: any) =>
          q.eq("geoKey", request.geoKey).eq("windowDays", request.windowDays),
        )
        .unique();
      if (!row) {
        complete = false;
        break;
      }
      if (!oldestRefresh || row.lastRefreshedAt < oldestRefresh) {
        oldestRefresh = row.lastRefreshedAt;
      }
    }

    if (complete && oldestRefresh) {
      freshSources.set("neighborhood_market", {
        lastRefreshedAt: oldestRefresh,
      });
    }
  }

  if (
    crossPortalIds.zillowId ||
    crossPortalIds.redfinId ||
    crossPortalIds.realtorId
  ) {
    const crossPortalSnapshot = snapshots.find(
      (snapshot: any) => snapshot.source === "cross_portal_match",
    );
    if (crossPortalSnapshot) {
      freshSources.set("cross_portal_match", {
        lastRefreshedAt: crossPortalSnapshot.lastRefreshedAt,
      });
    }
  }

  return freshSources;
}

async function upsertPropertySnapshotRow(args: {
  ctx: any;
  propertyId: Id<"properties">;
  source: "fema_flood" | "county_appraiser" | "census_geocode" | "cross_portal_match";
  payloadJson: string;
  citation: string;
  fetchedAt: string;
}): Promise<Id<"propertyEnrichmentSnapshots">> {
  const existing = await args.ctx.db
    .query("propertyEnrichmentSnapshots")
    .withIndex("by_propertyId_and_source", (q: any) =>
      q.eq("propertyId", args.propertyId).eq("source", args.source),
    )
    .unique();

  const row = {
    propertyId: args.propertyId,
    source: args.source,
    payloadJson: args.payloadJson,
    provenance: {
      source: args.citation,
      fetchedAt: args.fetchedAt,
    },
    lastRefreshedAt: args.fetchedAt,
  };

  if (existing) {
    await args.ctx.db.replace(existing._id, row);
    return existing._id;
  }
  return await args.ctx.db.insert("propertyEnrichmentSnapshots", row);
}

async function replaceRecentComparableSalesRows(args: {
  ctx: any;
  propertyId: Id<"properties">;
  sales: Array<Record<string, unknown>>;
  citation: string;
  fetchedAt: string;
}): Promise<Array<Id<"recentComparableSales">>> {
  const existingRows = await args.ctx.db
    .query("recentComparableSales")
    .withIndex("by_propertyId_and_soldDate", (q: any) =>
      q.eq("propertyId", args.propertyId),
    )
    .collect();
  for (const row of existingRows) {
    await args.ctx.db.delete(row._id);
  }

  const insertedIds: Array<Id<"recentComparableSales">> = [];
  for (const sale of args.sales) {
    const portal = sale.portal;
    if (portal !== "zillow" && portal !== "redfin" && portal !== "realtor") {
      continue;
    }

    insertedIds.push(
      await args.ctx.db.insert("recentComparableSales", {
        propertyId: args.propertyId,
        portal,
        canonicalId:
          typeof sale.canonicalId === "string"
            ? sale.canonicalId
            : `${portal}:${String(sale.address ?? sale.soldDate ?? insertedIds.length)}`,
        address: String(sale.address ?? "Unknown"),
        soldPrice: Number(sale.soldPrice ?? 0),
        soldDate: String(sale.soldDate ?? args.fetchedAt),
        listPrice:
          typeof sale.listPrice === "number" ? sale.listPrice : undefined,
        beds: typeof sale.beds === "number" ? sale.beds : undefined,
        baths: typeof sale.baths === "number" ? sale.baths : undefined,
        sqft: typeof sale.sqft === "number" ? sale.sqft : undefined,
        yearBuilt:
          typeof sale.yearBuilt === "number" ? sale.yearBuilt : undefined,
        lotSize: typeof sale.lotSize === "number" ? sale.lotSize : undefined,
        propertyType:
          typeof sale.propertyType === "string" ? sale.propertyType : undefined,
        waterfront:
          typeof sale.waterfront === "boolean" ? sale.waterfront : undefined,
        pool: typeof sale.pool === "boolean" ? sale.pool : undefined,
        hoaFee: typeof sale.hoaFee === "number" ? sale.hoaFee : undefined,
        subdivision:
          typeof sale.subdivision === "string" ? sale.subdivision : undefined,
        zip: typeof sale.zip === "string" ? sale.zip : undefined,
        dom: typeof sale.dom === "number" ? sale.dom : undefined,
        provenance: {
          source: args.citation,
          fetchedAt: args.fetchedAt,
        },
        capturedAt: args.fetchedAt,
      }),
    );
  }

  return insertedIds;
}

async function markJobSucceededRow(args: {
  ctx: any;
  jobId: Id<"enrichmentJobs">;
  resultRef?: string;
  completedAt: string;
}): Promise<void> {
  await args.ctx.db.patch(args.jobId, {
    status: "succeeded" as const,
    completedAt: args.completedAt,
    errorCode: undefined,
    errorMessage: undefined,
    nextRetryAt: undefined,
    resultRef: args.resultRef,
  });
  await args.ctx.db.insert("auditLog", {
    action: "enrichment_job_succeeded",
    entityType: "enrichmentJobs",
    entityId: args.jobId,
    timestamp: args.completedAt,
  });
}

/** Enqueue every source for a freshly intaken property. */
export const enqueueAllSourcesForProperty = internalMutation({
  args: {
    propertyId: v.id("properties"),
    forceRefresh: v.optional(v.boolean()),
  },
  returns: v.array(v.id("enrichmentJobs")),
  handler: async (ctx, args) => {
    const jobIds: Array<Id<"enrichmentJobs">> = [];
    const now = new Date().toISOString();
    const property = await ctx.db.get(args.propertyId);
    if (!property) return jobIds;

    const crossPortalIds = await getCrossPortalIds(ctx, args.propertyId);
    const contexts = buildEnrichmentContexts(
      {
        canonicalId: property.canonicalId,
        folioNumber: property.folioNumber,
        sourcePlatform: property.sourcePlatform,
        address: {
          city: property.address.city,
          formatted: property.address.formatted,
          zip: property.address.zip,
        },
        coordinates: property.coordinates,
        zillowId: property.zillowId,
        redfinId: property.redfinId,
        realtorId: property.realtorId,
        listingAgentName: property.listingAgentName,
        listingBrokerage: property.listingBrokerage,
        listingAgentPhone: property.listingAgentPhone,
        subdivision: property.subdivision,
      },
      crossPortalIds,
    );

    const freshSources = await buildFreshSourceMap(ctx, property, crossPortalIds);
    const inFlightRows = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_propertyId_and_status", (q: any) =>
        q.eq("propertyId", args.propertyId),
      )
      .collect();
    const inFlightSources = new Set<EnrichmentSource>(
      inFlightRows
        .filter((row: any) => row.status === "pending" || row.status === "running")
        .map((row: any) => row.source as EnrichmentSource),
    );

    const plan = buildSchedule({
      propertyId: args.propertyId,
      freshSources,
      inFlightSources,
      forceRefresh: args.forceRefresh,
      now: new Date(now),
    });

    for (const decision of plan) {
      if (decision.shouldSkip) continue;
      const context = contexts[decision.source];
      if (!context) continue;

      const contextJson = JSON.stringify(context);
      const jobId: Id<"enrichmentJobs"> = await ctx.runMutation(
        internal.enrichmentJobs.enqueueJob,
        {
          propertyId: args.propertyId,
          source: decision.source,
          priority: decision.priority,
          maxAttempts: decision.maxAttempts,
          dedupeKey: decision.dedupeKey,
          contextJson,
        },
      );
      const existingJob = await ctx.db.get(jobId);
      if (existingJob && existingJob.contextJson !== contextJson) {
        await ctx.db.patch(jobId, { contextJson });
      }
      jobIds.push(jobId);
    }

    await ctx.db.insert("auditLog", {
      action: "enrichment_all_sources_enqueued",
      entityType: "properties",
      entityId: args.propertyId,
      details: JSON.stringify({
        jobCount: jobIds.length,
        forceRefresh: args.forceRefresh ?? false,
      }),
      timestamp: now,
    });

    return jobIds;
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Browser Use fallback (KIN-784)
// ─────────────────────────────────────────────────────────────────────────

const fallbackReasonValidator = v.union(
  v.literal("parser_schema_drift"),
  v.literal("anti_bot_block"),
  v.literal("vendor_unavailable"),
  v.literal("unsupported_portal"),
  v.literal("manual_override"),
);

const fallbackPortalValidator = v.union(
  v.literal("zillow"),
  v.literal("redfin"),
  v.literal("realtor"),
  v.literal("unknown"),
);

const extractorErrorCodeValidator = v.union(
  v.literal("network_error"),
  v.literal("not_found"),
  v.literal("rate_limited"),
  v.literal("parse_error"),
  v.literal("unauthorized"),
  v.literal("timeout"),
  v.literal("unknown"),
);

/**
 * Enqueue a Browser Use fallback job for a property whose deterministic
 * extraction failed. Only enqueues when the extractor error code maps
 * to a known fallback-eligible reason, when operator manually overrides,
 * or when the portal is unsupported. Idempotent via fallback dedupe key.
 *
 * Returns `{ eligible: true, jobId }` on enqueue, or `{ eligible: false,
 * skipReason }` when the failure does not warrant fallback.
 */
export const enqueueBrowserUseFallback = internalMutation({
  args: {
    propertyId: v.id("properties"),
    sourceUrl: v.string(),
    portal: fallbackPortalValidator,
    extractorErrorCode: extractorErrorCodeValidator,
    manualOverride: v.optional(v.boolean()),
    unsupportedPortal: v.optional(v.boolean()),
    operatorNote: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      eligible: v.literal(true),
      jobId: v.id("enrichmentJobs"),
      fallbackReason: fallbackReasonValidator,
    }),
    v.object({
      eligible: v.literal(false),
      skipReason: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    // Count prior fallback attempts for this (property, sourceUrl). Inline
    // to avoid narrowing the Convex ctx type through a helper.
    const priorRows = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_propertyId_and_source", (q) =>
        q
          .eq("propertyId", args.propertyId)
          .eq("source", "browser_use_fallback"),
      )
      .collect();

    let priorFallbackAttempts = 0;
    for (const row of priorRows) {
      if (row.status === "skipped") continue;
      if (!row.contextJson) continue;
      try {
        const parsed = JSON.parse(row.contextJson) as { sourceUrl?: string };
        if (parsed?.sourceUrl === args.sourceUrl) priorFallbackAttempts++;
      } catch {
        priorFallbackAttempts++;
      }
    }

    const maxFallbackAttempts = 2;

    if (priorFallbackAttempts >= maxFallbackAttempts) {
      return {
        eligible: false as const,
        skipReason: "max_fallback_attempts_exceeded",
      };
    }

    let fallbackReason:
      | "parser_schema_drift"
      | "anti_bot_block"
      | "vendor_unavailable"
      | "unsupported_portal"
      | "manual_override"
      | null = null;

    if (args.manualOverride) {
      fallbackReason = "manual_override";
    } else if (args.unsupportedPortal) {
      fallbackReason = "unsupported_portal";
    } else {
      switch (args.extractorErrorCode) {
        case "parse_error":
          fallbackReason = "parser_schema_drift";
          break;
        case "rate_limited":
        case "unauthorized":
          fallbackReason = "anti_bot_block";
          break;
        case "network_error":
        case "timeout":
          fallbackReason = "vendor_unavailable";
          break;
        default:
          fallbackReason = null;
      }
    }

    if (!fallbackReason) {
      return {
        eligible: false as const,
        skipReason: `no_mapping_for_error_code:${args.extractorErrorCode}`,
      };
    }

    const hourBucket = new Date().toISOString().slice(0, 13);
    const urlHash = simpleHash(args.sourceUrl);
    const dedupeKey = buildDedupeKey(
      args.propertyId,
      "browser_use_fallback",
      `${urlHash}::${priorFallbackAttempts}::${hourBucket}`,
    );

    // Idempotency: if a job with this dedupe key is already pending or
    // running, reuse it instead of enqueuing a duplicate.
    const existing = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
      .order("desc")
      .first();
    if (existing && (existing.status === "pending" || existing.status === "running")) {
      return {
        eligible: true as const,
        jobId: existing._id,
        fallbackReason,
      };
    }

    const now = new Date().toISOString();
    const contextJson = JSON.stringify({
      propertyId: args.propertyId,
      sourceUrl: args.sourceUrl,
      portal: args.portal,
      reason: fallbackReason,
      originatingErrorCode: args.extractorErrorCode,
      note: args.operatorNote,
    });

    const jobId = await ctx.db.insert("enrichmentJobs", {
      propertyId: args.propertyId,
      source: "browser_use_fallback" as const,
      status: "pending" as const,
      attempt: 0,
      maxAttempts: maxFallbackAttempts,
      priority: SOURCE_PRIORITY.browser_use_fallback,
      requestedAt: now,
      dedupeKey,
      contextJson,
    });

    await ctx.db.insert("auditLog", {
      action: "browser_use_fallback_enqueued",
      entityType: "enrichmentJobs",
      entityId: jobId,
      details: JSON.stringify({
        propertyId: args.propertyId,
        sourceUrl: args.sourceUrl,
        portal: args.portal,
        fallbackReason,
        originatingErrorCode: args.extractorErrorCode,
        priorAttempts: priorFallbackAttempts,
      }),
      timestamp: now,
    });

    return {
      eligible: true as const,
      jobId,
      fallbackReason,
    };
  },
});

/** Cheap non-crypto hash — same formula as src/lib/enrichment/fallback.ts. */
function simpleHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Atomic claim: only advance pending → running. A second worker racing on
 *  the same pending row observes status !== "pending" and throws, so the
 *  caller can pick a different job. Convex mutations serialize conflicting
 *  writes, so the read-then-patch inside a single mutation handler is
 *  race-safe for this document. */
export const markRunning = internalMutation({
  args: { jobId: v.id("enrichmentJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Enrichment job not found");
    if (job.status !== "pending") {
      throw new Error(
        `Enrichment job ${args.jobId} cannot be claimed: status is "${job.status}" (expected "pending")`,
      );
    }
    await ctx.db.patch(args.jobId, {
      status: "running" as const,
      attempt: job.attempt + 1,
      startedAt: new Date().toISOString(),
      nextRetryAt: undefined,
    });
    return null;
  },
});

export const markSucceeded = internalMutation({
  args: {
    jobId: v.id("enrichmentJobs"),
    resultRef: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.jobId, {
      status: "succeeded" as const,
      completedAt: now,
      errorCode: undefined,
      errorMessage: undefined,
      nextRetryAt: undefined,
      resultRef: args.resultRef,
    });
    await ctx.db.insert("auditLog", {
      action: "enrichment_job_succeeded",
      entityType: "enrichmentJobs",
      entityId: args.jobId,
      timestamp: now,
    });
    return null;
  },
});

/** Mark failed or schedule retry. Backoff: 10 * 2^attempt seconds, capped at 1h. */
export const markFailed = internalMutation({
  args: {
    jobId: v.id("enrichmentJobs"),
    errorCode: v.string(),
    errorMessage: v.string(),
    retryable: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Enrichment job not found");
    const now = new Date();

    if (args.retryable && job.attempt < job.maxAttempts) {
      const backoffSec = Math.min(10 * Math.pow(2, job.attempt), 3600);
      const nextRetryAt = new Date(now.getTime() + backoffSec * 1000).toISOString();
      await ctx.db.patch(args.jobId, {
        status: "pending" as const,
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
        nextRetryAt,
      });
      await ctx.db.insert("auditLog", {
        action: "enrichment_job_retry_scheduled",
        entityType: "enrichmentJobs",
        entityId: args.jobId,
        details: JSON.stringify({
          errorCode: args.errorCode,
          attempt: job.attempt,
          nextRetryAt,
        }),
        timestamp: now.toISOString(),
      });
      return null;
    }

    await ctx.db.patch(args.jobId, {
      status: "failed" as const,
      completedAt: now.toISOString(),
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      nextRetryAt: undefined,
    });
    await ctx.db.insert("auditLog", {
      action: "enrichment_job_failed",
      entityType: "enrichmentJobs",
      entityId: args.jobId,
      details: JSON.stringify({
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
      }),
      timestamp: now.toISOString(),
    });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Mutations — derived-data upserts
// ─────────────────────────────────────────────────────────────────────────

/** Merge-upsert a listing agent keyed by canonicalAgentId. Incoming nullish
 *  fields never clobber existing values; provenance only updates for keys
 *  whose values actually changed. */
export const upsertListingAgent = internalMutation({
  args: {
    canonicalAgentId: v.string(),
    observation: v.object({
      source: v.union(
        v.literal("zillow"),
        v.literal("redfin"),
        v.literal("realtor"),
      ),
      name: v.string(),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      brokerage: v.optional(v.string()),
      profileUrl: v.optional(v.string()),
      activeListings: v.optional(v.number()),
      soldCount: v.optional(v.number()),
      avgDaysOnMarket: v.optional(v.number()),
      medianListToSellRatio: v.optional(v.number()),
      priceCutFrequency: v.optional(v.number()),
      recentActivityCount: v.optional(v.number()),
      fetchedAt: v.string(),
    }),
  },
  returns: v.id("listingAgents"),
  handler: async (ctx, args) => {
    const { observation } = args;
    const profileUrlKey =
      observation.source === "zillow"
        ? "zillowProfileUrl"
        : observation.source === "redfin"
          ? "redfinProfileUrl"
          : "realtorProfileUrl";

    const existing = await ctx.db
      .query("listingAgents")
      .withIndex("by_canonicalAgentId", (q) =>
        q.eq("canonicalAgentId", args.canonicalAgentId),
      )
      .unique();

    const existingProvenance = (existing?.provenance ?? {}) as Record<
      string,
      { source: string; fetchedAt: string }
    >;
    const incomingFetchedMs = Date.parse(observation.fetchedAt);

    const patch: Record<string, unknown> = {};
    const changedKeys: string[] = [];

    // For each field: only overwrite when the incoming observation is both
    // different AND at least as recent as the existing per-field provenance.
    // This prevents a late-arriving stale fetch from regressing newer data
    // when workers come back in an unexpected order.
    const apply = (key: string, value: unknown) => {
      if (value === undefined || value === null) return;
      if (existing) {
        const current = (existing as Record<string, unknown>)[key];
        if (current === value) return;
        const existingForField = existingProvenance[key];
        if (existingForField) {
          const existingMs = Date.parse(existingForField.fetchedAt);
          if (
            Number.isFinite(existingMs) &&
            Number.isFinite(incomingFetchedMs) &&
            incomingFetchedMs < existingMs
          ) {
            return;
          }
        }
      }
      patch[key] = value;
      changedKeys.push(key);
    };

    apply("name", observation.name);
    apply("phone", observation.phone);
    apply("email", observation.email);
    apply("brokerage", observation.brokerage);
    apply(profileUrlKey, observation.profileUrl);
    apply("activeListings", observation.activeListings);
    apply("soldCount", observation.soldCount);
    apply("avgDaysOnMarket", observation.avgDaysOnMarket);
    apply("medianListToSellRatio", observation.medianListToSellRatio);
    apply("priceCutFrequency", observation.priceCutFrequency);
    apply("recentActivityCount", observation.recentActivityCount);

    const nextProvenance = { ...existingProvenance };
    for (const key of changedKeys) {
      nextProvenance[key] = {
        source: observation.source,
        fetchedAt: observation.fetchedAt,
      };
    }

    // Preserve the most-recent lastRefreshedAt across out-of-order writes.
    const existingLastMs = existing
      ? Date.parse(existing.lastRefreshedAt)
      : Number.NEGATIVE_INFINITY;
    const nextLastRefreshedAt =
      existing && Number.isFinite(existingLastMs) && existingLastMs > incomingFetchedMs
        ? existing.lastRefreshedAt
        : observation.fetchedAt;

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        provenance: nextProvenance,
        lastRefreshedAt: nextLastRefreshedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("listingAgents", {
      canonicalAgentId: args.canonicalAgentId,
      name: observation.name,
      phone: observation.phone,
      email: observation.email,
      brokerage: observation.brokerage,
      zillowProfileUrl:
        observation.source === "zillow" ? observation.profileUrl : undefined,
      redfinProfileUrl:
        observation.source === "redfin" ? observation.profileUrl : undefined,
      realtorProfileUrl:
        observation.source === "realtor" ? observation.profileUrl : undefined,
      activeListings: observation.activeListings,
      soldCount: observation.soldCount,
      avgDaysOnMarket: observation.avgDaysOnMarket,
      medianListToSellRatio: observation.medianListToSellRatio,
      priceCutFrequency: observation.priceCutFrequency,
      recentActivityCount: observation.recentActivityCount,
      provenance: nextProvenance,
      lastRefreshedAt: observation.fetchedAt,
    });
  },
});

/** Idempotent: skips insert if (propertyId, agentId, role) already linked. */
export const linkAgentToProperty = internalMutation({
  args: {
    propertyId: v.id("properties"),
    agentId: v.id("listingAgents"),
    role: v.union(v.literal("listing"), v.literal("buyer")),
    source: v.string(),
  },
  returns: v.id("propertyAgentLinks"),
  handler: async (ctx, args) => {
    const existingLinks = await ctx.db
      .query("propertyAgentLinks")
      .withIndex("by_propertyId_and_role", (q) =>
        q.eq("propertyId", args.propertyId).eq("role", args.role),
      )
      .collect();

    for (const link of existingLinks) {
      if (link.agentId === args.agentId) return link._id;
    }

    return await ctx.db.insert("propertyAgentLinks", {
      propertyId: args.propertyId,
      agentId: args.agentId,
      role: args.role,
      source: args.source,
      capturedAt: new Date().toISOString(),
    });
  },
});

export const upsertNeighborhoodContext = internalMutation({
  args: {
    geoKey: v.string(),
    geoKind: v.union(
      v.literal("zip"),
      v.literal("subdivision"),
      v.literal("city"),
    ),
    windowDays: v.number(),
    medianDom: v.optional(v.number()),
    medianPricePerSqft: v.optional(v.number()),
    medianListPrice: v.optional(v.number()),
    inventoryCount: v.optional(v.number()),
    pendingCount: v.optional(v.number()),
    salesVelocity: v.optional(v.number()),
    trajectory: v.optional(
      v.union(
        v.literal("rising"),
        v.literal("flat"),
        v.literal("falling"),
      ),
    ),
    provenanceSource: v.string(),
  },
  returns: v.id("neighborhoodMarketContext"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("neighborhoodMarketContext")
      .withIndex("by_geoKey_and_windowDays", (q) =>
        q.eq("geoKey", args.geoKey).eq("windowDays", args.windowDays),
      )
      .unique();

    const payload = {
      geoKey: args.geoKey,
      geoKind: args.geoKind,
      windowDays: args.windowDays,
      medianDom: args.medianDom,
      medianPricePerSqft: args.medianPricePerSqft,
      medianListPrice: args.medianListPrice,
      inventoryCount: args.inventoryCount,
      pendingCount: args.pendingCount,
      salesVelocity: args.salesVelocity,
      trajectory: args.trajectory,
      provenance: { source: args.provenanceSource, fetchedAt: now },
      lastRefreshedAt: now,
    };

    if (existing) {
      await ctx.db.replace(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("neighborhoodMarketContext", payload);
  },
});

/** Always inserts a new row — estimate history is retained for trend tracking. */
export const recordPortalEstimate = internalMutation({
  args: {
    propertyId: v.id("properties"),
    portal: v.union(
      v.literal("zillow"),
      v.literal("redfin"),
      v.literal("realtor"),
    ),
    estimateValue: v.number(),
    estimateLow: v.optional(v.number()),
    estimateHigh: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
    provenanceSource: v.string(),
  },
  returns: v.id("portalEstimates"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("portalEstimates", {
      propertyId: args.propertyId,
      portal: args.portal,
      estimateValue: args.estimateValue,
      estimateLow: args.estimateLow,
      estimateHigh: args.estimateHigh,
      asOfDate: args.asOfDate,
      provenance: { source: args.provenanceSource, fetchedAt: now },
      capturedAt: now,
    });
  },
});

export const upsertPropertySnapshot = internalMutation({
  args: {
    propertyId: v.id("properties"),
    source: snapshotSourceValidator,
    payloadJson: v.string(),
    provenanceSource: v.string(),
    fetchedAt: v.optional(v.string()),
  },
  returns: v.id("propertyEnrichmentSnapshots"),
  handler: async (ctx, args) => {
    return await upsertPropertySnapshotRow({
      ctx,
      propertyId: args.propertyId,
      source: args.source,
      payloadJson: args.payloadJson,
      citation: args.provenanceSource,
      fetchedAt: args.fetchedAt ?? new Date().toISOString(),
    });
  },
});

export const replaceRecentComparableSales = internalMutation({
  args: {
    propertyId: v.id("properties"),
    sales: v.array(v.any()),
    provenanceSource: v.string(),
    fetchedAt: v.optional(v.string()),
  },
  returns: v.array(v.id("recentComparableSales")),
  handler: async (ctx, args) => {
    return await replaceRecentComparableSalesRows({
      ctx,
      propertyId: args.propertyId,
      sales: args.sales as Array<Record<string, unknown>>,
      citation: args.provenanceSource,
      fetchedAt: args.fetchedAt ?? new Date().toISOString(),
    });
  },
});

export const persistJobResult = internalMutation({
  args: {
    jobId: v.id("enrichmentJobs"),
    payloadJson: v.string(),
    citation: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Enrichment job not found");

    const fetchedAt = new Date().toISOString();
    const payload = safeParseJson<any>(args.payloadJson);
    const context = safeParseJson<any>(job.contextJson);
    let resultRef: string | undefined;

    switch (job.source) {
      case "fema_flood":
      case "county_appraiser":
      case "census_geocode":
      case "cross_portal_match": {
        const snapshotId = await upsertPropertySnapshotRow({
          ctx,
          propertyId: job.propertyId,
          source: job.source,
          payloadJson: args.payloadJson,
          citation: args.citation,
          fetchedAt,
        });
        resultRef = snapshotId;
        break;
      }
      case "listing_agent_profile": {
        const observations: Array<any> = Array.isArray(payload?.observations)
          ? payload.observations
          : payload?.observation
            ? [payload.observation]
            : [];

        const agentIds: string[] = [];
        for (const observation of observations) {
          if (!observation || typeof observation.name !== "string") continue;
          const canonicalAgentId = canonicalizeAgentId({
            name: observation.name,
            brokerage:
              typeof observation.brokerage === "string"
                ? observation.brokerage
                : undefined,
          });

          await ctx.db.insert("auditLog", {
            action: "listing_agent_profile_persist_started",
            entityType: "properties",
            entityId: job.propertyId,
            details: JSON.stringify({
              canonicalAgentId,
              source: observation.source,
            }),
            timestamp: fetchedAt,
          });

          const agentId: Id<"listingAgents"> = await ctx.runMutation(
            internal.enrichmentJobs.upsertListingAgent,
            {
              canonicalAgentId,
              observation: {
                ...observation,
                fetchedAt:
                  typeof observation.fetchedAt === "string"
                    ? observation.fetchedAt
                    : fetchedAt,
              },
            },
          );

          await ctx.runMutation(internal.enrichmentJobs.linkAgentToProperty, {
            propertyId: job.propertyId,
            agentId,
            role: "listing",
            source: `enrichment:${observation.source ?? "unknown"}`,
          });
          agentIds.push(agentId);
        }
        resultRef = JSON.stringify(agentIds);
        break;
      }
      case "neighborhood_market": {
        const marketRows: Array<any> = Array.isArray(payload?.markets)
          ? payload.markets
          : Array.isArray(payload?.contexts)
            ? payload.contexts
            : Array.isArray(context?.requests) && Array.isArray(payload?.sales)
              ? context.requests.map((request: any) => ({
                  ...request,
                  sales: payload.sales,
                }))
              : [];

        const ids: string[] = [];
        for (const market of marketRows) {
          if (!Array.isArray(market.sales)) continue;
          const computed = computeNeighborhoodContext({
            geoKey: String(market.geoKey),
            geoKind: market.geoKind,
            windowDays: Number(market.windowDays),
            sales: market.sales,
            fetchedAt,
            sourceLabel: args.citation,
          });
          const id: Id<"neighborhoodMarketContext"> = await ctx.runMutation(
            internal.enrichmentJobs.upsertNeighborhoodContext,
            {
              geoKey: computed.geoKey,
              geoKind: computed.geoKind,
              windowDays: computed.windowDays,
              medianDom: computed.medianDom,
              medianPricePerSqft: computed.medianPricePerSqft,
              medianListPrice: computed.medianListPrice,
              inventoryCount: computed.inventoryCount,
              pendingCount: computed.pendingCount,
              salesVelocity: computed.salesVelocity,
              trajectory: computed.trajectory,
              provenanceSource: args.citation,
            },
          );
          ids.push(id);
        }
        resultRef = JSON.stringify(ids);
        break;
      }
      case "portal_estimates": {
        const estimates: Array<any> = Array.isArray(payload?.estimates)
          ? payload.estimates
          : payload
            ? [payload]
            : [];
        const ids: string[] = [];
        for (const estimate of estimates) {
          if (
            estimate?.portal !== "zillow" &&
            estimate?.portal !== "redfin" &&
            estimate?.portal !== "realtor"
          ) {
            continue;
          }
          const id: Id<"portalEstimates"> = await ctx.runMutation(
            internal.enrichmentJobs.recordPortalEstimate,
            {
              propertyId: job.propertyId,
              portal: estimate.portal,
              estimateValue: Number(estimate.value ?? estimate.estimateValue ?? 0),
              estimateLow:
                typeof estimate.low === "number"
                  ? estimate.low
                  : typeof estimate.estimateLow === "number"
                    ? estimate.estimateLow
                    : undefined,
              estimateHigh:
                typeof estimate.high === "number"
                  ? estimate.high
                  : typeof estimate.estimateHigh === "number"
                    ? estimate.estimateHigh
                    : undefined,
              asOfDate:
                typeof estimate.asOfDate === "string"
                  ? estimate.asOfDate
                  : undefined,
              provenanceSource: args.citation,
            },
          );
          ids.push(id);
        }
        resultRef = JSON.stringify(ids);
        break;
      }
      case "recent_sales": {
        const sales: Array<Record<string, unknown>> = Array.isArray(payload?.sales)
          ? payload.sales
          : Array.isArray(payload)
            ? payload
            : [];
        const ids = await replaceRecentComparableSalesRows({
          ctx,
          propertyId: job.propertyId,
          sales,
          citation: args.citation,
          fetchedAt,
        });
        resultRef = JSON.stringify(ids);
        break;
      }
      case "browser_use_fallback":
        resultRef = undefined;
        break;
    }

    await markJobSucceededRow({
      ctx,
      jobId: args.jobId,
      resultRef,
      completedAt: fetchedAt,
    });

    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────

export const getJobsForProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_propertyId_and_source", (q) =>
        q.eq("propertyId", args.propertyId),
      )
      .collect();
    return jobs.sort((a, b) => a.priority - b.priority);
  },
});

/** Ready-to-run queue: pending + (no retry gate OR retry gate has passed).
 *  Ordered by priority asc. */
export const getPendingJobs = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const now = new Date().toISOString();

    const pending = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status_and_priority", (q) => q.eq("status", "pending"))
      .collect();

    const ready = pending.filter(
      (j) => !j.nextRetryAt || j.nextRetryAt <= now,
    );
    ready.sort((a, b) => a.priority - b.priority);
    return ready.slice(0, limit);
  },
});

export const getEnrichmentSummaryForProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.object({
    totalJobs: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    pending: v.number(),
    running: v.number(),
    skipped: v.number(),
    lastUpdated: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_propertyId_and_source", (q) =>
        q.eq("propertyId", args.propertyId),
      )
      .collect();

    let succeeded = 0;
    let failed = 0;
    let pending = 0;
    let running = 0;
    let skipped = 0;
    let lastUpdated: string | undefined;

    for (const job of jobs) {
      switch (job.status) {
        case "succeeded":
          succeeded++;
          break;
        case "failed":
          failed++;
          break;
        case "pending":
          pending++;
          break;
        case "running":
          running++;
          break;
        case "skipped":
          skipped++;
          break;
      }
      const candidate = job.completedAt ?? job.startedAt ?? job.requestedAt;
      if (candidate && (!lastUpdated || candidate > lastUpdated)) {
        lastUpdated = candidate;
      }
    }

    return {
      totalJobs: jobs.length,
      succeeded,
      failed,
      pending,
      running,
      skipped,
      lastUpdated,
    };
  },
});

export const getListingAgentByCanonicalId = query({
  args: { canonicalAgentId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("listingAgents")
      .withIndex("by_canonicalAgentId", (q) =>
        q.eq("canonicalAgentId", args.canonicalAgentId),
      )
      .unique();
  },
});

export const getListingAgentsForProperty = query({
  args: {
    propertyId: v.id("properties"),
    role: v.optional(v.union(v.literal("listing"), v.literal("buyer"))),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const links = args.role
      ? await ctx.db
          .query("propertyAgentLinks")
          .withIndex("by_propertyId_and_role", (q) =>
            q.eq("propertyId", args.propertyId).eq("role", args.role!),
          )
          .collect()
      : await ctx.db
          .query("propertyAgentLinks")
          .withIndex("by_propertyId", (q) =>
            q.eq("propertyId", args.propertyId),
          )
          .collect();

    const agents = [];
    for (const link of links) {
      const agent = await ctx.db.get(link.agentId);
      if (agent) agents.push({ ...agent, linkRole: link.role, linkSource: link.source });
    }
    return agents;
  },
});

export const getNeighborhoodContext = query({
  args: { geoKey: v.string(), windowDays: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("neighborhoodMarketContext")
      .withIndex("by_geoKey_and_windowDays", (q) =>
        q.eq("geoKey", args.geoKey).eq("windowDays", args.windowDays),
      )
      .unique();
  },
});

/** Returns only the most-recent estimate per portal. */
export const getPortalEstimates = query({
  args: { propertyId: v.id("properties") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("portalEstimates")
      .withIndex("by_propertyId_and_capturedAt", (q) =>
        q.eq("propertyId", args.propertyId),
      )
      .order("desc")
      .collect();

    const latestByPortal = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByPortal.has(row.portal)) {
        latestByPortal.set(row.portal, row);
      }
    }
    return Array.from(latestByPortal.values());
  },
});
