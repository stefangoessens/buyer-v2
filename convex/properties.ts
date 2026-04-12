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
