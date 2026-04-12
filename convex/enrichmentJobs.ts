import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

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
);

type EnrichmentSource =
  | "fema_flood"
  | "county_appraiser"
  | "census_geocode"
  | "cross_portal_match"
  | "listing_agent_profile"
  | "neighborhood_market"
  | "portal_estimates"
  | "recent_sales";

const SOURCE_PRIORITY: Record<EnrichmentSource, number> = {
  cross_portal_match: 10,
  portal_estimates: 20,
  census_geocode: 30,
  fema_flood: 40,
  county_appraiser: 50,
  listing_agent_profile: 60,
  neighborhood_market: 70,
  recent_sales: 80,
};

const ALL_SOURCES: EnrichmentSource[] = [
  "cross_portal_match",
  "portal_estimates",
  "census_geocode",
  "fema_flood",
  "county_appraiser",
  "listing_agent_profile",
  "neighborhood_market",
  "recent_sales",
];

/** Cache freshness horizons per source, in hours. Jobs succeeded within this
 *  window are still considered fresh — `enqueueJob` returns the existing id
 *  as a no-op rather than kicking off a redundant fetch. */
const SOURCE_CACHE_TTL_HOURS: Record<EnrichmentSource, number> = {
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
  },
  returns: v.id("enrichmentJobs"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", args.dedupeKey))
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

/** Enqueue every source for a freshly intaken property. */
export const enqueueAllSourcesForProperty = internalMutation({
  args: { propertyId: v.id("properties") },
  returns: v.array(v.id("enrichmentJobs")),
  handler: async (ctx, args) => {
    const jobIds: Array<Id<"enrichmentJobs">> = [];
    const now = new Date().toISOString();

    for (const source of ALL_SOURCES) {
      const dedupeKey = buildDedupeKey(args.propertyId, source);
      const existing = await ctx.db
        .query("enrichmentJobs")
        .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
        .first();

      if (existing) {
        if (existing.status === "pending" || existing.status === "running") {
          jobIds.push(existing._id);
          continue;
        }
        if (existing.status === "succeeded" && existing.completedAt) {
          const ttlMs = SOURCE_CACHE_TTL_HOURS[source] * 60 * 60 * 1000;
          const completedAtMs = Date.parse(existing.completedAt);
          if (Number.isFinite(completedAtMs) && Date.now() - completedAtMs < ttlMs) {
            jobIds.push(existing._id);
            continue;
          }
        }
      }

      const jobId = await ctx.db.insert("enrichmentJobs", {
        propertyId: args.propertyId,
        source,
        status: "pending" as const,
        attempt: 0,
        maxAttempts: 3,
        priority: SOURCE_PRIORITY[source],
        requestedAt: now,
        dedupeKey,
      });
      jobIds.push(jobId);
    }

    await ctx.db.insert("auditLog", {
      action: "enrichment_all_sources_enqueued",
      entityType: "properties",
      entityId: args.propertyId,
      details: JSON.stringify({ jobCount: jobIds.length }),
      timestamp: now,
    });

    return jobIds;
  },
});

export const markRunning = internalMutation({
  args: { jobId: v.id("enrichmentJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Enrichment job not found");
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

    const patch: Record<string, unknown> = {};
    const changedKeys: string[] = [];

    const apply = (key: string, value: unknown) => {
      if (value === undefined || value === null) return;
      if (!existing || (existing as Record<string, unknown>)[key] !== value) {
        patch[key] = value;
        changedKeys.push(key);
      }
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

    const existingProvenance = (existing?.provenance ?? {}) as Record<
      string,
      { source: string; fetchedAt: string }
    >;
    const nextProvenance = { ...existingProvenance };
    for (const key of changedKeys) {
      nextProvenance[key] = {
        source: observation.source,
        fetchedAt: observation.fetchedAt,
      };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        provenance: nextProvenance,
        lastRefreshedAt: observation.fetchedAt,
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
