import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireRole } from "./lib/session";
import {
  DISCREPANCY_THRESHOLD_DOLLARS,
  computeCompensationReconciliation,
} from "./lib/compensationLedger";
import { reconciliationReportType, reconciliationReviewStatus } from "./lib/validators";

const reconciliationReportRow = v.object({
  _id: v.id("reconciliationReports"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  reportType: reconciliationReportType,
  expectedTotal: v.number(),
  actualTotal: v.optional(v.number()),
  discrepancyAmount: v.optional(v.number()),
  discrepancyFlag: v.boolean(),
  discrepancyDetails: v.optional(v.string()),
  reviewStatus: reconciliationReviewStatus,
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.string()),
  reportMonth: v.optional(v.string()),
  generatedAt: v.string(),
});

const monthlySummaryRow = v.object({
  dealRoomId: v.id("dealRooms"),
  reportId: v.id("reconciliationReports"),
  expectedTotal: v.number(),
  actualTotal: v.optional(v.number()),
  discrepancyAmount: v.optional(v.number()),
  discrepancyFlag: v.boolean(),
  reviewStatus: reconciliationReviewStatus,
  generatedAt: v.string(),
});

async function getLedgerEntries(
  ctx: { db: { query: (table: "feeLedgerEntries") => any } },
  dealRoomId: Id<"dealRooms">,
) {
  return (await ctx.db
    .query("feeLedgerEntries")
    .withIndex("by_dealRoomId", (q: any) => q.eq("dealRoomId", dealRoomId))
    .collect()) as Array<Doc<"feeLedgerEntries">>;
}

async function createReconciliationReport(
  ctx: any,
  args: {
    dealRoomId: Id<"dealRooms">;
    reportType: "post_close" | "monthly";
    reportMonth?: string;
    actorUserId?: Id<"users">;
  },
) {
  const entries = await getLedgerEntries(ctx, args.dealRoomId);
  const result = computeCompensationReconciliation(
    entries.map((entry) => ({
      entryType: entry.entryType,
      amount: entry.amount,
      createdAt: entry.createdAt,
      adjustmentTarget: entry.adjustmentTarget,
    })),
    DISCREPANCY_THRESHOLD_DOLLARS,
  );

  const now = new Date().toISOString();
  const reportId = await ctx.db.insert("reconciliationReports", {
    dealRoomId: args.dealRoomId,
    reportType: args.reportType,
    expectedTotal: result.expectedTotal,
    actualTotal: result.actualTotal,
    discrepancyAmount: result.discrepancyAmount,
    discrepancyFlag: result.discrepancyFlag,
    discrepancyDetails: result.discrepancyDetails,
    reviewStatus: "pending",
    reportMonth: args.reportMonth,
    generatedAt: now,
  });

  await ctx.db.insert("auditLog", {
    userId: args.actorUserId,
    action: "reconciliation_report_generated",
    entityType: "reconciliationReports",
    entityId: reportId,
    details: JSON.stringify({
      reportType: args.reportType,
      reportMonth: args.reportMonth ?? null,
      dealRoomId: args.dealRoomId,
      expectedTotal: result.expectedTotal,
      actualTotal: result.actualTotal ?? null,
      discrepancyFlag: result.discrepancyFlag,
    }),
    timestamp: now,
  });

  return reportId;
}

export const getReportsByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(reconciliationReportRow),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("reconciliationReports")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
  },
});

export const getReportsByMonth = query({
  args: { reportMonth: v.string() },
  returns: v.array(reconciliationReportRow),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("reconciliationReports")
      .withIndex("by_reportMonth", (q) => q.eq("reportMonth", args.reportMonth))
      .collect();
  },
});

export const getMonthlyTransactionSummary = query({
  args: { reportMonth: v.string() },
  returns: v.array(monthlySummaryRow),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    const reports = (await ctx.db
      .query("reconciliationReports")
      .withIndex("by_reportMonth", (q) => q.eq("reportMonth", args.reportMonth))
      .collect()) as Array<Doc<"reconciliationReports">>;

    return reports
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .map((report) => ({
        dealRoomId: report.dealRoomId,
        reportId: report._id,
        expectedTotal: report.expectedTotal,
        actualTotal: report.actualTotal,
        discrepancyAmount: report.discrepancyAmount,
        discrepancyFlag: report.discrepancyFlag,
        reviewStatus: report.reviewStatus,
        generatedAt: report.generatedAt,
      }));
  },
});

export const getPendingDiscrepancies = query({
  args: {},
  returns: v.array(reconciliationReportRow),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");
    const pending = (await ctx.db
      .query("reconciliationReports")
      .withIndex("by_reviewStatus", (q) => q.eq("reviewStatus", "pending"))
      .collect()) as Array<Doc<"reconciliationReports">>;
    return pending.filter((report) => report.discrepancyFlag);
  },
});

export const generatePostCloseReport = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.id("reconciliationReports"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    return await createReconciliationReport(ctx, {
      dealRoomId: args.dealRoomId,
      reportType: "post_close",
      actorUserId: user._id,
    });
  },
});

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
    const entryId = await ctx.db.insert("feeLedgerEntries", {
      dealRoomId: args.dealRoomId,
      entryType: "actual_closing_credit",
      amount: args.actualAmount,
      description: "Actual closing statement credit",
      source: "closing_statement",
      lifecycleEvent: "closing_statement_recorded",
      provenance: {
        actorId: user._id,
        triggeredBy: "reconciliation.recordActualClosing",
        sourceDocument: args.sourceDocument,
        timestamp: now,
      },
      internalReviewState: "pending",
      visibility: "buyer_visible",
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "actual_closing_recorded",
      entityType: "feeLedgerEntries",
      entityId: entryId,
      details: JSON.stringify({
        actualAmount: args.actualAmount,
        sourceDocument: args.sourceDocument ?? null,
      }),
      timestamp: now,
    });

    await ctx.runMutation(internal.ledger.recordLifecycleEventInternal, {
      dealRoomId: args.dealRoomId,
      lifecycleEvent: "closing_statement_recorded",
      actorUserId: user._id,
      sourceDocument: args.sourceDocument,
      dealStatusAtChange: dealRoom.status,
      internalReviewState: "pending",
    });

    return await createReconciliationReport(ctx, {
      dealRoomId: args.dealRoomId,
      reportType: "post_close",
      actorUserId: user._id,
    });
  },
});

export const generateMonthlyReport = mutation({
  args: { reportMonth: v.string() },
  returns: v.array(v.id("reconciliationReports")),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    if (!/^\d{4}-\d{2}$/.test(args.reportMonth)) {
      throw new Error("reportMonth must be in YYYY-MM format");
    }

    const dealRooms = (await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId_and_status")
      .collect()) as Array<Doc<"dealRooms">>;
    const closedRooms = dealRooms.filter(
      (dealRoom) =>
        dealRoom.status === "closed" &&
        dealRoom.updatedAt.startsWith(args.reportMonth),
    );

    const reportIds: Array<Id<"reconciliationReports">> = [];
    for (const dealRoom of closedRooms) {
      reportIds.push(
        await createReconciliationReport(ctx, {
          dealRoomId: dealRoom._id,
          reportType: "monthly",
          reportMonth: args.reportMonth,
          actorUserId: user._id,
        }),
      );
    }

    return reportIds;
  },
});

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
        previousStatus: report.reviewStatus,
        reviewStatus: args.reviewStatus,
        notes: args.notes ?? null,
      }),
      timestamp: now,
    });

    return null;
  },
});

export const generatePostCloseReportInternal = internalMutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.id("reconciliationReports"),
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    return await createReconciliationReport(ctx, {
      dealRoomId: args.dealRoomId,
      reportType: "post_close",
    });
  },
});
