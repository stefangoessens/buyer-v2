// ═══════════════════════════════════════════════════════════════════════════
// Deal-Room Risk Summary Read Model (KIN-875)
//
// Typed query surface for buyer-safe and internal deal-room risk summaries.
// The composition is derived from typed backend state only:
//   - canonical property facts from `properties`
//   - file-analysis state from `contractMilestones`
//
// The pure composer lives in `convex/lib/riskSummary.ts` (mirrored at
// `src/lib/dealroom/risk-summary.ts`) so role filtering and risk naming are
// defined once.
// ═══════════════════════════════════════════════════════════════════════════

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  composeRiskSummary,
  type RiskMilestoneSnapshot,
  type RiskSummaryInputs,
} from "./lib/riskSummary";

const riskSeverityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

const riskSourceValidator = v.union(
  v.literal("canonical_property"),
  v.literal("file_analysis"),
);

const riskReviewStateValidator = v.union(
  v.literal("ready"),
  v.literal("review_required"),
);

const riskVisibilityValidator = v.union(
  v.literal("shared"),
  v.literal("internal"),
);

const riskNameValidator = v.union(
  v.literal("flood_zone_exposure"),
  v.literal("hoa_constraints"),
  v.literal("insurance_bindability"),
  v.literal("inspection_document_review"),
  v.literal("financing_document_review"),
  v.literal("appraisal_document_review"),
  v.literal("title_document_review"),
  v.literal("insurance_document_review"),
  v.literal("hoa_document_review"),
  v.literal("walkthrough_document_review"),
  v.literal("closing_document_review"),
  v.literal("other_document_review"),
);

const riskReviewReasonValidator = v.union(
  v.literal("low_confidence"),
  v.literal("ambiguous_date"),
  v.literal("missing_required"),
  v.literal("date_in_past"),
  v.literal("manual_flag"),
);

const riskSummaryItemValidator = v.object({
  id: v.string(),
  name: riskNameValidator,
  title: v.string(),
  summary: v.string(),
  severity: riskSeverityValidator,
  source: riskSourceValidator,
  reviewState: riskReviewStateValidator,
  visibility: riskVisibilityValidator,
  dueDate: v.optional(v.string()),
  internal: v.optional(
    v.object({
      sourceRecordType: v.literal("contract_milestone"),
      sourceRecordId: v.string(),
      reviewReason: v.optional(riskReviewReasonValidator),
      confidence: v.optional(v.number()),
    }),
  ),
});

const riskSummaryValidator = v.object({
  dealRoomId: v.string(),
  propertyId: v.string(),
  updatedAt: v.string(),
  status: v.union(
    v.literal("clear"),
    v.literal("attention"),
    v.literal("review_required"),
  ),
  highestSeverity: v.union(riskSeverityValidator, v.null()),
  counts: v.object({
    total: v.number(),
    low: v.number(),
    medium: v.number(),
    high: v.number(),
    reviewRequired: v.number(),
  }),
  items: v.array(riskSummaryItemValidator),
  internal: v.optional(
    v.object({
      hiddenFromBuyer: v.number(),
      totalBeforeFiltering: v.number(),
      sourceCounts: v.object({
        canonical_property: v.number(),
        file_analysis: v.number(),
      }),
    }),
  ),
});

/**
 * Get the composed risk-summary payload for a deal room. Buyers can only
 * see their own risk summary and receive the buyer-safe variant. Brokers
 * and admins receive the internal variant with file-analysis review items.
 */
export const getRiskSummary = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(v.null(), riskSummaryValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return null;
    }

    const property = await ctx.db.get(dealRoom.propertyId);
    if (!property) return null;

    const milestoneDocs = await ctx.db
      .query("contractMilestones")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const milestones: Array<RiskMilestoneSnapshot> = milestoneDocs.map(
      (milestone: Doc<"contractMilestones">) => ({
        id: milestone._id,
        name: milestone.name,
        workstream: milestone.workstream,
        dueDate: milestone.dueDate,
        status: milestone.status,
        flaggedForReview: milestone.flaggedForReview,
        reviewReason: milestone.reviewReason,
        confidence: milestone.confidence,
      }),
    );

    const latestMilestoneUpdate = milestoneDocs
      .map((milestone) => milestone.updatedAt)
      .sort()
      .at(-1);

    const inputs: RiskSummaryInputs = {
      dealRoomId: dealRoom._id,
      propertyId: dealRoom.propertyId,
      updatedAt: latestMilestoneUpdate ?? property.updatedAt ?? dealRoom.updatedAt,
      property: {
        floodZone: property.floodZone,
        hoaFee: property.hoaFee,
        roofYear: property.roofYear,
        yearBuilt: property.yearBuilt,
        impactWindows: property.impactWindows,
        stormShutters: property.stormShutters,
      },
      milestones,
    };

    const forRole =
      user.role === "broker" || user.role === "admin"
        ? user.role
        : ("buyer" as const);

    return composeRiskSummary(inputs, { forRole });
  },
});
