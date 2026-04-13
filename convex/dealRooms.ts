import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import { getCurrentUser, requireAuth } from "./lib/session";

/** Get a deal room with access-level-gated property data */
export const get = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    const property = await ctx.db.get(dealRoom.propertyId);
    if (!property) return null;

    // Check auth
    const user = await getCurrentUser(ctx);
    let accessLevel: "anonymous" | "registered" | "full" = "anonymous";

    if (user) {
      if (user.role === "broker" || user.role === "admin") {
        accessLevel = "full";
      } else if (dealRoom.buyerId === user._id) {
        accessLevel = dealRoom.accessLevel;
      } else {
        accessLevel = "registered";
      }
    }

    // Filter property fields by access level
    const TEASER_FIELDS = [
      "canonicalId", "address", "status", "listPrice", "beds", "bathsFull",
      "bathsHalf", "sqftLiving", "propertyType", "yearBuilt", "photoUrls",
      "photoCount", "pool", "waterfrontType", "hoaFee", "hoaFrequency",
    ];

    let propertyData = property;
    if (accessLevel === "anonymous") {
      const filtered: Record<string, unknown> = { _id: property._id };
      for (const field of TEASER_FIELDS) {
        if (field in property) {
          filtered[field] = (property as Record<string, unknown>)[field];
        }
      }
      propertyData = filtered as typeof property;
    }

    const enrichment: any = await ctx.runQuery(
      internal.enrichment.getForPropertyInternal,
      { propertyId: dealRoom.propertyId },
    );

    const includeAgentContact = accessLevel === "full";
    const enrichmentData = enrichment
      ? {
          summary: enrichment.summary,
          neighborhoodContexts: enrichment.neighborhoodContexts,
          portalEstimates: enrichment.portalEstimates,
          recentSales: enrichment.recentSales,
          listingAgents: enrichment.listingAgents.map((agent: any) => ({
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
            phone: includeAgentContact ? agent.phone : undefined,
            email: includeAgentContact ? agent.email : undefined,
          })),
          snapshots: accessLevel === "full" ? enrichment.snapshots : undefined,
          engineInputs: accessLevel === "full" ? enrichment.engineInputs : undefined,
        }
      : null;

    return {
      dealRoom,
      property: propertyData,
      accessLevel,
      enrichment: enrichmentData,
    };
  },
});

/** Get deal room without access gating (internal use) */
export const getInternal = internalQuery({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;
    const property = await ctx.db.get(dealRoom.propertyId);
    return { dealRoom, property };
  },
});

/** List deal rooms for the authenticated buyer */
export const listForBuyer = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .collect();
  },
});

/** Create a deal room for a property + buyer */
export const create = mutation({
  args: {
    propertyId: v.id("properties"),
  },
  returns: v.union(v.id("dealRooms"), v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // Check for existing deal room
    const existing = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .collect();
    const alreadyExists = existing.find((dr) => dr.propertyId === args.propertyId);
    if (alreadyExists) {
      await ctx.runMutation(api.leadAttribution.markConverted, {
        userId: user._id,
      });
      return alreadyExists._id;
    }

    const dealRoomId = await ctx.db.insert("dealRooms", {
      propertyId: args.propertyId,
      buyerId: user._id,
      status: "intake",
      accessLevel: "registered",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await ctx.runMutation(api.leadAttribution.markConverted, {
      userId: user._id,
    });

    return dealRoomId;
  },
});

/** Upgrade access level (e.g., after agreement signing) */
export const upgradeAccess = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    newLevel: v.union(v.literal("registered"), v.literal("full")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    // Only the owner or broker/admin can upgrade
    if (dealRoom.buyerId !== user._id && user.role !== "broker" && user.role !== "admin") {
      throw new Error("Not authorized");
    }

    // "full" requires a signed agreement — only broker/admin can grant it
    if (args.newLevel === "full" && user.role !== "broker" && user.role !== "admin") {
      const signedAgreement = await ctx.db
        .query("agreements")
        .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
        .collect();
      const hasSigned = signedAgreement.some((a) => a.status === "signed");
      if (!hasSigned) {
        throw new Error("A signed agreement is required for full access");
      }
    }

    await ctx.db.patch(args.dealRoomId, {
      accessLevel: args.newLevel,
      updatedAt: new Date().toISOString(),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "deal_room_access_upgraded",
      entityType: "dealRooms",
      entityId: args.dealRoomId,
      details: JSON.stringify({ newLevel: args.newLevel }),
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});
