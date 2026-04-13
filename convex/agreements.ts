import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import { supersessionReason } from "./lib/validators";
import {
  applySupersessionState,
  resolveCurrentGoverningFromRows,
} from "./agreementSupersession";

// ═══ Queries ═══

/** Get all agreements for a deal room */
export const getByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    // Buyer can see own deal room agreements, broker/admin can see all
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];
    if (dealRoom.buyerId !== user._id && user.role !== "broker" && user.role !== "admin") return [];

    return await ctx.db
      .query("agreements")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
  },
});

/** Get the current governing agreement for a buyer. */
export const getCurrentGoverning = query({
  args: { buyerId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Only the buyer themselves or broker/admin can query governing agreement
    const user = await requireAuth(ctx);
    if (user._id !== args.buyerId && user.role !== "broker" && user.role !== "admin") {
      return null;
    }

    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.buyerId))
      .collect();

    return resolveCurrentGoverningFromRows(agreements);
  },
});

/** Internal query by ID */
export const getInternal = internalQuery({
  args: { agreementId: v.id("agreements") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agreementId);
  },
});

// ═══ Mutations ═══

/** Create a draft agreement (broker/admin only) */
export const createDraft = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    buyerId: v.id("users"),
    type: v.union(v.literal("tour_pass"), v.literal("full_representation")),
    documentStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("agreements"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can create agreements");
    }

    const id = await ctx.db.insert("agreements", {
      dealRoomId: args.dealRoomId,
      buyerId: args.buyerId,
      type: args.type,
      status: "draft",
      documentStorageId: args.documentStorageId,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agreement_created",
      entityType: "agreements",
      entityId: id,
      details: JSON.stringify({ type: args.type, dealRoomId: args.dealRoomId }),
      timestamp: new Date().toISOString(),
    });

    return id;
  },
});

/** Send agreement for signing (broker/admin only) — draft → sent */
export const sendForSigning = mutation({
  args: { agreementId: v.id("agreements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can send agreements");
    }

    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new Error("Agreement not found");
    if (agreement.status !== "draft") throw new Error("Can only send draft agreements");

    await ctx.db.patch(args.agreementId, { status: "sent" });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agreement_sent",
      entityType: "agreements",
      entityId: args.agreementId,
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});

/** Record buyer signature (broker/admin only) — sent → signed */
export const recordSignature = mutation({
  args: {
    agreementId: v.id("agreements"),
    documentStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can record signatures");
    }

    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new Error("Agreement not found");
    if (agreement.status !== "sent") throw new Error("Can only sign sent agreements");

    await ctx.db.patch(args.agreementId, {
      status: "signed",
      signedAt: new Date().toISOString(),
      documentStorageId: args.documentStorageId ?? agreement.documentStorageId,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agreement_signed",
      entityType: "agreements",
      entityId: args.agreementId,
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});

/** Cancel agreement (broker/admin only) — signed → canceled */
export const cancelAgreement = mutation({
  args: {
    agreementId: v.id("agreements"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can cancel agreements");
    }

    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new Error("Agreement not found");
    if (agreement.status !== "signed") throw new Error("Can only cancel signed agreements");

    await ctx.db.patch(args.agreementId, {
      status: "canceled",
      canceledAt: new Date().toISOString(),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agreement_canceled",
      entityType: "agreements",
      entityId: args.agreementId,
      details: args.reason ? JSON.stringify({ reason: args.reason }) : undefined,
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});

/** Replace agreement — cancels current + creates new replacement (broker/admin only) */
export const replaceAgreement = mutation({
  args: {
    currentAgreementId: v.id("agreements"),
    newType: v.union(v.literal("tour_pass"), v.literal("full_representation")),
    documentStorageId: v.optional(v.id("_storage")),
    reason: v.optional(supersessionReason),
  },
  returns: v.id("agreements"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can replace agreements");
    }

    const current = await ctx.db.get(args.currentAgreementId);
    if (!current) throw new Error("Current agreement not found");
    if (current.status !== "signed") throw new Error("Can only replace signed agreements");

    // Create the replacement — scoped to original buyer/deal room
    const newId = await ctx.db.insert("agreements", {
      dealRoomId: current.dealRoomId,
      buyerId: current.buyerId,
      type: args.newType,
      status: "draft",
      documentStorageId: args.documentStorageId,
    });

    const reason = args.reason ?? "broker_decision";
    const successor = await ctx.db.get(newId);
    if (!successor) {
      throw new Error("Replacement agreement was not created");
    }

    await applySupersessionState(ctx, {
      predecessor: current,
      successor,
      reason,
      actorUserId: user._id,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agreement_replaced",
      entityType: "agreements",
      entityId: args.currentAgreementId,
      details: JSON.stringify({
        replacedById: newId,
        newType: args.newType,
        reason,
      }),
      timestamp: new Date().toISOString(),
    });

    return newId;
  },
});
