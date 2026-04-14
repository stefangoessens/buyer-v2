/**
 * Contract milestones — Convex module (KIN-806).
 *
 * CRUD + review workflow for closing milestones extracted from a contract.
 * The extractor lives in `src/lib/contracts/milestones.ts`; this module
 * handles persistence, auth, and the review queue lifecycle.
 *
 * View model rules:
 *   - Buyers see milestones for their own deal room, with status and due date,
 *     but NOT the linkedClauseText (internal evidence only).
 *   - Brokers/admins see everything, including flagged milestones and
 *     clause evidence.
 *
 * The split is enforced in the query handlers below via a `stripInternal`
 * helper — we never rely on the client to filter.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/session";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ═══ Shared validators ═══

const workstreamValidator = v.union(
  v.literal("inspection"),
  v.literal("financing"),
  v.literal("appraisal"),
  v.literal("title"),
  v.literal("insurance"),
  v.literal("escrow"),
  v.literal("hoa"),
  v.literal("walkthrough"),
  v.literal("closing"),
  v.literal("other"),
);

const reviewReasonValidator = v.union(
  v.literal("low_confidence"),
  v.literal("ambiguous_date"),
  v.literal("missing_required"),
  v.literal("date_in_past"),
  v.literal("manual_flag"),
);

const sourceValidator = v.union(
  v.literal("auto_extracted"),
  v.literal("manual"),
  v.literal("amended"),
);

const extractedMilestoneValidator = v.object({
  name: v.string(),
  workstream: workstreamValidator,
  dueDate: v.string(),
  confidence: v.number(),
  flaggedForReview: v.boolean(),
  reviewReason: v.optional(reviewReasonValidator),
  linkedClauseText: v.optional(v.string()),
  // KIN-1080: stable key for closing command center template anchoring.
  milestoneKey: v.optional(v.string()),
});

// ═══ Internal helpers ═══

/** Check if the current user can access a deal room. Returns the role class. */
async function assertDealRoomAccess(
  ctx: QueryCtx,
  dealRoomId: string,
): Promise<"buyer" | "broker" | "admin" | null> {
  const user = await requireAuth(ctx);
  const dealRoom = await ctx.db.get(dealRoomId as never);
  if (!dealRoom) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dr = dealRoom as any;
  if (dr.buyerId === user._id) return "buyer";
  if (user.role === "broker") return "broker";
  if (user.role === "admin") return "admin";
  return null;
}

/** Strip internal-only fields from a milestone for buyer-facing responses. */
function stripInternal(milestone: Record<string, unknown>): Record<string, unknown> {
  const {
    linkedClauseText: _clause,
    flaggedForReview: _flag,
    reviewReason: _reason,
    confidence: _conf,
    ...buyerVisible
  } = milestone;
  return buyerVisible;
}

function isBuyerVisibleMilestone(milestone: { status: string }): boolean {
  return milestone.status !== "needs_review";
}

async function persistExtractionBatch(
  ctx: any,
  args: {
    contractId: Id<"contracts">;
    milestones: Array<{
      name: string;
      workstream:
        | "inspection"
        | "financing"
        | "appraisal"
        | "title"
        | "insurance"
        | "escrow"
        | "hoa"
        | "walkthrough"
        | "closing"
        | "other";
      dueDate: string;
      confidence: number;
      flaggedForReview: boolean;
      reviewReason?: "low_confidence" | "ambiguous_date" | "missing_required" | "date_in_past" | "manual_flag";
      linkedClauseText?: string;
      milestoneKey?: string;
    }>;
    actorUserId: Id<"users">;
  },
): Promise<Array<Id<"contractMilestones">>> {
  const contract = await ctx.db.get(args.contractId);
  if (!contract) throw new Error("Contract not found");

  // Delete previously auto_extracted AND amended milestones for this
  // contract — keeps manual ones intact. Amended rows came from an earlier
  // auto-extraction that was reviewed and corrected; re-running extraction
  // replaces them with fresh data from the new contract text. Without this,
  // amended rows would accumulate and create duplicate milestones over time.
  const existing = await ctx.db
    .query("contractMilestones")
    .withIndex("by_contractId", (q: any) => q.eq("contractId", args.contractId))
    .collect();
  for (const m of existing) {
    if (m.source === "auto_extracted" || m.source === "amended") {
      await ctx.db.delete(m._id);
    }
  }

  const now = new Date().toISOString();
  const insertedIds: Array<Id<"contractMilestones">> = [];
  for (const input of args.milestones) {
    const status = input.flaggedForReview ? "needs_review" : "pending";
    const id = await ctx.db.insert("contractMilestones", {
      contractId: args.contractId,
      dealRoomId: contract.dealRoomId,
      name: input.name,
      milestoneKey: input.milestoneKey,
      workstream: input.workstream,
      dueDate: input.dueDate,
      status,
      source: "auto_extracted",
      confidence: input.confidence,
      flaggedForReview: input.flaggedForReview,
      reviewReason: input.reviewReason,
      linkedClauseText: input.linkedClauseText,
      createdAt: now,
      updatedAt: now,
    });
    insertedIds.push(id);
  }

  await ctx.db.insert("auditLog", {
    userId: args.actorUserId,
    action: "contract_milestones_extracted",
    entityType: "contracts",
    entityId: args.contractId,
    details: JSON.stringify({
      count: args.milestones.length,
      flaggedCount: args.milestones.filter((m) => m.flaggedForReview).length,
    }),
    timestamp: now,
  });

  // KIN-1080: refresh any template-driven closing tasks that anchor to
  // one of these milestones. Manual-override tasks are preserved by the
  // sync helper.
  await ctx.runMutation(
    internal.closingCommandCenter.syncClosingTaskDeadlinesFromMilestones,
    { dealRoomId: contract.dealRoomId as Id<"dealRooms"> },
  );

  return insertedIds;
}

// ═══ Queries ═══

/** List milestones for a contract — access-level filtered. */
export const listByContract = query({
  args: { contractId: v.id("contracts") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) return [];

    const accessLevel = await assertDealRoomAccess(ctx, contract.dealRoomId);
    if (!accessLevel) return [];

    const milestones = await ctx.db
      .query("contractMilestones")
      .withIndex("by_contractId", (q) => q.eq("contractId", args.contractId))
      .collect();

    const sorted = milestones.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (accessLevel === "buyer") {
      return sorted
        .filter(isBuyerVisibleMilestone)
        .map(stripInternal);
    }
    return sorted;
  },
});

/** List all milestones for a deal room — access-level filtered. */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const accessLevel = await assertDealRoomAccess(ctx, args.dealRoomId);
    if (!accessLevel) return [];

    const milestones = await ctx.db
      .query("contractMilestones")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const sorted = milestones.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (accessLevel === "buyer") {
      return sorted
        .filter(isBuyerVisibleMilestone)
        .map(stripInternal);
    }
    return sorted;
  },
});

/** Review queue: list all flagged milestones. Broker/admin only. */
export const listFlaggedForReview = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    const flagged = await ctx.db
      .query("contractMilestones")
      .withIndex("by_flaggedForReview", (q) => q.eq("flaggedForReview", true))
      .take(args.limit ?? 50);
    return flagged;
  },
});

// ═══ Mutations ═══

/**
 * Insert a batch of extracted milestones for a contract. Broker/admin only.
 * Called by the action layer after running `extractMilestones` on the contract
 * text. Replaces any auto-extracted milestones for the same contract — manual
 * milestones are preserved.
 */
export const createFromExtraction = mutation({
  args: {
    contractId: v.id("contracts"),
    milestones: v.array(extractedMilestoneValidator),
  },
  returns: v.array(v.id("contractMilestones")),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can create contract milestones");
    }

    return await persistExtractionBatch(ctx, {
      contractId: args.contractId,
      milestones: args.milestones,
      actorUserId: user._id,
    });
  },
});

export const createFromExtractionInternal = internalMutation({
  args: {
    contractId: v.id("contracts"),
    actorUserId: v.id("users"),
    milestones: v.array(extractedMilestoneValidator),
  },
  returns: v.array(v.id("contractMilestones")),
  handler: async (ctx, args) => {
    return await persistExtractionBatch(ctx, {
      contractId: args.contractId,
      milestones: args.milestones,
      actorUserId: args.actorUserId,
    });
  },
});

/**
 * Add a single milestone manually — used when the extractor missed something
 * or a broker wants to add a custom step. Broker/admin only.
 */
export const createManual = mutation({
  args: {
    contractId: v.id("contracts"),
    name: v.string(),
    workstream: workstreamValidator,
    dueDate: v.string(),
    milestoneKey: v.optional(v.string()),
  },
  returns: v.id("contractMilestones"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can create milestones");
    }

    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contract not found");

    const now = new Date().toISOString();
    const id = await ctx.db.insert("contractMilestones", {
      contractId: args.contractId,
      dealRoomId: contract.dealRoomId,
      name: args.name,
      milestoneKey: args.milestoneKey,
      workstream: args.workstream,
      dueDate: args.dueDate,
      status: "pending",
      source: "manual",
      confidence: 1.0,
      flaggedForReview: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "contract_milestone_added",
      entityType: "contractMilestones",
      entityId: id,
      details: JSON.stringify({
        contractId: args.contractId,
        name: args.name,
        workstream: args.workstream,
        milestoneKey: args.milestoneKey,
      }),
      timestamp: now,
    });

    // KIN-1080: resync template-driven closing tasks after a new
    // milestone lands. Noop unless a template references this key.
    await ctx.runMutation(
      internal.closingCommandCenter.syncClosingTaskDeadlinesFromMilestones,
      { dealRoomId: contract.dealRoomId },
    );

    return id;
  },
});

/**
 * KIN-1080: Update a milestone's due date (e.g. after an amendment
 * modifies the inspection period or closing date). Triggers a closing
 * task resync so template-driven tasks catch the new date.
 */
export const updateMilestoneDueDate = mutation({
  args: {
    milestoneId: v.id("contractMilestones"),
    dueDate: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can update milestone due dates");
    }

    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new Error("Milestone not found");

    const now = new Date().toISOString();
    const previousDueDate = milestone.dueDate;
    await ctx.db.patch(args.milestoneId, {
      dueDate: args.dueDate,
      source: "amended",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "contract_milestone_due_date_updated",
      entityType: "contractMilestones",
      entityId: args.milestoneId,
      details: JSON.stringify({
        previousDueDate,
        newDueDate: args.dueDate,
        reason: args.reason,
      }),
      timestamp: now,
    });

    await ctx.runMutation(
      internal.closingCommandCenter.syncClosingTaskDeadlinesFromMilestones,
      { dealRoomId: milestone.dealRoomId },
    );

    return null;
  },
});

/**
 * Mark a milestone as completed. Broker/admin or the buyer who owns the
 * deal room can complete. Completion is an authoritative act — we record
 * who did it.
 */
export const markCompleted = mutation({
  args: { milestoneId: v.id("contractMilestones") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new Error("Milestone not found");

    const dealRoom = await ctx.db.get(milestone.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to complete this milestone");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.milestoneId, {
      status: "completed",
      completedAt: now,
      completedBy: user._id,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "contract_milestone_completed",
      entityType: "contractMilestones",
      entityId: args.milestoneId,
      timestamp: now,
    });

    return null;
  },
});

/**
 * Flag a milestone for review. Broker/admin only. Sets the reviewReason and
 * moves status to `needs_review`.
 */
export const flagForReview = mutation({
  args: {
    milestoneId: v.id("contractMilestones"),
    reason: reviewReasonValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can flag milestones");
    }

    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new Error("Milestone not found");

    const now = new Date().toISOString();
    await ctx.db.patch(args.milestoneId, {
      flaggedForReview: true,
      reviewReason: args.reason,
      status: "needs_review",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "contract_milestone_flagged",
      entityType: "contractMilestones",
      entityId: args.milestoneId,
      details: JSON.stringify({ reason: args.reason }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Resolve a flagged milestone — broker/admin accepts the date or supplies
 * a correction. Clears the flag and moves status back to `pending`.
 */
export const resolveReview = mutation({
  args: {
    milestoneId: v.id("contractMilestones"),
    correctedDueDate: v.optional(v.string()),
    correctedName: v.optional(v.string()),
    correctedMilestoneKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can resolve reviews");
    }

    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone) throw new Error("Milestone not found");
    if (!milestone.flaggedForReview) {
      throw new Error("Milestone is not flagged for review");
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      flaggedForReview: false,
      reviewReason: undefined,
      resolvedAt: now,
      resolvedBy: user._id,
      status: "pending",
      updatedAt: now,
      source: "amended",
      confidence: 1.0,
    };
    if (args.correctedDueDate) patch.dueDate = args.correctedDueDate;
    if (args.correctedName) patch.name = args.correctedName;
    if (args.correctedMilestoneKey !== undefined) {
      patch.milestoneKey = args.correctedMilestoneKey;
    }

    await ctx.db.patch(args.milestoneId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "contract_milestone_resolved",
      entityType: "contractMilestones",
      entityId: args.milestoneId,
      details: JSON.stringify({
        correctedDueDate: args.correctedDueDate,
        correctedName: args.correctedName,
        correctedMilestoneKey: args.correctedMilestoneKey,
      }),
      timestamp: now,
    });

    // KIN-1080: resync closing tasks if the due date or key changed.
    if (
      args.correctedDueDate !== undefined ||
      args.correctedMilestoneKey !== undefined
    ) {
      await ctx.runMutation(
        internal.closingCommandCenter.syncClosingTaskDeadlinesFromMilestones,
        { dealRoomId: milestone.dealRoomId },
      );
    }

    return null;
  },
});

// ═══ Internal mutations (for cron / background sync) ═══

/**
 * Scan all pending milestones and flip any whose dueDate is in the past to
 * `overdue`. Intended to be called by a scheduled cron job — keeps the
 * buyer close dashboard accurate without the client re-computing overdue.
 *
 * `today` is normalized to YYYY-MM-DD. If a scheduler passes a full ISO
 * timestamp (e.g. `2026-04-12T18:00:00.000Z`) we slice the date part so
 * a milestone due `2026-04-12` doesn't get flagged overdue when compared
 * against the full timestamp (which would lexicographically sort after
 * the date-only string and cause a false positive).
 */
export const markOverdueBatch = internalMutation({
  args: { today: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    // Normalize to YYYY-MM-DD. Accepts either a bare date or a full ISO
    // timestamp and slices off the time portion if present.
    const todayDate = args.today.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todayDate)) {
      throw new Error(
        `markOverdueBatch: today must be YYYY-MM-DD or a full ISO timestamp; got "${args.today}"`,
      );
    }

    const candidates = await ctx.db.query("contractMilestones").collect();
    let updated = 0;
    const nowIso = new Date().toISOString();
    for (const m of candidates) {
      if (
        m.status === "pending" &&
        m.dueDate < todayDate &&
        !m.flaggedForReview
      ) {
        await ctx.db.patch(m._id, { status: "overdue", updatedAt: nowIso });
        updated++;
      }
    }
    return updated;
  },
});
