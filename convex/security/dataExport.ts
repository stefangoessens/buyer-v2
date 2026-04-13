import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";

// Internal query to collect all buyer data
export const collectBuyerData = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const profile = await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const messagePreferences = await ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const dealRooms = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.userId))
      .collect();

    const dealRoomIds = dealRooms.map((dr) => dr._id);

    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.userId))
      .collect();

    const tours = await ctx.db
      .query("tours")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.userId))
      .collect();

    const offers = [];
    for (const drId of dealRoomIds) {
      const drOffers = await ctx.db
        .query("offers")
        .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", drId))
        .collect();
      offers.push(...drOffers);
    }

    const auditEntries = await ctx.db
      .query("auditLog")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      exportedAt: new Date().toISOString(),
      user,
      profile,
      messagePreferences,
      dealRooms,
      agreements,
      tours,
      offers,
      auditLog: auditEntries,
    };
  },
});

// Log the export action
export const logExport = internalMutation({
  args: { userId: v.id("users"), requestedBy: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", {
      userId: args.requestedBy,
      action: "ccpa_data_export",
      entityType: "users",
      entityId: args.userId,
      details: JSON.stringify({ exportedUserId: args.userId }),
      timestamp: new Date().toISOString(),
    });
    return null;
  },
});
