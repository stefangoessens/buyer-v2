/**
 * Property case synthesis — Convex persistence + cache (KIN-854).
 *
 * The synthesis itself is a pure function in
 * `src/lib/ai/engines/caseSynthesis.ts`. This module handles:
 *   - Persisting synthesized cases keyed by (propertyId, inputHash)
 *   - Serving cached cases without recomputing
 *   - Auth-gating reads (buyers see their own deal rooms, brokers/admins
 *     see everything)
 *
 * Cache semantics: two cases with the same `inputHash` and
 * `synthesisVersion` are byte-identical. When the caller runs the
 * synthesizer and gets a hash that already exists in the cache, it
 * bumps `hitCount` and returns the existing row.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Check whether the authenticated caller is allowed to read cases for a
 * given propertyId. Returns true if the caller is broker/admin OR owns a
 * deal room that references this property. Returns false otherwise —
 * without a deal-room ownership check, any signed-in user could read
 * another buyer's synthesized claims by guessing a propertyId.
 */
async function canReadProperty(
  ctx: QueryCtx,
  propertyId: Id<"properties">,
): Promise<boolean> {
  const user = await requireAuth(ctx);
  if (user.role === "broker" || user.role === "admin") return true;

  // Buyer must own at least one deal room tied to this property.
  const buyerRooms = await ctx.db
    .query("dealRooms")
    .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
    .collect();
  return buyerRooms.some((r) => r.propertyId === propertyId);
}

// ═══ Queries ═══

/**
 * Look up a cached case by (propertyId, inputHash). Returns null on miss.
 * Auth-gated — the caller must be able to see the property's deal room,
 * or be broker/admin.
 */
export const getCached = query({
  args: {
    propertyId: v.id("properties"),
    inputHash: v.string(),
    synthesisVersion: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Caller must own a deal room on this property, or be broker/admin.
    // Without this check, any signed-in user could read another buyer's
    // synthesized claims by guessing a propertyId — property IDs are
    // exposed by existing property queries so this would be a practical
    // cross-account data leak.
    const allowed = await canReadProperty(ctx, args.propertyId);
    if (!allowed) return null;

    const cached = await ctx.db
      .query("propertyCases")
      .withIndex("by_propertyId_and_inputHash", (q) =>
        q.eq("propertyId", args.propertyId).eq("inputHash", args.inputHash),
      )
      .unique();

    if (!cached) return null;
    if (cached.synthesisVersion !== args.synthesisVersion) return null;

    return cached;
  },
});

/**
 * Get the latest cached case for a property. Used when the caller just
 * wants "whatever the most recent synthesis is" without providing an
 * input hash.
 */
export const getLatestForProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const allowed = await canReadProperty(ctx, args.propertyId);
    if (!allowed) return null;

    const cases = await ctx.db
      .query("propertyCases")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    if (cases.length === 0) return null;

    return cases
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .at(0);
  },
});

// ═══ Mutations ═══

/**
 * Upsert a synthesized case. If (propertyId, inputHash, version) already
 * exists, this is a no-op that bumps hitCount — the caller can treat it
 * as "tell the cache you're serving this". If it's new, insert the row.
 *
 * Broker/admin only — synthesis should be triggered by broker workflows,
 * not by buyers loading a deal room. (Buyers read via getCached /
 * getLatestForProperty.)
 */
export const upsertCase = mutation({
  args: {
    propertyId: v.id("properties"),
    dealRoomId: v.optional(v.id("dealRooms")),
    inputHash: v.string(),
    synthesisVersion: v.string(),
    payload: v.string(),
    overallConfidence: v.number(),
    contributingEngines: v.number(),
    droppedEngines: v.array(v.string()),
  },
  returns: v.id("propertyCases"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can persist synthesized cases");
    }

    // If the dealRoomId is provided, validate it belongs to the same property.
    if (args.dealRoomId) {
      const dealRoom = await ctx.db.get(args.dealRoomId);
      if (!dealRoom) throw new Error("Deal room not found");
      if (dealRoom.propertyId !== args.propertyId) {
        throw new Error("Deal room does not match the specified property");
      }
    }

    const existing = await ctx.db
      .query("propertyCases")
      .withIndex("by_propertyId_and_inputHash", (q) =>
        q.eq("propertyId", args.propertyId).eq("inputHash", args.inputHash),
      )
      .unique();

    const now = new Date().toISOString();
    if (existing && existing.synthesisVersion === args.synthesisVersion) {
      // Cache hit — bump hit count and return
      await ctx.db.patch(existing._id, {
        hitCount: existing.hitCount + 1,
      });
      return existing._id;
    }

    if (existing) {
      // Same inputHash but different synthesisVersion — delete stale row.
      await ctx.db.delete(existing._id);
    }

    const id = await ctx.db.insert("propertyCases", {
      propertyId: args.propertyId,
      dealRoomId: args.dealRoomId,
      inputHash: args.inputHash,
      synthesisVersion: args.synthesisVersion,
      payload: args.payload,
      overallConfidence: args.overallConfidence,
      contributingEngines: args.contributingEngines,
      droppedEngines: args.droppedEngines,
      generatedAt: now,
      hitCount: 0,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "property_case_synthesized",
      entityType: "propertyCases",
      entityId: id,
      details: JSON.stringify({
        propertyId: args.propertyId,
        contributingEngines: args.contributingEngines,
        droppedEngines: args.droppedEngines,
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Purge all cached cases for a property. Used when underlying data has
 * changed enough that every synthesis is stale (e.g., a big schema
 * migration on the property record). Broker/admin only.
 */
export const purgeForProperty = mutation({
  args: { propertyId: v.id("properties") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can purge property cases");
    }

    const cases = await ctx.db
      .query("propertyCases")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    for (const c of cases) {
      await ctx.db.delete(c._id);
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "property_cases_purged",
      entityType: "properties",
      entityId: args.propertyId,
      details: JSON.stringify({ count: cases.length }),
      timestamp: new Date().toISOString(),
    });

    return cases.length;
  },
});

// ═══ Internal mutations (for background sync / calibration) ═══

/**
 * Evict cache entries older than `maxAgeHours`. Scheduled cron.
 */
export const evictOldCache = internalMutation({
  args: { maxAgeHours: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cutoff = new Date(
      Date.now() - args.maxAgeHours * 60 * 60 * 1000,
    ).toISOString();
    const all = await ctx.db.query("propertyCases").collect();
    let evicted = 0;
    for (const c of all) {
      if (c.generatedAt < cutoff) {
        await ctx.db.delete(c._id);
        evicted++;
      }
    }
    return evicted;
  },
});
