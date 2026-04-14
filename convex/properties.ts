import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { propertyId: v.id("properties") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.propertyId);
  },
});

export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("contingent"),
      v.literal("sold"),
      v.literal("withdrawn")
    ),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("properties")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(limit);
  },
});

/** Get a property by ID (internal — used by engine actions) */
export const getInternal = internalQuery({
  args: { propertyId: v.id("properties") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.propertyId);
  },
});

export const getByCanonicalId = query({
  args: { canonicalId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("properties")
      .withIndex("by_canonicalId", (q) => q.eq("canonicalId", args.canonicalId))
      .unique();
  },
});

export const getPublic = query({
  args: { propertyId: v.id("properties") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("properties"),
      address: v.object({
        street: v.string(),
        unit: v.optional(v.string()),
        city: v.string(),
        state: v.string(),
        zip: v.string(),
        formatted: v.optional(v.string()),
      }),
      listPrice: v.optional(v.number()),
      propertyType: v.optional(v.string()),
      beds: v.optional(v.number()),
      bathsFull: v.optional(v.number()),
      bathsHalf: v.optional(v.number()),
      sqftLiving: v.optional(v.number()),
      lotSize: v.optional(v.number()),
      yearBuilt: v.optional(v.number()),
      description: v.optional(v.string()),
      photoUrls: v.optional(v.array(v.string())),
      photoCount: v.optional(v.number()),
      daysOnMarket: v.optional(v.number()),
      sourcePlatform: v.union(
        v.literal("zillow"),
        v.literal("redfin"),
        v.literal("realtor"),
        v.literal("manual")
      ),
      status: v.union(
        v.literal("active"),
        v.literal("pending"),
        v.literal("contingent"),
        v.literal("sold"),
        v.literal("withdrawn")
      ),
      updatedAt: v.string(),
      // KIN-1072: Broward PAPA enrichment (surfaced for AssessedVsListedInsight)
      papaFolio: v.optional(v.string()),
      papaCurrentOwner: v.optional(v.string()),
      papaIsCorporate: v.optional(v.boolean()),
      papaAssessedValue: v.optional(v.number()),
      papaJustValue: v.optional(v.number()),
      papaExemptions: v.optional(v.array(v.string())),
    })
  ),
  handler: async (ctx, args) => {
    const property = await ctx.db.get(args.propertyId);
    if (!property) return null;
    return {
      _id: property._id,
      address: {
        street: property.address.street,
        unit: property.address.unit,
        city: property.address.city,
        state: property.address.state,
        zip: property.address.zip,
        formatted: property.address.formatted,
      },
      listPrice: property.listPrice,
      propertyType: property.propertyType,
      beds: property.beds,
      bathsFull: property.bathsFull,
      bathsHalf: property.bathsHalf,
      sqftLiving: property.sqftLiving,
      lotSize: property.lotSize,
      yearBuilt: property.yearBuilt,
      description: property.description,
      photoUrls: property.photoUrls,
      photoCount: property.photoCount,
      daysOnMarket: property.daysOnMarket,
      sourcePlatform: property.sourcePlatform,
      status: property.status,
      updatedAt: property.updatedAt,
      papaFolio: property.papaFolio,
      papaCurrentOwner: property.papaCurrentOwner,
      papaIsCorporate: property.papaIsCorporate,
      papaAssessedValue: property.papaAssessedValue,
      papaJustValue: property.papaJustValue,
      papaExemptions: property.papaExemptions,
    };
  },
});
