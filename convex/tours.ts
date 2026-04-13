import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/session";

/** Request a tour — requires a current signed governing agreement */
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

    const governingAgreement = await ctx.runQuery(
      internal.agreements.getCurrentGoverningInternal,
      { buyerId: user._id },
    );

    if (!governingAgreement || governingAgreement.status !== "signed") {
      throw new Error(
        "A signed Tour Pass or Full Representation agreement is required before requesting a tour",
      );
    }

    // Validate deal room belongs to this buyer
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom || dealRoom.buyerId !== user._id) {
      throw new Error("Deal room not found or not owned by this buyer");
    }

    const id = await ctx.db.insert("tours", {
      dealRoomId: args.dealRoomId,
      propertyId: dealRoom.propertyId,
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

/** List unassigned requested tours (broker/admin — for assignment queue) */
export const listUnassigned = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    // Get all requested tours and filter for unassigned
    const requested = await ctx.db
      .query("tours")
      .collect();
    return requested.filter((t) => t.status === "requested" && !t.agentId);
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
