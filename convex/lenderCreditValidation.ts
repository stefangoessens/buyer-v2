// ═══════════════════════════════════════════════════════════════════════════
// Lender Credit Validation (KIN-838)
//
// Typed persistence + queries for lender-constraint validation against
// projected buyer credits. Extends the KIN-814 fee ledger with a richer
// validation layer where "review_required" is an explicit third outcome
// (not just valid/invalid), so ambiguous cases get routed to brokers for
// sign-off instead of silently passing or hard-failing.
//
// The canonical compute lives in `convex/lib/lenderCreditValidate.ts`
// (mirrored in `src/lib/dealroom/lender-credit-validate.ts`). This module
// is the persistence + auth layer around it: every mutation writes to
// `auditLog`, and role-based access mirrors the fee ledger's pattern
// (buyer reads own, broker/admin reads all and mutates).
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAuth } from "./lib/session";
import {
  financingType,
  lenderValidationOutcome,
  lenderValidationReasonCode,
} from "./lib/validators";
import {
  validateLenderCredit,
  type LenderValidationInput,
  type LenderValidationResult,
} from "./lib/lenderCreditValidate";

// ─── Persisted row validator (shared by query + mutation returns) ──────────

const lenderCreditValidationRow = v.object({
  _id: v.id("lenderCreditValidations"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  offerId: v.optional(v.id("offers")),
  financingType: financingType,
  purchasePrice: v.number(),
  ltvRatio: v.number(),
  projectedSellerCredit: v.number(),
  projectedBuyerCredit: v.number(),
  projectedClosingCredit: v.number(),
  totalProjectedCredits: v.number(),
  ipcLimitPercent: v.number(),
  ipcLimitDollars: v.number(),
  validationOutcome: lenderValidationOutcome,
  blockingReasonCode: v.optional(lenderValidationReasonCode),
  blockingReasonMessage: v.optional(v.string()),
  reviewNotes: v.optional(v.string()),
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.string()),
  reviewDecision: v.optional(
    v.union(v.literal("approved"), v.literal("rejected"))
  ),
  provenance: v.object({
    actorId: v.optional(v.id("users")),
    computedAt: v.string(),
    sourceDocument: v.optional(v.string()),
  }),
  createdAt: v.string(),
  updatedAt: v.string(),
});

// ─── Shared helpers ────────────────────────────────────────────────────────

/**
 * Persist a validation result to the `lenderCreditValidations` table. Used
 * by both the public `computeAndPersist` mutation and the internal variant
 * so they agree on the shape and side-effects (audit log write).
 *
 * The `ltvRatio` field on the persisted row is non-optional, so we store
 * 0 when the caller left it undefined. The reason code and review notes
 * already capture the "missing LTV" case.
 */
async function persistValidation(
  ctx: MutationCtx,
  args: {
    dealRoomId: Id<"dealRooms">;
    offerId: Id<"offers"> | undefined;
    input: LenderValidationInput;
    result: LenderValidationResult;
    actorUserId: Id<"users"> | null;
    sourceDocument: string | undefined;
  }
): Promise<Doc<"lenderCreditValidations">> {
  const now = new Date().toISOString();

  const id = await ctx.db.insert("lenderCreditValidations", {
    dealRoomId: args.dealRoomId,
    offerId: args.offerId,
    financingType: args.input.financingType,
    purchasePrice: args.input.purchasePrice,
    ltvRatio: args.input.ltvRatio ?? 0,
    projectedSellerCredit: args.input.projectedSellerCredit,
    projectedBuyerCredit: args.input.projectedBuyerCredit,
    projectedClosingCredit: args.input.projectedClosingCredit,
    totalProjectedCredits: args.result.totalProjectedCredits,
    ipcLimitPercent: args.result.ipcLimitPercent,
    ipcLimitDollars: args.result.ipcLimitDollars,
    validationOutcome: args.result.outcome,
    blockingReasonCode: args.result.blockingReasonCode ?? undefined,
    blockingReasonMessage: args.result.blockingReasonMessage ?? undefined,
    reviewNotes:
      args.result.reviewNotes.length > 0
        ? args.result.reviewNotes.join("\n")
        : undefined,
    provenance: {
      actorId: args.actorUserId ?? undefined,
      computedAt: now,
      sourceDocument: args.sourceDocument,
    },
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("auditLog", {
    userId: args.actorUserId ?? undefined,
    action: "lender_credit_validation_computed",
    entityType: "lenderCreditValidations",
    entityId: id,
    details: JSON.stringify({
      dealRoomId: args.dealRoomId,
      offerId: args.offerId ?? null,
      outcome: args.result.outcome,
      blockingReasonCode: args.result.blockingReasonCode ?? null,
      ipcLimitPercent: args.result.ipcLimitPercent,
      totalProjectedCredits: args.result.totalProjectedCredits,
    }),
    timestamp: now,
  });

  const inserted = await ctx.db.get(id);
  if (!inserted) {
    throw new Error("Failed to read back inserted lender credit validation");
  }
  return inserted;
}

// ═══ QUERIES ═══

/**
 * Get all lender credit validation rows for a deal room. Buyers see their
 * own deal room's rows; brokers and admins see any deal room. Returns an
 * empty array when access is denied or the deal room is missing, mirroring
 * the `ledger.getByDealRoom` pattern.
 */
export const getByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(lenderCreditValidationRow),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];

    if (user.role === "buyer" && dealRoom.buyerId !== user._id) {
      return [];
    }

    return await ctx.db
      .query("lenderCreditValidations")
      .withIndex("by_dealRoomId_and_createdAt", (q) =>
        q.eq("dealRoomId", args.dealRoomId)
      )
      .order("desc")
      .collect();
  },
});

/**
 * Get the latest validation for a deal room or a specific offer. If
 * `offerId` is provided the result is scoped to that offer; otherwise it
 * returns the most recent row on the deal room regardless of offer scope.
 * Buyers may read their own; broker/admin may read any.
 */
export const getLatest = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.optional(v.id("offers")),
  },
  returns: v.union(lenderCreditValidationRow, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    if (user.role === "buyer" && dealRoom.buyerId !== user._id) {
      return null;
    }

    if (args.offerId !== undefined) {
      const rows = await ctx.db
        .query("lenderCreditValidations")
        .withIndex("by_offerId", (q) => q.eq("offerId", args.offerId))
        .order("desc")
        .collect();
      const match = rows.find((r) => r.dealRoomId === args.dealRoomId);
      return match ?? null;
    }

    const latest = await ctx.db
      .query("lenderCreditValidations")
      .withIndex("by_dealRoomId_and_createdAt", (q) =>
        q.eq("dealRoomId", args.dealRoomId)
      )
      .order("desc")
      .first();
    return latest;
  },
});

/**
 * Get all validation rows currently awaiting broker review. Broker/admin
 * only — surfaces the queue of `review_required` cases that need sign-off.
 *
 * Only returns rows that are BOTH:
 *   1. The latest validation row for their (dealRoomId, offerId) scope
 *   2. Still in `review_required` state with no reviewDecision
 *
 * Stale historical rows are filtered out so brokers never review a credit
 * state that has already been superseded by a newer computation. A scope
 * is identified by `dealRoomId` plus `offerId ?? "__deal_room__"` — offer-
 * scoped validations are tracked independently from deal-room-scoped ones.
 */
export const getPendingReview = query({
  args: {},
  returns: v.array(lenderCreditValidationRow),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can list pending review queue");
    }

    // Walk all review_required rows in descending creation order so the
    // first row we see per scope is the latest one.
    const rows = await ctx.db
      .query("lenderCreditValidations")
      .withIndex("by_validationOutcome", (q) =>
        q.eq("validationOutcome", "review_required")
      )
      .collect();

    // Fetch ALL rows grouped by scope to know which is the latest — a
    // newer `valid`/`invalid` row for the same scope should suppress any
    // older `review_required` row from this queue.
    const latestByScope = new Map<string, Doc<"lenderCreditValidations">>();
    for (const row of rows) {
      const scopeKey = `${row.dealRoomId}:${row.offerId ?? "__deal_room__"}`;
      // Find the latest row for this scope from the full table (not just
      // review_required rows) — if a newer row with a different outcome
      // exists, this review_required row is stale.
      if (!latestByScope.has(scopeKey)) {
        const latestForScope = await ctx.db
          .query("lenderCreditValidations")
          .withIndex("by_dealRoomId_and_createdAt", (q) =>
            q.eq("dealRoomId", row.dealRoomId)
          )
          .order("desc")
          .collect();
        const latest = latestForScope.find(
          (r) => (r.offerId ?? null) === (row.offerId ?? null)
        );
        if (latest) latestByScope.set(scopeKey, latest);
      }
    }

    return rows.filter((r) => {
      if (r.reviewDecision !== undefined) return false;
      const scopeKey = `${r.dealRoomId}:${r.offerId ?? "__deal_room__"}`;
      const latest = latestByScope.get(scopeKey);
      // Only include if this row IS the latest for its scope.
      return latest?._id === r._id;
    });
  },
});

// ═══ MUTATIONS ═══

/**
 * Run the validation compute helper and persist the result. Broker/admin
 * only. Every call writes a NEW row — we never overwrite historical
 * validations because the audit log needs a full trail of how the
 * projected credits evolved.
 */
export const computeAndPersist = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.optional(v.id("offers")),
    financingType: financingType,
    purchasePrice: v.number(),
    ltvRatio: v.optional(v.number()),
    projectedSellerCredit: v.number(),
    projectedBuyerCredit: v.number(),
    projectedClosingCredit: v.number(),
    sourceDocument: v.optional(v.string()),
  },
  returns: lenderCreditValidationRow,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can compute lender credit validations");
    }

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) {
      throw new Error("Deal room not found");
    }

    const input: LenderValidationInput = {
      financingType: args.financingType,
      purchasePrice: args.purchasePrice,
      ltvRatio: args.ltvRatio,
      projectedSellerCredit: args.projectedSellerCredit,
      projectedBuyerCredit: args.projectedBuyerCredit,
      projectedClosingCredit: args.projectedClosingCredit,
    };
    const result = validateLenderCredit(input);

    return await persistValidation(ctx, {
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      input,
      result,
      actorUserId: user._id,
      sourceDocument: args.sourceDocument,
    });
  },
});

/**
 * Broker sign-off on a `review_required` validation. Writes the decision
 * onto the existing row and emits an audit entry — this does NOT create a
 * new validation row because the underlying inputs are unchanged, only
 * the human verdict on the ambiguous case.
 */
export const reviewDecision = mutation({
  args: {
    validationId: v.id("lenderCreditValidations"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reviewNotes: v.optional(v.string()),
  },
  returns: lenderCreditValidationRow,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can review lender credit validations");
    }

    const existing = await ctx.db.get(args.validationId);
    if (!existing) {
      throw new Error("Lender credit validation not found");
    }
    if (existing.validationOutcome !== "review_required") {
      throw new Error(
        `Cannot review a validation with outcome "${existing.validationOutcome}" — only review_required rows need broker sign-off`
      );
    }

    const now = new Date().toISOString();

    // Merge broker-supplied notes with any pre-existing compute notes so the
    // original caveats are preserved alongside the reviewer's commentary.
    const mergedNotes = args.reviewNotes
      ? existing.reviewNotes
        ? `${existing.reviewNotes}\n---\nBroker review: ${args.reviewNotes}`
        : `Broker review: ${args.reviewNotes}`
      : existing.reviewNotes;

    await ctx.db.patch(args.validationId, {
      reviewedBy: user._id,
      reviewedAt: now,
      reviewDecision: args.decision,
      reviewNotes: mergedNotes,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "lender_credit_validation_reviewed",
      entityType: "lenderCreditValidations",
      entityId: args.validationId,
      details: JSON.stringify({
        dealRoomId: existing.dealRoomId,
        offerId: existing.offerId ?? null,
        decision: args.decision,
        previousOutcome: existing.validationOutcome,
        blockingReasonCode: existing.blockingReasonCode ?? null,
      }),
      timestamp: now,
    });

    const updated = await ctx.db.get(args.validationId);
    if (!updated) {
      throw new Error("Failed to read back updated lender credit validation");
    }
    return updated;
  },
});

// ═══ INTERNAL MUTATIONS ═══

/**
 * Internal variant of `computeAndPersist`. No auth check — for use by other
 * Convex functions that already run in a trusted context (e.g. offer
 * lifecycle hooks, scheduled recomputes when the fee ledger changes).
 */
export const computeAndPersistInternal = internalMutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.optional(v.id("offers")),
    financingType: financingType,
    purchasePrice: v.number(),
    ltvRatio: v.optional(v.number()),
    projectedSellerCredit: v.number(),
    projectedBuyerCredit: v.number(),
    projectedClosingCredit: v.number(),
    actorUserId: v.optional(v.id("users")),
    sourceDocument: v.optional(v.string()),
  },
  returns: lenderCreditValidationRow,
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) {
      throw new Error("Deal room not found");
    }

    const input: LenderValidationInput = {
      financingType: args.financingType,
      purchasePrice: args.purchasePrice,
      ltvRatio: args.ltvRatio,
      projectedSellerCredit: args.projectedSellerCredit,
      projectedBuyerCredit: args.projectedBuyerCredit,
      projectedClosingCredit: args.projectedClosingCredit,
    };
    const result = validateLenderCredit(input);

    return await persistValidation(ctx, {
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      input,
      result,
      actorUserId: args.actorUserId ?? null,
      sourceDocument: args.sourceDocument,
    });
  },
});
