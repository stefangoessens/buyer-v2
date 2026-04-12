import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

/** Create contract from approved offer */
export const createFromOffer = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.id("offers"),
    adapterRun: v.any(), // AdapterRun JSON
  },
  returns: v.id("contracts"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can create contracts");
    }

    // Verify offer exists and is approved
    const offer = await ctx.db.get(args.offerId);
    if (!offer) throw new Error("Offer not found");
    if (offer.status !== "approved" && offer.status !== "accepted") {
      throw new Error("Offer must be approved or accepted to create a contract");
    }

    const id = await ctx.db.insert("contracts", {
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      status: "pending_signatures",
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "contract_created",
      entityType: "contracts",
      entityId: id,
      details: JSON.stringify({ offerId: args.offerId, adapterStatus: (args.adapterRun as Record<string, unknown>)?.status }),
      timestamp: new Date().toISOString(),
    });

    return id;
  },
});

/** Get contracts for a deal room */
export const getByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contracts")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
  },
});

/** Update contract status (broker/admin) */
export const updateStatus = mutation({
  args: {
    contractId: v.id("contracts"),
    status: v.union(
      v.literal("fully_executed"),
      v.literal("amended"),
      v.literal("terminated")
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can update contract status");
    }

    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contract not found");

    await ctx.db.patch(args.contractId, { status: args.status });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: `contract_${args.status}`,
      entityType: "contracts",
      entityId: args.contractId,
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});

/** Record e-signature event (internal — webhook handler) */
export const recordSignatureEvent = internalMutation({
  args: {
    contractId: v.id("contracts"),
    event: v.union(v.literal("sent"), v.literal("viewed"), v.literal("signed"), v.literal("declined")),
    signerEmail: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) return null;

    // Auto-update status on signed event
    if (args.event === "signed") {
      await ctx.db.patch(args.contractId, { status: "fully_executed" });
    }

    await ctx.db.insert("auditLog", {
      action: `signature_${args.event}`,
      entityType: "contracts",
      entityId: args.contractId,
      details: JSON.stringify({ signerEmail: args.signerEmail, metadata: args.metadata }),
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});
