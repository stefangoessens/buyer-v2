import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildNeighborhoodRequests } from "../src/lib/enrichment/jobContext";
import {
  buildCompCandidatesFromRecentSales,
  buildLeverageInputFromEnrichment,
  buildPricingInputFromEnrichment,
} from "../src/lib/enrichment/engineContext";

function summarizeJobs(jobs: Array<any>) {
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
}

async function loadListingAgentsForProperty(ctx: any, propertyId: Id<"properties">) {
  const links = await ctx.db
    .query("propertyAgentLinks")
    .withIndex("by_propertyId", (q: any) => q.eq("propertyId", propertyId))
    .collect();

  const agents: Array<any> = [];
  for (const link of links) {
    const agent = await ctx.db.get(link.agentId);
    if (!agent) continue;
    agents.push({
      ...agent,
      linkRole: link.role,
      linkSource: link.source,
      linkedAt: link.capturedAt,
    });
  }

  agents.sort((a, b) => (b.linkedAt ?? "").localeCompare(a.linkedAt ?? ""));
  return agents;
}

async function loadNeighborhoodContextsForProperty(ctx: any, property: any) {
  const requests = buildNeighborhoodRequests({
    canonicalId: property.canonicalId,
    sourcePlatform: property.sourcePlatform,
    address: {
      city: property.address.city,
      formatted: property.address.formatted,
      zip: property.address.zip,
    },
    subdivision: property.subdivision,
  });

  const rows: Array<any> = [];
  for (const request of requests) {
    const row = await ctx.db
      .query("neighborhoodMarketContext")
      .withIndex("by_geoKey_and_windowDays", (q: any) =>
        q.eq("geoKey", request.geoKey).eq("windowDays", request.windowDays),
      )
      .unique();
    if (row) rows.push(row);
  }
  return rows;
}

async function loadLatestPortalEstimates(ctx: any, propertyId: Id<"properties">) {
  const rows = await ctx.db
    .query("portalEstimates")
    .withIndex("by_propertyId_and_capturedAt", (q: any) =>
      q.eq("propertyId", propertyId),
    )
    .order("desc")
    .collect();

  const latestByPortal = new Map<string, any>();
  for (const row of rows) {
    if (!latestByPortal.has(row.portal)) {
      latestByPortal.set(row.portal, row);
    }
  }

  return Array.from(latestByPortal.values());
}

async function buildEnrichmentPayload(ctx: any, propertyId: Id<"properties">) {
  const property = await ctx.db.get(propertyId);
  if (!property) return null;

  const jobs = await ctx.db
    .query("enrichmentJobs")
    .withIndex("by_propertyId_and_source", (q: any) => q.eq("propertyId", propertyId))
    .collect();
  const snapshots = await ctx.db
    .query("propertyEnrichmentSnapshots")
    .withIndex("by_propertyId_and_source", (q: any) => q.eq("propertyId", propertyId))
    .collect();
  const listingAgents = await loadListingAgentsForProperty(ctx, propertyId);
  const neighborhoodContexts = await loadNeighborhoodContextsForProperty(ctx, property);
  const portalEstimates = await loadLatestPortalEstimates(ctx, propertyId);
  const recentSales = await ctx.db
    .query("recentComparableSales")
    .withIndex("by_propertyId_and_soldDate", (q: any) => q.eq("propertyId", propertyId))
    .order("desc")
    .collect();

  return {
    summary: summarizeJobs(jobs),
    snapshots,
    listingAgents,
    neighborhoodContexts,
    portalEstimates,
    recentSales,
    engineInputs: {
      pricing: buildPricingInputFromEnrichment({
        property,
        estimates: portalEstimates,
        contexts: neighborhoodContexts,
        recentSales,
      }),
      leverage: buildLeverageInputFromEnrichment({
        property,
        contexts: neighborhoodContexts,
        listingAgent: listingAgents.find((agent) => agent.linkRole === "listing") ?? null,
      }),
      compsCandidates: buildCompCandidatesFromRecentSales(recentSales),
    },
  };
}

function toBuyerSafeAgent(agent: any, includeContact: boolean) {
  return {
    canonicalAgentId: agent.canonicalAgentId,
    name: agent.name,
    brokerage: agent.brokerage,
    zillowProfileUrl: agent.zillowProfileUrl,
    redfinProfileUrl: agent.redfinProfileUrl,
    realtorProfileUrl: agent.realtorProfileUrl,
    activeListings: agent.activeListings,
    soldCount: agent.soldCount,
    avgDaysOnMarket: agent.avgDaysOnMarket,
    medianListToSellRatio: agent.medianListToSellRatio,
    priceCutFrequency: agent.priceCutFrequency,
    recentActivityCount: agent.recentActivityCount,
    provenance: agent.provenance,
    lastRefreshedAt: agent.lastRefreshedAt,
    phone: includeContact ? agent.phone : undefined,
    email: includeContact ? agent.email : undefined,
  };
}

export const getForPropertyInternal = internalQuery({
  args: { propertyId: v.id("properties") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await buildEnrichmentPayload(ctx, args.propertyId);
  },
});

export const getForProperty = query({
  args: {
    propertyId: v.id("properties"),
    includeInternal: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const payload = await buildEnrichmentPayload(ctx, args.propertyId);
    if (!payload) return null;

    return {
      summary: payload.summary,
      neighborhoodContexts: payload.neighborhoodContexts,
      portalEstimates: payload.portalEstimates,
      recentSales: payload.recentSales,
      listingAgents: payload.listingAgents.map((agent: any) =>
        toBuyerSafeAgent(agent, args.includeInternal ?? false),
      ),
      snapshots: args.includeInternal ? payload.snapshots : undefined,
      engineInputs: args.includeInternal ? payload.engineInputs : undefined,
    };
  },
});

export const enqueueScheduledRefreshes = internalMutation({
  args: {
    propertyIds: v.optional(v.array(v.id("properties"))),
    limit: v.optional(v.number()),
    forceRefresh: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      propertyId: v.id("properties"),
      jobCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    let propertyIds = args.propertyIds ?? [];

    if (propertyIds.length === 0) {
      const statuses = ["active", "pending", "contingent"] as const;
      const collected: Array<Id<"properties">> = [];
      for (const status of statuses) {
        const rows = await ctx.db
          .query("properties")
          .withIndex("by_status", (q: any) => q.eq("status", status))
          .take(limit);
        for (const row of rows) {
          if (collected.length >= limit) break;
          collected.push(row._id);
        }
        if (collected.length >= limit) break;
      }
      propertyIds = collected;
    }

    const results: Array<{ propertyId: Id<"properties">; jobCount: number }> = [];
    for (const propertyId of propertyIds.slice(0, limit)) {
      const jobIds: Array<Id<"enrichmentJobs">> = await ctx.runMutation(
        internal.enrichmentJobs.enqueueAllSourcesForProperty,
        {
          propertyId,
          forceRefresh: args.forceRefresh,
        },
      );
      results.push({
        propertyId,
        jobCount: jobIds.length,
      });
    }

    return results;
  },
});
