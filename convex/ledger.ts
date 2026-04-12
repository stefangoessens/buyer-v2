import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./lib/session";
import {
  feeLedgerEntryType,
  feeLedgerSource,
  financingType,
  compensationStatus,
} from "./lib/validators";

// ═══════════════════════════════════════════════════════════════════════════
// IPC VALIDATION HELPER (not exported as Convex function)
// ═══════════════════════════════════════════════════════════════════════════

type FinancingTypeValue = "cash" | "conventional" | "fha" | "va" | "other";

interface IpcValidationResult {
  valid: boolean;
  limit: number | null;
  message?: string;
}

/**
 * Validates Interested Party Contribution (IPC) limits based on financing type.
 *
 * IPC limits (as % of property price):
 * - cash: no limit
 * - conventional: 3% (LTV>90%), 6% (LTV>75%), 9% (LTV<=75%) — default assumes 80% LTV → 6%
 * - fha: 6%
 * - va: 4%
 * - other: no limit (warning logged)
 */
function validateIpcLimit(
  ft: FinancingTypeValue,
  amount: number,
  propertyPrice: number
): IpcValidationResult {
  if (propertyPrice <= 0) {
    return { valid: false, limit: null, message: "Property price must be positive" };
  }

  let limitPercent: number | null = null;

  switch (ft) {
    case "cash":
      return { valid: true, limit: null };

    case "conventional":
      // Simplified heuristic: assume 80% LTV → 6% limit
      limitPercent = 6;
      break;

    case "fha":
      limitPercent = 6;
      break;

    case "va":
      limitPercent = 4;
      break;

    case "other":
      console.warn("IPC validation: 'other' financing type — no IPC limit enforced");
      return { valid: true, limit: null, message: "No IPC limit for 'other' financing type" };
  }

  const limitAmount = (limitPercent / 100) * propertyPrice;
  if (amount > limitAmount) {
    return {
      valid: false,
      limit: limitPercent,
      message: `Amount $${amount} exceeds ${limitPercent}% IPC limit ($${limitAmount}) for ${ft} financing`,
    };
  }

  return { valid: true, limit: limitPercent };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/** Get all ledger entries for a deal room. Buyer sees own only; broker/admin sees all. */
export const getByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Verify deal room exists and check access
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];

    // Buyer can only see their own deal room entries
    if (user.role === "buyer" && dealRoom.buyerId !== user._id) {
      return [];
    }

    return await ctx.db
      .query("feeLedgerEntries")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
  },
});

/** Get computed fee summary for a deal room. */
export const getLedgerSummary = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    if (user.role === "buyer" && dealRoom.buyerId !== user._id) {
      return null;
    }

    const entries = await ctx.db
      .query("feeLedgerEntries")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    let totalExpectedFee = 0;
    let totalSellerCredits = 0;
    let totalBuyerCredits = 0;
    let projectedClosingCredit = 0;

    for (const entry of entries) {
      switch (entry.entryType) {
        case "fee_set":
          totalExpectedFee += entry.amount;
          break;
        case "seller_credit":
          totalSellerCredits += entry.amount;
          break;
        case "buyer_credit":
          totalBuyerCredits += entry.amount;
          break;
        case "closing_credit_projection":
          projectedClosingCredit += entry.amount;
          break;
        case "adjustment":
          // Adjustments can be positive or negative, applied to expected fee
          totalExpectedFee += entry.amount;
          break;
        // actual_closing is recorded but not part of projected summary
      }
    }

    const netBuyerObligation = totalExpectedFee - totalSellerCredits - totalBuyerCredits - projectedClosingCredit;

    return {
      dealRoomId: args.dealRoomId,
      totalExpectedFee,
      totalSellerCredits,
      totalBuyerCredits,
      projectedClosingCredit,
      netBuyerObligation: Math.max(0, netBuyerObligation),
      entryCount: entries.length,
    };
  },
});

/** Get current compensation status for a deal room. */
export const getCompensationStatus = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    if (user.role === "buyer" && dealRoom.buyerId !== user._id) {
      return null;
    }

    return await ctx.db
      .query("compensationStatus")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .unique();
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/** Internal: get compensation status without auth check. */
export const getCompensationStatusInternal = internalQuery({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compensationStatus")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .unique();
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Add a new fee ledger entry. Broker/admin only. Validates IPC limits. */
export const createEntry = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    entryType: feeLedgerEntryType,
    amount: v.number(),
    description: v.string(),
    source: feeLedgerSource,
    offerId: v.optional(v.id("offers")),
    contractId: v.optional(v.id("contracts")),
    financingType: v.optional(financingType),
  },
  returns: v.id("feeLedgerEntries"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    // Verify deal room exists
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    // Require financing type for credit entries — IPC validation is mandatory
    const isCreditEntry = args.entryType === "seller_credit" || args.entryType === "buyer_credit";
    if (isCreditEntry && !args.financingType) {
      throw new Error("financingType is required for credit entries to enforce IPC limits");
    }

    // Validate IPC limits for credit entries
    let ipcLimitPercent: number | undefined;
    if (args.financingType && isCreditEntry) {
      const property = await ctx.db.get(dealRoom.propertyId);
      if (property && property.listPrice) {
        const ipcResult = validateIpcLimit(args.financingType, args.amount, property.listPrice);
        ipcLimitPercent = ipcResult.limit ?? undefined;
        if (!ipcResult.valid) {
          throw new Error(ipcResult.message ?? "IPC limit exceeded");
        }
      }
    }

    const now = new Date().toISOString();

    const entryId = await ctx.db.insert("feeLedgerEntries", {
      dealRoomId: args.dealRoomId,
      entryType: args.entryType,
      amount: args.amount,
      description: args.description,
      source: args.source,
      provenance: {
        actorId: user._id,
        timestamp: now,
      },
      offerId: args.offerId,
      contractId: args.contractId,
      financingType: args.financingType,
      ipcLimitPercent,
      createdAt: now,
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "fee_ledger_entry_created",
      entityType: "feeLedgerEntries",
      entityId: entryId,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        entryType: args.entryType,
        amount: args.amount,
        source: args.source,
        ipcLimitPercent,
      }),
      timestamp: now,
    });

    return entryId;
  },
});

// Valid compensation status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  unknown: ["seller_disclosed_off_mls", "negotiated_in_offer", "buyer_paid"],
  seller_disclosed_off_mls: ["negotiated_in_offer", "buyer_paid"],
  negotiated_in_offer: ["buyer_paid"],
  buyer_paid: [],
};

/** Transition the compensation status state machine for a deal room. Broker/admin only. */
export const transitionCompensationStatus = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    newStatus: compensationStatus,
    reason: v.optional(v.string()),
    sellerDisclosedAmount: v.optional(v.number()),
    negotiatedAmount: v.optional(v.number()),
    buyerPaidAmount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    // Get current compensation status
    const current = await ctx.db
      .query("compensationStatus")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .unique();

    if (!current) {
      throw new Error("Compensation status not initialized for this deal room. Call initializeCompensationStatus first.");
    }

    // Validate the transition
    const allowedTargets = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowedTargets.includes(args.newStatus)) {
      throw new Error(
        `Invalid transition: ${current.status} → ${args.newStatus}. Allowed: ${allowedTargets.join(", ") || "none"}`
      );
    }

    // Validate required amounts per target status
    if (args.newStatus === "seller_disclosed_off_mls" && args.sellerDisclosedAmount === undefined) {
      throw new Error("sellerDisclosedAmount is required when transitioning to seller_disclosed_off_mls");
    }
    if (args.newStatus === "negotiated_in_offer" && args.negotiatedAmount === undefined) {
      throw new Error("negotiatedAmount is required when transitioning to negotiated_in_offer");
    }
    if (args.newStatus === "buyer_paid" && args.buyerPaidAmount === undefined) {
      throw new Error("buyerPaidAmount is required when transitioning to buyer_paid");
    }

    const now = new Date().toISOString();

    await ctx.db.patch(current._id, {
      status: args.newStatus,
      previousStatus: current.status,
      transitionReason: args.reason,
      transitionActorId: user._id,
      lastTransitionAt: now,
      updatedAt: now,
      ...(args.sellerDisclosedAmount !== undefined && { sellerDisclosedAmount: args.sellerDisclosedAmount }),
      ...(args.negotiatedAmount !== undefined && { negotiatedAmount: args.negotiatedAmount }),
      ...(args.buyerPaidAmount !== undefined && { buyerPaidAmount: args.buyerPaidAmount }),
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "compensation_status_transitioned",
      entityType: "compensationStatus",
      entityId: current._id,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        from: current.status,
        to: args.newStatus,
        reason: args.reason,
        sellerDisclosedAmount: args.sellerDisclosedAmount,
        negotiatedAmount: args.negotiatedAmount,
        buyerPaidAmount: args.buyerPaidAmount,
      }),
      timestamp: now,
    });

    return null;
  },
});

/** Initialize compensation status for a deal room (idempotent). Broker/admin only. */
export const initializeCompensationStatus = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    // Verify deal room exists
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    // Idempotent: check if already exists
    const existing = await ctx.db
      .query("compensationStatus")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .unique();

    if (existing) {
      // Already initialized — no-op
      return null;
    }

    const now = new Date().toISOString();

    const statusId = await ctx.db.insert("compensationStatus", {
      dealRoomId: args.dealRoomId,
      status: "unknown",
      lastTransitionAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "compensation_status_initialized",
      entityType: "compensationStatus",
      entityId: statusId,
      details: JSON.stringify({ dealRoomId: args.dealRoomId }),
      timestamp: now,
    });

    return null;
  },
});
