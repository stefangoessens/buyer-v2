/**
 * Post-tour capture — Convex module (KIN-805).
 *
 * Persists structured observations captured after a showing. The
 * schema and query layer enforce buyer-visible vs internal-only
 * visibility: buyers reading their own captures never see internal
 * notes, broker readiness assessment, negotiation signals, or
 * competing-interest data.
 *
 * Pure validation + signal extraction live in
 * `src/lib/tours/postTourCapture.ts`. This module is persistence,
 * auth, and role filtering only.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Doc } from "./_generated/dataModel";

// ═══ Shared validators ═══

const sentimentValidator = v.union(
  v.literal("very_positive"),
  v.literal("positive"),
  v.literal("neutral"),
  v.literal("negative"),
  v.literal("very_negative"),
);

const readinessValidator = v.union(
  v.literal("ready_now"),
  v.literal("ready_soon"),
  v.literal("needs_time"),
  v.literal("not_interested"),
  v.literal("unknown"),
);

const concernCategoryValidator = v.union(
  v.literal("price"),
  v.literal("condition"),
  v.literal("location"),
  v.literal("layout"),
  v.literal("hoa"),
  v.literal("financing"),
  v.literal("inspection_fear"),
  v.literal("school_zone"),
  v.literal("other"),
);

const submittedByValidator = v.union(
  v.literal("buyer"),
  v.literal("broker"),
  v.literal("showing_agent"),
  v.literal("coordinator"),
);

const competingInterestValidator = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("moderate"),
  v.literal("high"),
);

// ═══ Role filtering ═══

/** Strip internal-only fields from a capture for buyer-facing responses. */
function stripInternalForBuyer(
  capture: Doc<"postTourCaptures">,
): Record<string, unknown> {
  const {
    internalNotes: _in,
    negotiationSignals: _ns,
    brokerReadinessAssessment: _bra,
    competingInterest: _ci,
    ...buyerVisible
  } = capture;
  return buyerVisible;
}

// ═══ Inline validation (mirrors src/lib/tours/postTourCapture.ts) ═══

function validateInline(args: {
  submittedBy: "buyer" | "broker" | "showing_agent" | "coordinator";
  concernsLength: number;
  highlightsLength: number;
  buyerNotesLength: number;
  internalNotesLength: number;
  hasInternalFields: boolean;
  concernsValid: boolean;
}): void {
  if (args.submittedBy === "buyer" && args.hasInternalFields) {
    throw new Error("BUYER_CANNOT_SET_INTERNAL: buyers cannot set internal fields");
  }
  if (args.concernsLength > 15) {
    throw new Error("TOO_MANY_CONCERNS: maximum 15 concerns");
  }
  if (args.highlightsLength > 15) {
    throw new Error("TOO_MANY_HIGHLIGHTS: maximum 15 highlights");
  }
  if (args.buyerNotesLength > 4000 || args.internalNotesLength > 4000) {
    throw new Error("NOTES_TOO_LONG: notes must be ≤4000 characters");
  }
  if (!args.concernsValid) {
    throw new Error("INVALID_CONCERN_SEVERITY: severity must be integer 1-5");
  }
}

// ═══ Queries ═══

/**
 * Get a single post-tour capture, role-filtered.
 * Buyer sees stripped version; broker/admin sees full.
 */
export const get = query({
  args: { captureId: v.id("postTourCaptures") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const capture = await ctx.db.get(args.captureId);
    if (!capture) return null;

    const isOwner = capture.buyerId === user._id;
    const isInternal = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isInternal) return null;

    return isInternal ? capture : stripInternalForBuyer(capture);
  },
});

/** List captures for a tour request. Role-filtered. */
export const listByTourRequest = query({
  args: { tourRequestId: v.id("tourRequests") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const request = await ctx.db.get(args.tourRequestId);
    if (!request) return [];

    const isOwner = request.buyerId === user._id;
    const isInternal = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isInternal) return [];

    const captures = await ctx.db
      .query("postTourCaptures")
      .withIndex("by_tourRequestId", (q) =>
        q.eq("tourRequestId", args.tourRequestId),
      )
      .collect();

    return isInternal ? captures : captures.map(stripInternalForBuyer);
  },
});

/** List captures for a deal room. Role-filtered. */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];

    const isOwner = dealRoom.buyerId === user._id;
    const isInternal = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isInternal) return [];

    const captures = await ctx.db
      .query("postTourCaptures")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    return isInternal ? captures : captures.map(stripInternalForBuyer);
  },
});

/**
 * Internal read model for downstream engines. Returns only the structured
 * fields engines need (no freeform text). Broker/admin only — engines
 * running in actions use internal auth.
 */
export const listSignalsByProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    const captures = await ctx.db
      .query("postTourCaptures")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    return captures.map((c) => ({
      id: c._id,
      tourRequestId: c.tourRequestId,
      sentiment: c.sentiment,
      offerReadiness: c.offerReadiness,
      concerns: c.concerns,
      highlightCount: c.highlights.length,
      brokerReadinessAssessment: c.brokerReadinessAssessment,
      competingInterest: c.competingInterest,
      submittedBy: c.submittedBy,
      createdAt: c.createdAt,
    }));
  },
});

// ═══ Mutations ═══

/**
 * Submit a post-tour capture. Buyers can submit their own observations
 * (sentiment, readiness, concerns, highlights, notes). Brokers/showing
 * agents can additionally submit internal-only fields.
 *
 * The submittedBy arg must match the caller's role — buyers can't
 * spoof broker submissions and vice versa.
 */
export const submit = mutation({
  args: {
    tourRequestId: v.id("tourRequests"),
    submittedBy: submittedByValidator,
    tourDate: v.optional(v.string()),
    sentiment: sentimentValidator,
    offerReadiness: readinessValidator,
    concerns: v.array(
      v.object({
        category: concernCategoryValidator,
        label: v.string(),
        severity: v.number(),
      }),
    ),
    highlights: v.array(v.string()),
    buyerNotes: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    negotiationSignals: v.optional(v.string()),
    brokerReadinessAssessment: v.optional(readinessValidator),
    competingInterest: v.optional(competingInterestValidator),
  },
  returns: v.id("postTourCaptures"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Verify the tour request exists
    const tourRequest = await ctx.db.get(args.tourRequestId);
    if (!tourRequest) {
      throw new Error("MISSING_TOUR_REQUEST: Tour request not found");
    }

    // Enforce submittedBy matches caller's actual role
    const isBuyer = tourRequest.buyerId === user._id;
    const isInternal = user.role === "broker" || user.role === "admin";

    if (args.submittedBy === "buyer") {
      if (!isBuyer) {
        throw new Error("Only the owning buyer can submit as 'buyer'");
      }
    } else {
      if (!isInternal) {
        throw new Error(
          `Only brokers/admins can submit as '${args.submittedBy}'`,
        );
      }
    }

    // Buyers cannot set internal fields
    const hasInternalFields =
      args.internalNotes !== undefined ||
      args.negotiationSignals !== undefined ||
      args.brokerReadinessAssessment !== undefined ||
      args.competingInterest !== undefined;

    // Validate all shared constraints
    const concernsValid = args.concerns.every(
      (c) =>
        Number.isInteger(c.severity) && c.severity >= 1 && c.severity <= 5,
    );
    validateInline({
      submittedBy: args.submittedBy,
      concernsLength: args.concerns.length,
      highlightsLength: args.highlights.length,
      buyerNotesLength: args.buyerNotes?.length ?? 0,
      internalNotesLength: args.internalNotes?.length ?? 0,
      hasInternalFields,
      concernsValid,
    });

    // Dedupe highlights + trim
    const dedupedHighlights = Array.from(
      new Set(
        args.highlights.map((h) => h.trim()).filter((h) => h.length > 0),
      ),
    );

    const now = new Date().toISOString();
    const id = await ctx.db.insert("postTourCaptures", {
      tourRequestId: args.tourRequestId,
      dealRoomId: tourRequest.dealRoomId,
      propertyId: tourRequest.propertyId,
      buyerId: tourRequest.buyerId,
      submittedBy: args.submittedBy,
      submittedById: user._id,
      tourDate: args.tourDate,
      sentiment: args.sentiment,
      offerReadiness: args.offerReadiness,
      concerns: args.concerns,
      highlights: dedupedHighlights,
      buyerNotes: args.buyerNotes?.trim(),
      internalNotes: args.internalNotes?.trim(),
      negotiationSignals: args.negotiationSignals?.trim(),
      brokerReadinessAssessment: args.brokerReadinessAssessment,
      competingInterest: args.competingInterest,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "post_tour_capture_submitted",
      entityType: "postTourCaptures",
      entityId: id,
      details: JSON.stringify({
        tourRequestId: args.tourRequestId,
        submittedBy: args.submittedBy,
        sentiment: args.sentiment,
        concernCount: args.concerns.length,
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Append internal notes to an existing capture. Broker/admin only.
 * Used when the initial submission was from a buyer and the broker
 * wants to add their internal observations without creating a separate
 * capture row.
 */
export const appendInternalNotes = mutation({
  args: {
    captureId: v.id("postTourCaptures"),
    internalNotes: v.optional(v.string()),
    negotiationSignals: v.optional(v.string()),
    brokerReadinessAssessment: v.optional(readinessValidator),
    competingInterest: v.optional(competingInterestValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can append internal notes");
    }

    const capture = await ctx.db.get(args.captureId);
    if (!capture) throw new Error("Capture not found");

    // Length check on new internal notes
    if (args.internalNotes && args.internalNotes.length > 4000) {
      throw new Error("NOTES_TOO_LONG: internal notes must be ≤4000 characters");
    }

    const now = new Date().toISOString();
    // Build patch conditionally — undefined preserves existing values,
    // explicit values overwrite. Same semantics as KIN-850 manual risks.
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.internalNotes !== undefined) {
      patch.internalNotes = args.internalNotes.trim();
    }
    if (args.negotiationSignals !== undefined) {
      patch.negotiationSignals = args.negotiationSignals.trim();
    }
    if (args.brokerReadinessAssessment !== undefined) {
      patch.brokerReadinessAssessment = args.brokerReadinessAssessment;
    }
    if (args.competingInterest !== undefined) {
      patch.competingInterest = args.competingInterest;
    }

    await ctx.db.patch(args.captureId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "post_tour_internal_notes_appended",
      entityType: "postTourCaptures",
      entityId: args.captureId,
      timestamp: now,
    });

    return null;
  },
});
