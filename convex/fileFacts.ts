import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAuth, requireRole } from "./lib/session";

/**
 * Convex queries + mutations for typed file facts (KIN-841).
 *
 * Each mutation mirrors the pure validator in
 * `src/lib/fileFacts/logic.ts`. Convex can't import from `src/`
 * so the validator is duplicated inline — keep the two aligned.
 * The Vitest suite on the pure copy is authoritative.
 *
 * Auth model:
 *   - `listByDealRoom` / `listByProperty`: buyer + broker + admin.
 *     Buyer sees only approved + non-internal facts; broker/admin
 *     see everything. Role filtering is enforced server-side.
 *   - `createFact` / `updateFact` / `transitionReview` /
 *     `markSuperseded`: ops-only (`requireRole(ctx, "broker")`).
 */

// MARK: - Validators

const valueKindValidator = v.union(
  v.literal("numeric"),
  v.literal("text"),
  v.literal("date"),
  v.literal("boolean"),
  v.literal("enum")
);

const reviewStatusValidator = v.union(
  v.literal("needsReview"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("superseded")
);

// MARK: - Inline mirrors

const FACT_SLUG_REGEX = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value.slice(0, 10);
}

type ReviewStatus =
  | "needsReview"
  | "approved"
  | "rejected"
  | "superseded";

const REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  needsReview: ["approved", "rejected"],
  approved: ["rejected", "superseded"],
  rejected: ["approved", "superseded"],
  superseded: [],
};

function canTransitionReview(
  from: ReviewStatus,
  to: ReviewStatus
): boolean {
  if (from === to) return true;
  return REVIEW_TRANSITIONS[from].includes(to);
}

// MARK: - Create

export const createFact = mutation({
  args: {
    factSlug: v.string(),
    storageId: v.id("_storage"),
    propertyId: v.optional(v.id("properties")),
    dealRoomId: v.optional(v.id("dealRooms")),
    analysisRunId: v.optional(v.string()),
    valueKind: valueKindValidator,
    valueNumeric: v.optional(v.number()),
    valueNumericUnit: v.optional(v.string()),
    valueText: v.optional(v.string()),
    valueDate: v.optional(v.string()),
    valueBoolean: v.optional(v.boolean()),
    valueEnum: v.optional(v.string()),
    valueEnumAllowed: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    internalOnly: v.boolean(),
  },
  returns: v.id("fileFacts"),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    if (!FACT_SLUG_REGEX.test(args.factSlug)) {
      throw new Error(`invalid factSlug: ${args.factSlug}`);
    }

    // Per-kind validation — must match valueKind exactly.
    switch (args.valueKind) {
      case "numeric":
        if (
          typeof args.valueNumeric !== "number" ||
          Number.isNaN(args.valueNumeric)
        ) {
          throw new Error("valueNumeric required and must be a number");
        }
        break;
      case "text":
        if (typeof args.valueText !== "string") {
          throw new Error("valueText required for text facts");
        }
        break;
      case "date":
        if (!args.valueDate || !isIsoDate(args.valueDate)) {
          throw new Error("valueDate must be ISO-8601");
        }
        break;
      case "boolean":
        if (typeof args.valueBoolean !== "boolean") {
          throw new Error("valueBoolean required for boolean facts");
        }
        break;
      case "enum":
        if (!args.valueEnum || !args.valueEnumAllowed) {
          throw new Error("valueEnum and valueEnumAllowed required");
        }
        if (args.valueEnumAllowed.length === 0) {
          throw new Error("valueEnumAllowed must be non-empty");
        }
        if (!args.valueEnumAllowed.includes(args.valueEnum)) {
          throw new Error(
            `valueEnum "${args.valueEnum}" not in [${args.valueEnumAllowed.join(", ")}]`
          );
        }
        break;
    }

    if (
      args.confidence !== undefined &&
      (typeof args.confidence !== "number" ||
        Number.isNaN(args.confidence) ||
        args.confidence < 0 ||
        args.confidence > 1)
    ) {
      throw new Error("confidence must be 0..1");
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("fileFacts", {
      factSlug: args.factSlug,
      storageId: args.storageId,
      propertyId: args.propertyId,
      dealRoomId: args.dealRoomId,
      analysisRunId: args.analysisRunId,
      valueKind: args.valueKind,
      valueNumeric: args.valueNumeric,
      valueNumericUnit: args.valueNumericUnit,
      valueText: args.valueText,
      valueDate: args.valueDate,
      valueBoolean: args.valueBoolean,
      valueEnum: args.valueEnum,
      valueEnumAllowed: args.valueEnumAllowed,
      confidence: args.confidence,
      reviewStatus: "needsReview",
      internalOnly: args.internalOnly,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// MARK: - Review transition

export const transitionReview = mutation({
  args: {
    id: v.id("fileFacts"),
    nextStatus: reviewStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const record = await ctx.db.get(args.id);
    if (!record) {
      throw new Error("fileFact not found");
    }
    if (!canTransitionReview(record.reviewStatus, args.nextStatus)) {
      throw new Error(
        `illegal review transition ${record.reviewStatus} → ${args.nextStatus}`
      );
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      reviewStatus: args.nextStatus,
      reviewedBy: user.email,
      reviewedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

// MARK: - Queries

const factReturnValidator = v.object({
  _id: v.id("fileFacts"),
  _creationTime: v.number(),
  factSlug: v.string(),
  storageId: v.id("_storage"),
  propertyId: v.optional(v.id("properties")),
  dealRoomId: v.optional(v.id("dealRooms")),
  analysisRunId: v.optional(v.string()),
  valueKind: valueKindValidator,
  valueNumeric: v.optional(v.number()),
  valueNumericUnit: v.optional(v.string()),
  valueText: v.optional(v.string()),
  valueDate: v.optional(v.string()),
  valueBoolean: v.optional(v.boolean()),
  valueEnum: v.optional(v.string()),
  valueEnumAllowed: v.optional(v.array(v.string())),
  confidence: v.optional(v.number()),
  reviewStatus: reviewStatusValidator,
  internalOnly: v.boolean(),
  reviewedBy: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

/**
 * List facts for a deal room. Role-filtered server-side:
 *   - buyer → approved + non-internal only
 *   - broker/admin → everything
 */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(factReturnValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const rows = await ctx.db
      .query("fileFacts")
      .withIndex("by_dealRoomId", (q) =>
        q.eq("dealRoomId", args.dealRoomId)
      )
      .collect();
    if (user.role === "buyer") {
      return rows.filter(
        (r) => r.reviewStatus === "approved" && !r.internalOnly
      );
    }
    return rows;
  },
});

/**
 * List facts for a specific property. Same role filter.
 */
export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.array(factReturnValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }
    const rows = await ctx.db
      .query("fileFacts")
      .withIndex("by_propertyId_and_factSlug", (q) =>
        q.eq("propertyId", args.propertyId)
      )
      .collect();
    if (user.role === "buyer") {
      return rows.filter(
        (r) => r.reviewStatus === "approved" && !r.internalOnly
      );
    }
    return rows;
  },
});

/**
 * List facts by source file (storageId). Broker/admin only — buyers
 * never need this surface. Used by the broker review queue.
 */
export const listByStorageId = query({
  args: { storageId: v.id("_storage") },
  returns: v.array(factReturnValidator),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("fileFacts")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .collect();
  },
});

/**
 * List facts awaiting review. Broker/admin only. Used by the
 * broker review queue dashboard.
 */
export const listNeedsReview = query({
  args: {},
  returns: v.array(factReturnValidator),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("fileFacts")
      .withIndex("by_reviewStatus", (q) => q.eq("reviewStatus", "needsReview"))
      .collect();
  },
});
