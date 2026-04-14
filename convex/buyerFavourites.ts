import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/session";

export const addFavourite = mutation({
  args: {
    propertyId: v.id("properties"),
    note: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id("buyerFavourites"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("buyerFavourites")
      .withIndex("by_userId_propertyId", (q) =>
        q.eq("userId", user._id).eq("propertyId", args.propertyId),
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("buyerFavourites", {
      userId: user._id,
      propertyId: args.propertyId,
      createdAt: new Date().toISOString(),
      note: args.note,
      tags: args.tags,
    });
  },
});

export const removeFavourite = mutation({
  args: { propertyId: v.id("properties") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("buyerFavourites")
      .withIndex("by_userId_propertyId", (q) =>
        q.eq("userId", user._id).eq("propertyId", args.propertyId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const isFavourite = query({
  args: { propertyId: v.id("properties") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const existing = await ctx.db
      .query("buyerFavourites")
      .withIndex("by_userId_propertyId", (q) =>
        q.eq("userId", user._id).eq("propertyId", args.propertyId),
      )
      .unique();
    return existing !== null;
  },
});

export const listFavourites = query({
  args: {},
  returns: v.array(
    v.object({
      favouriteId: v.id("buyerFavourites"),
      propertyId: v.id("properties"),
      createdAt: v.string(),
      note: v.optional(v.string()),
      tags: v.array(v.string()),
      property: v.union(
        v.null(),
        v.object({
          _id: v.id("properties"),
          address: v.object({
            street: v.string(),
            unit: v.optional(v.string()),
            city: v.string(),
            state: v.string(),
            zip: v.string(),
            county: v.optional(v.string()),
            formatted: v.optional(v.string()),
          }),
          listPrice: v.optional(v.number()),
          beds: v.optional(v.number()),
          bathsFull: v.optional(v.number()),
          bathsHalf: v.optional(v.number()),
          sqftLiving: v.optional(v.number()),
          yearBuilt: v.optional(v.number()),
          photoUrls: v.optional(v.array(v.string())),
          propertyType: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const favourites = await ctx.db
      .query("buyerFavourites")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return await Promise.all(
      favourites.map(async (fav) => {
        const property = await ctx.db.get(fav.propertyId);
        return {
          favouriteId: fav._id,
          propertyId: fav.propertyId,
          createdAt: fav.createdAt,
          note: fav.note,
          tags: fav.tags ?? [],
          property: property
            ? {
                _id: property._id,
                address: property.address,
                listPrice: property.listPrice,
                beds: property.beds,
                bathsFull: property.bathsFull,
                bathsHalf: property.bathsHalf,
                sqftLiving: property.sqftLiving,
                yearBuilt: property.yearBuilt,
                photoUrls: property.photoUrls,
                propertyType: property.propertyType,
              }
            : null,
        };
      }),
    );
  },
});
