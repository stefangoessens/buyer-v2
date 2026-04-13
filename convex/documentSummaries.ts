// ═══════════════════════════════════════════════════════════════════════════
// Document Summaries (KIN-852)
//
// Typed query surface over `fileAnalyses` that returns buyer-safe or
// internal document summaries depending on caller role. Projection
// happens server-side via the shared pure helper in
// `convex/lib/documentSummary.ts` — buyers never see raw extraction
// payloads, broker review notes, or confidence scores.
// ═══════════════════════════════════════════════════════════════════════════

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  filterForBuyer,
  projectBuyerSummary,
  projectInternalSummary,
  sortByPriority,
  type RawFileAnalysis,
} from "./lib/documentSummary";

// ───────────────────────────────────────────────────────────────────────────
// Validators for return shape
// ───────────────────────────────────────────────────────────────────────────

const severityValidator = v.union(
  v.literal("info"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const documentTypeValidator = v.union(
  v.literal("seller_disclosure"),
  v.literal("hoa_doc"),
  v.literal("inspection_report"),
  v.literal("title_commitment"),
  v.literal("survey"),
  v.literal("appraisal"),
  v.literal("loan_estimate"),
  v.literal("purchase_contract"),
  v.literal("other"),
);

const summaryStatusValidator = v.union(
  v.literal("available"),
  v.literal("pending"),
  v.literal("partial"),
  v.literal("review_required"),
  v.literal("unavailable"),
);

const buyerSummaryValidator = v.object({
  documentId: v.string(),
  fileName: v.string(),
  documentType: documentTypeValidator,
  status: summaryStatusValidator,
  severity: severityValidator,
  headline: v.string(),
  keyFacts: v.array(v.string()),
  progress: v.union(v.number(), v.null()),
  reason: v.union(v.string(), v.null()),
  uploadedAt: v.string(),
});

const internalSummaryValidator = v.object({
  documentId: v.string(),
  fileName: v.string(),
  documentType: documentTypeValidator,
  status: summaryStatusValidator,
  severity: severityValidator,
  headline: v.string(),
  keyFacts: v.array(v.string()),
  progress: v.union(v.number(), v.null()),
  reason: v.union(v.string(), v.null()),
  uploadedAt: v.string(),
  reviewState: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
  ),
  reviewNotes: v.union(v.string(), v.null()),
  confidence: v.number(),
  rawFactsPayload: v.string(),
  analysisStatus: v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("succeeded"),
    v.literal("failed"),
    v.literal("review_required"),
  ),
  analyzedAt: v.union(v.string(), v.null()),
  reviewedAt: v.union(v.string(), v.null()),
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/** Lift a Convex doc into the pure-lib input shape. */
function toRawAnalysis(doc: Doc<"fileAnalyses">): RawFileAnalysis {
  return {
    _id: doc._id,
    documentId: doc.documentId,
    dealRoomId: doc.dealRoomId,
    documentType: doc.documentType,
    fileName: doc.fileName,
    status: doc.status,
    reviewState: doc.reviewState,
    factsPayload: doc.factsPayload,
    reviewNotes: doc.reviewNotes,
    confidence: doc.confidence,
    severity: doc.severity,
    uploadedAt: doc.uploadedAt,
    analyzedAt: doc.analyzedAt,
    reviewedAt: doc.reviewedAt,
    extractedPageCount: doc.extractedPageCount,
    totalPageCount: doc.totalPageCount,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * List document summaries for a deal room. Buyers get the buyer-safe
 * variant with rejected analyses filtered out; broker/admin get the
 * full internal variant with review notes, confidence, and raw facts.
 * Results are sorted by severity (critical first) then upload time.
 */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.object({
    role: v.union(v.literal("buyer"), v.literal("internal")),
    summaries: v.union(
      v.array(buyerSummaryValidator),
      v.array(internalSummaryValidator),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) {
      return { role: "buyer" as const, summaries: [] };
    }

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return { role: "buyer" as const, summaries: [] };
    }

    const docs = await ctx.db
      .query("fileAnalyses")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const raw = docs.map(toRawAnalysis);

    if (user.role === "buyer") {
      const filtered = filterForBuyer(raw);
      const summaries = sortByPriority(filtered.map(projectBuyerSummary));
      return { role: "buyer" as const, summaries };
    }

    // Sort internal rows using the same severity order as buyer-facing
    // rows. `sortByPriority` returns the correctly ordered array; use
    // it directly — reconstructing from the original unsorted array
    // would bury high-severity items.
    const summaries = sortByPriority(raw.map(projectInternalSummary));
    return { role: "internal" as const, summaries };
  },
});

/**
 * Get a single document summary by documentId. Buyer gets buyer-safe
 * shape; broker/admin gets internal shape.
 */
export const getByDocumentId = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    documentId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      role: v.union(v.literal("buyer"), v.literal("internal")),
      summary: v.union(buyerSummaryValidator, internalSummaryValidator),
    }),
  ),
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

    const doc = await ctx.db
      .query("fileAnalyses")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .unique();
    if (!doc || doc.dealRoomId !== args.dealRoomId) return null;

    const raw = toRawAnalysis(doc);

    if (user.role === "buyer") {
      if (raw.reviewState === "rejected") return null;
      return {
        role: "buyer" as const,
        summary: projectBuyerSummary(raw),
      };
    }

    return {
      role: "internal" as const,
      summary: projectInternalSummary(raw),
    };
  },
});
