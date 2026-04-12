import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/session";

// ─── Constants ──────────────────────────────────────────────────────────────
const DISCREPANCY_THRESHOLD = 50; // $50 — flag discrepancies above this amount

// Entry types that contribute to the expected total (everything except actual_closing and adjustment)
const EXPECTED_ENTRY_TYPES = [
  "fee_set",
  "seller_credit",
  "buyer_credit",
  "closing_credit_projection",
] as const;

// Credit entry types that offset the buyer's obligation (subtracted from fee)
const CREDIT_ENTRY_TYPES: readonly string[] = ["seller_credit", "buyer_credit", "closing_credit_projection"];

/** Compute expected net total with correct sign semantics (fee minus credits). */
function computeExpectedTotal(entries: Array<{ entryType: string; amount: number }>): number {
  return entries
    .filter((e) => (EXPECTED_ENTRY_TYPES as readonly string[]).includes(e.entryType))
    .reduce((sum, e) => {
      // Credits offset the fee — subtract them
      if (CREDIT_ENTRY_TYPES.includes(e.entryType)) {
        return sum - e.amount;
      }
      return sum + e.amount;
    }, 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Get all reconciliation reports for a deal room. Broker/admin only. */
export const getReportsByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    return await ctx.db
      .query("reconciliationReports")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
  },
});

/** Get all reconciliation reports for a given month. Broker/admin only. */
export const getReportsByMonth = query({
  args: { reportMonth: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    return await ctx.db
      .query("reconciliationReports")
      .withIndex("by_reportMonth", (q) => q.eq("reportMonth", args.reportMonth))
      .collect();
  },
});

/** Get all reports with discrepancyFlag=true and reviewStatus="pending". Broker/admin only. */
export const getPendingDiscrepancies = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");

    const pending = await ctx.db
      .query("reconciliationReports")
      .withIndex("by_reviewStatus", (q) => q.eq("reviewStatus", "pending"))
      .collect();

    return pending.filter((r) => r.discrepancyFlag === true);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS (public, broker/admin only)
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate a post-close reconciliation report for a deal room. */
export const generatePostCloseReport = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.id("reconciliationReports"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const ledgerEntries = await ctx.db
      .query("feeLedgerEntries")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    // Expected total: fee minus credits (same sign semantics as ledger summary)
    const expectedTotal = computeExpectedTotal(ledgerEntries);

    // Actual total: from actual_closing entry (take most recent if multiple)
    const actualEntries = ledgerEntries
      .filter((e) => e.entryType === "actual_closing")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const actualTotal = actualEntries.length > 0 ? actualEntries[0].amount : undefined;

    // Compute discrepancy
    let discrepancyAmount: number | undefined;
    let discrepancyFlag = false;
    let discrepancyDetails: string | undefined;

    if (actualTotal !== undefined) {
      discrepancyAmount = Math.abs(expectedTotal - actualTotal);
      discrepancyFlag = discrepancyAmount > DISCREPANCY_THRESHOLD;
      if (discrepancyFlag) {
        discrepancyDetails = `Expected $${expectedTotal.toFixed(2)}, actual $${actualTotal.toFixed(2)}. Discrepancy: $${discrepancyAmount.toFixed(2)} exceeds $${DISCREPANCY_THRESHOLD} threshold.`;
      }
    }

    const now = new Date().toISOString();

    const reportId = await ctx.db.insert("reconciliationReports", {
      dealRoomId: args.dealRoomId,
      reportType: "post_close",
      expectedTotal,
      actualTotal,
      discrepancyAmount,
      discrepancyFlag,
      discrepancyDetails,
      reviewStatus: "pending",
      generatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "reconciliation_report_generated",
      entityType: "reconciliationReports",
      entityId: reportId,
      details: JSON.stringify({
        reportType: "post_close",
        dealRoomId: args.dealRoomId,
        expectedTotal,
        actualTotal,
        discrepancyFlag,
      }),
      timestamp: now,
    });

    return reportId;
  },
});

/** Record actual closing statement amount and auto-generate post-close report. */
export const recordActualClosing = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    actualAmount: v.number(),
    sourceDocument: v.optional(v.string()),
  },
  returns: v.id("reconciliationReports"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const now = new Date().toISOString();

    // Create the actual_closing ledger entry
    const entryId = await ctx.db.insert("feeLedgerEntries", {
      dealRoomId: args.dealRoomId,
      entryType: "actual_closing",
      amount: args.actualAmount,
      description: "Actual closing statement amount",
      source: "closing_statement",
      provenance: {
        actorId: user._id,
        triggeredBy: "reconciliation.recordActualClosing",
        sourceDocument: args.sourceDocument,
        timestamp: now,
      },
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "actual_closing_recorded",
      entityType: "feeLedgerEntries",
      entityId: entryId,
      details: JSON.stringify({
        actualAmount: args.actualAmount,
        sourceDocument: args.sourceDocument,
      }),
      timestamp: now,
    });

    // Now generate the post-close reconciliation report inline
    const ledgerEntries = await ctx.db
      .query("feeLedgerEntries")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    // Expected total: fee minus credits (same sign semantics as ledger summary)
    const expectedTotal = computeExpectedTotal(ledgerEntries);

    // Use the just-recorded actual amount
    const actualTotal = args.actualAmount;
    const discrepancyAmount = Math.abs(expectedTotal - actualTotal);
    const discrepancyFlag = discrepancyAmount > DISCREPANCY_THRESHOLD;
    const discrepancyDetails = discrepancyFlag
      ? `Expected $${expectedTotal.toFixed(2)}, actual $${actualTotal.toFixed(2)}. Discrepancy: $${discrepancyAmount.toFixed(2)} exceeds $${DISCREPANCY_THRESHOLD} threshold.`
      : undefined;

    const reportId = await ctx.db.insert("reconciliationReports", {
      dealRoomId: args.dealRoomId,
      reportType: "post_close",
      expectedTotal,
      actualTotal,
      discrepancyAmount,
      discrepancyFlag,
      discrepancyDetails,
      reviewStatus: "pending",
      generatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "reconciliation_report_generated",
      entityType: "reconciliationReports",
      entityId: reportId,
      details: JSON.stringify({
        reportType: "post_close",
        dealRoomId: args.dealRoomId,
        expectedTotal,
        actualTotal,
        discrepancyFlag,
      }),
      timestamp: now,
    });

    return reportId;
  },
});

/** Generate monthly reconciliation reports for all deal rooms closed in a given month. */
export const generateMonthlyReport = mutation({
  args: { reportMonth: v.string() },
  returns: v.array(v.id("reconciliationReports")),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    // Validate reportMonth format (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(args.reportMonth)) {
      throw new Error("reportMonth must be in YYYY-MM format");
    }

    // Find all closed deal rooms — collect and filter by updatedAt month
    const closedDealRooms = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId_and_status")
      .collect();

    const matchingRooms = closedDealRooms.filter(
      (dr) => dr.status === "closed" && dr.updatedAt.startsWith(args.reportMonth)
    );

    const now = new Date().toISOString();
    const reportIds: Id<"reconciliationReports">[] = [];

    for (const dealRoom of matchingRooms) {
      const ledgerEntries = await ctx.db
        .query("feeLedgerEntries")
        .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", dealRoom._id))
        .collect();

      const expectedTotal = computeExpectedTotal(ledgerEntries);

      const actualEntries = ledgerEntries
        .filter((e) => e.entryType === "actual_closing")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const actualTotal = actualEntries.length > 0 ? actualEntries[0].amount : undefined;

      let discrepancyAmount: number | undefined;
      let discrepancyFlag = false;
      let discrepancyDetails: string | undefined;

      if (actualTotal !== undefined) {
        discrepancyAmount = Math.abs(expectedTotal - actualTotal);
        discrepancyFlag = discrepancyAmount > DISCREPANCY_THRESHOLD;
        if (discrepancyFlag) {
          discrepancyDetails = `Expected $${expectedTotal.toFixed(2)}, actual $${actualTotal.toFixed(2)}. Discrepancy: $${discrepancyAmount.toFixed(2)} exceeds $${DISCREPANCY_THRESHOLD} threshold.`;
        }
      }

      const reportId = await ctx.db.insert("reconciliationReports", {
        dealRoomId: dealRoom._id,
        reportType: "monthly",
        expectedTotal,
        actualTotal,
        discrepancyAmount,
        discrepancyFlag,
        discrepancyDetails,
        reviewStatus: "pending",
        reportMonth: args.reportMonth,
        generatedAt: now,
      });

      reportIds.push(reportId);

      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "reconciliation_report_generated",
        entityType: "reconciliationReports",
        entityId: reportId,
        details: JSON.stringify({
          reportType: "monthly",
          reportMonth: args.reportMonth,
          dealRoomId: dealRoom._id,
          expectedTotal,
          actualTotal,
          discrepancyFlag,
        }),
        timestamp: now,
      });
    }

    return reportIds;
  },
});

/** Mark a discrepancy report as reviewed or resolved. */
export const reviewDiscrepancy = mutation({
  args: {
    reportId: v.id("reconciliationReports"),
    reviewStatus: v.union(v.literal("reviewed"), v.literal("resolved")),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Reconciliation report not found");

    const now = new Date().toISOString();

    await ctx.db.patch(args.reportId, {
      reviewStatus: args.reviewStatus,
      reviewedBy: user._id,
      reviewedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "reconciliation_discrepancy_reviewed",
      entityType: "reconciliationReports",
      entityId: args.reportId,
      details: JSON.stringify({
        reviewStatus: args.reviewStatus,
        notes: args.notes,
        previousStatus: report.reviewStatus,
      }),
      timestamp: now,
    });

    return null;
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (no auth — for use by other Convex functions)
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate a post-close reconciliation report without auth. For internal use (e.g., deal room status transitions). */
export const generatePostCloseReportInternal = internalMutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.id("reconciliationReports"),
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const ledgerEntries = await ctx.db
      .query("feeLedgerEntries")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const expectedTotal = ledgerEntries
      .filter((e) => (EXPECTED_ENTRY_TYPES as readonly string[]).includes(e.entryType))
      .reduce((sum, e) => sum + e.amount, 0);

    const actualEntries = ledgerEntries
      .filter((e) => e.entryType === "actual_closing")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const actualTotal = actualEntries.length > 0 ? actualEntries[0].amount : undefined;

    let discrepancyAmount: number | undefined;
    let discrepancyFlag = false;
    let discrepancyDetails: string | undefined;

    if (actualTotal !== undefined) {
      discrepancyAmount = Math.abs(expectedTotal - actualTotal);
      discrepancyFlag = discrepancyAmount > DISCREPANCY_THRESHOLD;
      if (discrepancyFlag) {
        discrepancyDetails = `Expected $${expectedTotal.toFixed(2)}, actual $${actualTotal.toFixed(2)}. Discrepancy: $${discrepancyAmount.toFixed(2)} exceeds $${DISCREPANCY_THRESHOLD} threshold.`;
      }
    }

    const now = new Date().toISOString();

    const reportId = await ctx.db.insert("reconciliationReports", {
      dealRoomId: args.dealRoomId,
      reportType: "post_close",
      expectedTotal,
      actualTotal,
      discrepancyAmount,
      discrepancyFlag,
      discrepancyDetails,
      reviewStatus: "pending",
      generatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "reconciliation_report_generated",
      entityType: "reconciliationReports",
      entityId: reportId,
      details: JSON.stringify({
        reportType: "post_close",
        dealRoomId: args.dealRoomId,
        expectedTotal,
        actualTotal,
        discrepancyFlag,
        internal: true,
      }),
      timestamp: now,
    });

    return reportId;
  },
});
