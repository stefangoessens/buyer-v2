// ═══════════════════════════════════════════════════════════════════════════
// Buyer Dashboard Deal Index (KIN-842)
//
// Typed query surface that returns a buyer's active and recent deal rooms
// plus summary badges. The dashboard UI consumes this directly — it does
// NOT join tables client-side because:
//   1. Role-based field filtering belongs at the boundary
//   2. The deal row shape is stable across web and iOS
//   3. The summary badges (most urgent, oldest active) need all rows to
//      compute, so doing it server-side avoids N queries
//
// Buyer-facing rows strip internal fields via the pure `buildDealIndex`
// helper — the boundary has a single choke point where policy is applied.
// ═══════════════════════════════════════════════════════════════════════════

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  buildDealIndex,
  type RawDealRoom,
  type RawProperty,
  type DashboardDealIndex,
} from "./lib/dashboardDealIndex";

// ───────────────────────────────────────────────────────────────────────────
// Return value shape — mirrored as a Convex validator so the dashboard
// client gets strongly-typed results without guessing at the JSON.
// ───────────────────────────────────────────────────────────────────────────

const dashboardDealRowValidator = v.object({
  dealRoomId: v.string(),
  propertyId: v.string(),
  status: v.union(
    v.literal("intake"),
    v.literal("analysis"),
    v.literal("tour_scheduled"),
    v.literal("offer_prep"),
    v.literal("offer_sent"),
    v.literal("under_contract"),
    v.literal("closing"),
    v.literal("closed"),
    v.literal("withdrawn"),
  ),
  category: v.union(v.literal("active"), v.literal("recent")),
  urgencyRank: v.number(),
  addressLine: v.string(),
  listPrice: v.union(v.number(), v.null()),
  beds: v.union(v.number(), v.null()),
  baths: v.union(v.number(), v.null()),
  sqft: v.union(v.number(), v.null()),
  primaryPhotoUrl: v.union(v.string(), v.null()),
  accessLevel: v.union(
    v.literal("anonymous"),
    v.literal("registered"),
    v.literal("full"),
  ),
  updatedAt: v.string(),
  hydrated: v.boolean(),
});

const dashboardIndexValidator = v.object({
  active: v.array(dashboardDealRowValidator),
  recent: v.array(dashboardDealRowValidator),
  summary: v.object({
    activeCount: v.number(),
    recentCount: v.number(),
    mostUrgentStatus: v.union(
      v.literal("intake"),
      v.literal("analysis"),
      v.literal("tour_scheduled"),
      v.literal("offer_prep"),
      v.literal("offer_sent"),
      v.literal("under_contract"),
      v.literal("closing"),
      v.literal("closed"),
      v.literal("withdrawn"),
      v.null(),
    ),
    oldestActiveDays: v.union(v.number(), v.null()),
    hasAnyDeals: v.boolean(),
  }),
});

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * Get the buyer's dashboard deal index — active and recent deal rooms
 * plus summary badges. Buyers can only read their own; brokers/admins
 * can optionally pass `buyerId` to inspect another buyer's dashboard
 * for support scenarios.
 */
export const getDealIndex = query({
  args: { buyerId: v.optional(v.id("users")) },
  returns: dashboardIndexValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Resolve the target buyer: self by default; broker/admin can override.
    const targetBuyerId = args.buyerId ?? user._id;
    if (
      targetBuyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      // Unauthorized cross-buyer access — return an empty index instead
      // of throwing so the UI can render a "no access" state gracefully.
      const empty: DashboardDealIndex = {
        active: [],
        recent: [],
        summary: {
          activeCount: 0,
          recentCount: 0,
          mostUrgentStatus: null,
          oldestActiveDays: null,
          hasAnyDeals: false,
        },
      };
      return empty;
    }

    // Pull all deal rooms for this buyer. Scoped query via the
    // `by_buyerId` index, no broader scan.
    const deals = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", targetBuyerId))
      .collect();

    // Shape deal rooms into the pure-TS input shape.
    const rawDeals: RawDealRoom[] = deals.map((d: Doc<"dealRooms">) => ({
      _id: d._id,
      propertyId: d.propertyId,
      buyerId: d.buyerId,
      status: d.status,
      accessLevel: d.accessLevel,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    // Fetch the linked properties in parallel. Missing properties
    // (e.g. still extracting) are fine — the row builder marks them
    // as `hydrated: false`.
    const propertyById = new Map<string, RawProperty>();
    const propertyIds = Array.from(new Set(deals.map((d) => d.propertyId)));
    const properties = await Promise.all(
      propertyIds.map((id) => ctx.db.get(id)),
    );
    for (const p of properties) {
      if (!p) continue;
      propertyById.set(p._id, {
        _id: p._id,
        canonicalId: p.canonicalId,
        address: {
          street: p.address.street,
          unit: p.address.unit,
          city: p.address.city,
          state: p.address.state,
          zip: p.address.zip,
          formatted: p.address.formatted,
        },
        listPrice: p.listPrice,
        beds: p.beds,
        bathsFull: p.bathsFull,
        bathsHalf: p.bathsHalf,
        sqftLiving: p.sqftLiving,
        photoUrls: p.photoUrls,
      });
    }

    return buildDealIndex(rawDeals, propertyById);
  },
});
