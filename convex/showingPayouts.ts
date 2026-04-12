import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/session";
import { payoutStatus } from "./lib/validators";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Default cooperating-brokerage fee used when a tour assignment has no
 * agentCoverage record (typical for Showami marketplace fallbacks, where the
 * agent is not part of our internal network). This matches our standard
 * Showami payout rate and can be overridden per geography in future work.
 *
 * FL Statute 475 allows cooperative arrangements between brokerages; this
 * constant is the flat per-showing fee the buyer-v2 brokerage owes the
 * cooperating brokerage for each completed showing.
 */
const DEFAULT_SHOWAMI_FEE = 75;

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES (public, broker/admin only)
// ═══════════════════════════════════════════════════════════════════════════════

/** Get the payout record for a specific tour assignment, or null if none exists. */
export const getByTourAssignment = query({
  args: { tourAssignmentId: v.id("tourAssignments") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    return await ctx.db
      .query("showingPayouts")
      .withIndex("by_tourAssignmentId", (q) =>
        q.eq("tourAssignmentId", args.tourAssignmentId)
      )
      .unique();
  },
});

/** Get all payouts for an agent, optionally filtered by status. */
export const getByAgent = query({
  args: {
    agentId: v.id("users"),
    status: v.optional(payoutStatus),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    const payouts = await ctx.db
      .query("showingPayouts")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();

    if (args.status) {
      return payouts.filter((p) => p.payoutStatus === args.status);
    }
    return payouts;
  },
});

/** Get all payouts with payoutStatus="pending". */
export const getPendingPayouts = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");

    return await ctx.db
      .query("showingPayouts")
      .withIndex("by_payoutStatus", (q) => q.eq("payoutStatus", "pending"))
      .collect();
  },
});

/** Get all payouts for a given batch month (YYYY-MM). */
export const getBatchForMonth = query({
  args: { batchMonth: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    return await ctx.db
      .query("showingPayouts")
      .withIndex("by_batchMonth", (q) => q.eq("batchMonth", args.batchMonth))
      .collect();
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPER (not a Convex function)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shared core logic for creating a payout obligation from a completed tour
 * assignment. Called by both the public and internal mutations.
 *
 * Throws if:
 *   - The tour assignment does not exist
 *   - The tour assignment is not in "completed" status
 *   - A payout already exists for this tour assignment
 */
async function createPayoutObligationCore(
  ctx: MutationCtx,
  tourAssignmentId: Id<"tourAssignments">,
  actorId: Id<"users"> | undefined
): Promise<Id<"showingPayouts">> {
  // a. Fetch the tour assignment
  const assignment = await ctx.db.get(tourAssignmentId);
  if (!assignment) {
    throw new Error("Tour assignment not found");
  }

  // b. Only completed assignments generate payout obligations
  if (assignment.status !== "completed") {
    throw new Error(
      `Cannot create payout for assignment in status '${assignment.status}'. Only completed assignments generate payouts.`
    );
  }

  // e. Idempotency — check if a payout already exists for this assignment
  const existing = await ctx.db
    .query("showingPayouts")
    .withIndex("by_tourAssignmentId", (q) =>
      q.eq("tourAssignmentId", tourAssignmentId)
    )
    .unique();
  if (existing) {
    throw new Error("Payout already exists for this tour assignment");
  }

  // c. Look up the agent's coverage record for fee + brokerage
  const coverage = await ctx.db
    .query("agentCoverage")
    .withIndex("by_agentId", (q) => q.eq("agentId", assignment.agentId))
    .unique();

  // d. Fallback for Showami (or any agent not in our coverage network).
  // Use DEFAULT_SHOWAMI_FEE and a best-effort brokerage label.
  let feeAmount: number;
  let brokerage: string;
  if (coverage) {
    feeAmount = coverage.fixedFeePerShowing;
    brokerage = coverage.brokerage;
  } else {
    feeAmount = DEFAULT_SHOWAMI_FEE;
    // For Showami fallbacks we don't know the cooperating brokerage name at
    // this point — reconciliation/invoicing will reconcile via
    // showamiFallbackId when the invoice lands.
    brokerage =
      assignment.routingPath === "showami"
        ? "Showami (cooperating brokerage TBD)"
        : "Unknown brokerage";
  }

  const now = new Date().toISOString();

  // f. Create the payout record in pending status
  const payoutId = await ctx.db.insert("showingPayouts", {
    tourAssignmentId,
    tourId: assignment.tourId,
    agentId: assignment.agentId,
    brokerage,
    feeAmount,
    payoutStatus: "pending" as const,
    createdAt: now,
    updatedAt: now,
  });

  // g. Audit log
  await ctx.db.insert("auditLog", {
    userId: actorId,
    action: "showing_payout_created",
    entityType: "showingPayouts",
    entityId: payoutId,
    details: JSON.stringify({
      tourAssignmentId,
      tourId: assignment.tourId,
      agentId: assignment.agentId,
      brokerage,
      feeAmount,
      routingPath: assignment.routingPath,
      usedDefaultFee: !coverage,
    }),
    timestamp: now,
  });

  return payoutId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS (public, broker/admin only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a payout obligation for a completed tour assignment.
 *
 * This is the broker-facing entry point for manually creating a payout (e.g.,
 * for retroactive entries or Showami reconciliation). The normal flow uses
 * `createPayoutObligationInternal`, which is called automatically when a tour
 * assignment is marked completed.
 */
export const createPayoutObligation = mutation({
  args: { tourAssignmentId: v.id("tourAssignments") },
  returns: v.id("showingPayouts"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    return await createPayoutObligationCore(ctx, args.tourAssignmentId, user._id);
  },
});

/**
 * Approve a pending payout. Transitions pending → approved.
 * Captures the approving user, approval timestamp, and an optional invoice
 * reference / notes string.
 */
export const approvePayout = mutation({
  args: {
    payoutId: v.id("showingPayouts"),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found");

    if (payout.payoutStatus !== "pending") {
      throw new Error(
        `Cannot approve payout in status '${payout.payoutStatus}'. Only pending payouts can be approved.`
      );
    }

    const now = new Date().toISOString();

    await ctx.db.patch(args.payoutId, {
      payoutStatus: "approved",
      approvedBy: user._id,
      approvedAt: now,
      updatedAt: now,
      ...(args.notes !== undefined && { invoiceReference: args.notes }),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "showing_payout_approved",
      entityType: "showingPayouts",
      entityId: args.payoutId,
      details: JSON.stringify({
        feeAmount: payout.feeAmount,
        brokerage: payout.brokerage,
        notes: args.notes,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Mark an approved payout as paid. Transitions approved → paid.
 * Sets paidAt to now and optionally records an invoice reference from the
 * accounting system.
 */
export const markPayoutPaid = mutation({
  args: {
    payoutId: v.id("showingPayouts"),
    invoiceReference: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout not found");

    if (payout.payoutStatus !== "approved") {
      throw new Error(
        `Cannot mark paid: payout is in status '${payout.payoutStatus}'. Only approved payouts can be marked paid.`
      );
    }

    const now = new Date().toISOString();

    await ctx.db.patch(args.payoutId, {
      payoutStatus: "paid",
      paidAt: now,
      updatedAt: now,
      ...(args.invoiceReference !== undefined && {
        invoiceReference: args.invoiceReference,
      }),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "showing_payout_paid",
      entityType: "showingPayouts",
      entityId: args.payoutId,
      details: JSON.stringify({
        feeAmount: payout.feeAmount,
        brokerage: payout.brokerage,
        invoiceReference: args.invoiceReference ?? payout.invoiceReference,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Generate a monthly batch: assign batchMonth to all pending/approved payouts
 * whose tour assignment was completed in the target month. Idempotent — already
 * batched payouts are skipped.
 *
 * Returns the IDs of the payouts included in this batch.
 */
export const generateMonthlyBatch = mutation({
  args: { batchMonth: v.string() },
  returns: v.array(v.id("showingPayouts")),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    // Validate batchMonth format (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(args.batchMonth)) {
      throw new Error("batchMonth must be in YYYY-MM format");
    }

    // a. Gather all pending + approved payouts not yet batched
    const pendingPayouts = await ctx.db
      .query("showingPayouts")
      .withIndex("by_payoutStatus", (q) => q.eq("payoutStatus", "pending"))
      .collect();

    const approvedPayouts = await ctx.db
      .query("showingPayouts")
      .withIndex("by_payoutStatus", (q) => q.eq("payoutStatus", "approved"))
      .collect();

    const candidates = [...pendingPayouts, ...approvedPayouts].filter(
      (p) => p.batchMonth === undefined
    );

    const now = new Date().toISOString();
    const batched: Id<"showingPayouts">[] = [];

    for (const payout of candidates) {
      // b. Check the associated tour assignment's completedAt
      const assignment = await ctx.db.get(payout.tourAssignmentId);
      if (!assignment || !assignment.completedAt) continue;
      if (!assignment.completedAt.startsWith(args.batchMonth)) continue;

      // c. Patch the payout with the batchMonth
      await ctx.db.patch(payout._id, {
        batchMonth: args.batchMonth,
        updatedAt: now,
      });

      batched.push(payout._id);

      // d. Audit log per payout included in the batch
      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "showing_payout_batched",
        entityType: "showingPayouts",
        entityId: payout._id,
        details: JSON.stringify({
          batchMonth: args.batchMonth,
          feeAmount: payout.feeAmount,
          brokerage: payout.brokerage,
          payoutStatus: payout.payoutStatus,
        }),
        timestamp: now,
      });
    }

    return batched;
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (no auth — for use by other Convex functions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Internal: create a payout obligation without an auth check. Called by the
 * tour assignment module when an assignment is marked completed, so that the
 * payout obligation is automatically recorded without requiring the caller to
 * be authenticated as a broker.
 */
export const createPayoutObligationInternal = internalMutation({
  args: { tourAssignmentId: v.id("tourAssignments") },
  returns: v.id("showingPayouts"),
  handler: async (ctx, args) => {
    return await createPayoutObligationCore(ctx, args.tourAssignmentId, undefined);
  },
});
