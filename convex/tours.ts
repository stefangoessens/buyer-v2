import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

/** Request a tour — requires signed tour_pass agreement */
export const requestTour = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    propertyId: v.id("properties"),
    scheduledAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id("tours"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Check for signed tour_pass agreement
    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId_and_type", (q) =>
        q.eq("buyerId", user._id).eq("type", "tour_pass")
      )
      .collect();
    const hasTourPass = agreements.some((a) => a.status === "signed");

    if (!hasTourPass) {
      throw new Error("A signed Tour Pass agreement is required before requesting a tour");
    }

    const id = await ctx.db.insert("tours", {
      dealRoomId: args.dealRoomId,
      propertyId: args.propertyId,
      buyerId: user._id,
      status: "requested",
      scheduledAt: args.scheduledAt,
      notes: args.notes,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_requested",
      entityType: "tours",
      entityId: id,
      details: JSON.stringify({ dealRoomId: args.dealRoomId, propertyId: args.propertyId }),
      timestamp: new Date().toISOString(),
    });

    return id;
  },
});

/** List tours for the authenticated buyer */
export const listByBuyer = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return await ctx.db
      .query("tours")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .collect();
  },
});

/** List tours for an agent (broker/admin) */
export const listByAgent = query({
  args: { agentId: v.id("users") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    return await ctx.db
      .query("tours")
      .withIndex("by_agentId_and_status", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

/** Update tour status (broker/admin only) */
export const updateStatus = mutation({
  args: {
    tourId: v.id("tours"),
    status: v.union(
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("canceled"),
      v.literal("no_show")
    ),
    agentId: v.optional(v.id("users")),
    scheduledAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can update tour status");
    }

    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");

    // Validate transition
    const validTransitions: Record<string, string[]> = {
      requested: ["confirmed", "canceled"],
      confirmed: ["completed", "canceled", "no_show"],
    };
    const allowed = validTransitions[tour.status] ?? [];
    if (!allowed.includes(args.status)) {
      throw new Error(`Cannot transition from ${tour.status} to ${args.status}`);
    }

    const patch: Record<string, unknown> = { status: args.status };
    if (args.agentId) patch.agentId = args.agentId;
    if (args.scheduledAt) patch.scheduledAt = args.scheduledAt;
    if (args.notes) patch.notes = args.notes;
    if (args.status === "completed") patch.completedAt = new Date().toISOString();

    await ctx.db.patch(args.tourId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: `tour_${args.status}`,
      entityType: "tours",
      entityId: args.tourId,
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});
