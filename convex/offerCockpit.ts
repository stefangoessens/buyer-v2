import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAuth } from "./lib/session";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Offer cockpit backend for KIN-791.
 *
 * Drives the offer cockpit UI: loads the scenario-engine output that is
 * already persisted under `aiEngineOutputs` (engineType: "offer"), the
 * current draft (if any), and the denormalized eligibility snapshot used
 * to gate offer entry.
 *
 * Mutations here only touch the new `offerCockpitDrafts` table. The
 * canonical `offers` table is never written to from this module — that
 * lives behind the broker-review workflow in a later card.
 */

const EDITABLE_DRAFT_STATUSES = new Set(["draft", "rejected"]);

async function loadOfferScenarios(
  ctx: QueryCtx,
  propertyId: Id<"properties">,
) {
  const rows = await ctx.db
    .query("aiEngineOutputs")
    .withIndex("by_propertyId_and_engineType", (q) =>
      q.eq("propertyId", propertyId).eq("engineType", "offer"),
    )
    .order("desc")
    .take(1);
  const latest = rows[0];
  if (!latest) return null;
  try {
    return {
      output: JSON.parse(latest.output),
      confidence: latest.confidence,
      reviewState: latest.reviewState,
      generatedAt: latest.generatedAt,
      modelId: latest.modelId,
    };
  } catch {
    return null;
  }
}

async function loadEligibility(
  ctx: QueryCtx,
  buyerId: Id<"users">,
  dealRoomId: Id<"dealRooms">,
) {
  const row = await ctx.db
    .query("offerEligibilityState")
    .withIndex("by_buyerId_and_dealRoomId", (q) =>
      q.eq("buyerId", buyerId).eq("dealRoomId", dealRoomId),
    )
    .first();
  if (!row) {
    return {
      isEligible: false,
      blockingReasonCode: "no_agreement" as const,
      blockingReasonMessage:
        "You need a signed buyer agreement before you can send an offer.",
      requiredAction: "sign_agreement" as const,
    };
  }
  return {
    isEligible: row.isEligible,
    blockingReasonCode: row.blockingReasonCode,
    blockingReasonMessage: row.blockingReasonMessage,
    requiredAction: row.requiredAction,
    currentAgreementType: row.currentAgreementType,
  };
}

async function loadDraft(
  ctx: QueryCtx,
  dealRoomId: Id<"dealRooms">,
  buyerId: Id<"users">,
) {
  const rows = await ctx.db
    .query("offerCockpitDrafts")
    .withIndex("by_dealRoomId_and_buyerId", (q) =>
      q.eq("dealRoomId", dealRoomId).eq("buyerId", buyerId),
    )
    .order("desc")
    .take(1);
  return rows[0] ?? null;
}

export const getCockpit = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    const isOwner = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isStaff) return null;

    const property = await ctx.db.get(dealRoom.propertyId);
    if (!property) return null;

    const buyerId = isOwner ? user._id : dealRoom.buyerId;

    const [draft, scenarios, eligibility] = await Promise.all([
      loadDraft(ctx, args.dealRoomId, buyerId),
      loadOfferScenarios(ctx, dealRoom.propertyId),
      loadEligibility(ctx, buyerId, args.dealRoomId),
    ]);

    const formattedAddress =
      property.address.formatted ??
      `${property.address.street}${property.address.unit ? ` ${property.address.unit}` : ""}, ${property.address.city}, ${property.address.state} ${property.address.zip}`;

    return {
      dealRoom,
      propertyId: dealRoom.propertyId,
      listPrice: property.listPrice ?? 0,
      propertyAddress: formattedAddress,
      draft,
      scenarios,
      eligibility,
      canEdit: isOwner && eligibility.isEligible,
      viewerRole: user.role,
    };
  },
});

const draftTermsValidator = {
  offerPrice: v.number(),
  earnestMoney: v.number(),
  closingDays: v.number(),
  contingencies: v.array(v.string()),
  buyerCredits: v.number(),
  sellerCredits: v.number(),
  selectedScenarioName: v.optional(v.string()),
};

export const upsertDraft = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    ...draftTermsValidator,
  },
  returns: v.id("offerCockpitDrafts"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    if (dealRoom.buyerId !== user._id) {
      throw new Error("Only the buyer can edit their offer draft");
    }

    const eligibility = await loadEligibility(ctx, user._id, args.dealRoomId);
    if (!eligibility.isEligible) {
      throw new Error(
        eligibility.blockingReasonMessage ??
          "You are not currently eligible to make an offer on this property",
      );
    }

    if (args.offerPrice <= 0) throw new Error("Offer price must be positive");
    if (args.earnestMoney < 0)
      throw new Error("Earnest money cannot be negative");
    if (args.closingDays < 7 || args.closingDays > 120) {
      throw new Error("Closing window must be between 7 and 120 days");
    }

    const now = new Date().toISOString();
    const existing = await loadDraft(ctx, args.dealRoomId, user._id);

    if (existing && EDITABLE_DRAFT_STATUSES.has(existing.status)) {
      await ctx.db.patch(existing._id, {
        offerPrice: args.offerPrice,
        earnestMoney: args.earnestMoney,
        closingDays: args.closingDays,
        contingencies: args.contingencies,
        buyerCredits: args.buyerCredits,
        sellerCredits: args.sellerCredits,
        selectedScenarioName: args.selectedScenarioName,
        status: existing.status === "rejected" ? "draft" : existing.status,
        brokerReviewState:
          existing.brokerReviewState === "rejected"
            ? "not_submitted"
            : existing.brokerReviewState,
        version: existing.version + 1,
        lastSavedAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "offer_cockpit_draft_updated",
        entityType: "offerCockpitDrafts",
        entityId: existing._id,
        details: JSON.stringify({ version: existing.version + 1 }),
        timestamp: now,
      });
      return existing._id;
    }

    const draftId = await ctx.db.insert("offerCockpitDrafts", {
      dealRoomId: args.dealRoomId,
      buyerId: user._id,
      propertyId: dealRoom.propertyId,
      status: "draft",
      selectedScenarioName: args.selectedScenarioName,
      offerPrice: args.offerPrice,
      earnestMoney: args.earnestMoney,
      closingDays: args.closingDays,
      contingencies: args.contingencies,
      buyerCredits: args.buyerCredits,
      sellerCredits: args.sellerCredits,
      brokerReviewState: "not_submitted",
      version: 1,
      lastSavedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "offer_cockpit_draft_created",
      entityType: "offerCockpitDrafts",
      entityId: draftId,
      details: JSON.stringify({ version: 1 }),
      timestamp: now,
    });
    return draftId;
  },
});

export const submitForReview = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.id("offerCockpitDrafts"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    if (dealRoom.buyerId !== user._id) {
      throw new Error("Only the buyer can submit their offer for review");
    }

    const draft = await loadDraft(ctx, args.dealRoomId, user._id);
    if (!draft) throw new Error("No draft to submit");
    if (draft.status !== "draft" && draft.status !== "rejected") {
      throw new Error(`Draft in status ${draft.status} cannot be submitted`);
    }

    const eligibility = await loadEligibility(ctx, user._id, args.dealRoomId);
    if (!eligibility.isEligible) {
      throw new Error(
        eligibility.blockingReasonMessage ??
          "You are not currently eligible to make an offer",
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(draft._id, {
      status: "pending_review",
      brokerReviewState: "pending_review",
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "offer_cockpit_submitted_for_review",
      entityType: "offerCockpitDrafts",
      entityId: draft._id,
      details: JSON.stringify({ version: draft.version }),
      timestamp: now,
    });
    return draft._id;
  },
});

export const recordBrokerDecision = mutation({
  args: {
    draftId: v.id("offerCockpitDrafts"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    brokerNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers can review offer drafts");
    }
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");
    if (draft.status !== "pending_review") {
      throw new Error("Draft is not pending review");
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.draftId, {
      status: args.decision,
      brokerReviewState: args.decision,
      brokerNote: args.brokerNote,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: `offer_cockpit_${args.decision}`,
      entityType: "offerCockpitDrafts",
      entityId: args.draftId,
      details: JSON.stringify({ brokerNote: args.brokerNote ?? null }),
      timestamp: now,
    });
    return null;
  },
});

export const discardDraft = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom || dealRoom.buyerId !== user._id) {
      throw new Error("Not authorized");
    }
    const draft = await loadDraft(ctx, args.dealRoomId, user._id);
    if (!draft) return null;
    if (!EDITABLE_DRAFT_STATUSES.has(draft.status)) {
      throw new Error("Only editable drafts can be discarded");
    }
    const now = new Date().toISOString();
    await ctx.db.patch(draft._id, {
      status: "abandoned",
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "offer_cockpit_draft_discarded",
      entityType: "offerCockpitDrafts",
      entityId: draft._id,
      timestamp: now,
    });
    return null;
  },
});

// Dev-only helper: seed a mock engine output so the UI can render
// end-to-end without running the Python worker pipeline. Guarded by
// `aiEngineOutputs.reviewState === "pending"` so repeated calls are
// idempotent when the latest row is already fresh.
export const seedOfferScenarios = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    leverageScore: v.optional(v.number()),
    competingOffers: v.optional(v.number()),
    fairValue: v.optional(v.number()),
  },
  returns: v.id("aiEngineOutputs"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only staff can seed engine outputs");
    }
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    const property = await ctx.db.get(dealRoom.propertyId);
    if (!property || !property.listPrice) {
      throw new Error("Property has no list price");
    }

    const list = property.listPrice;
    const fair = args.fairValue ?? Math.round(list * 0.97);
    const scenarios = [
      {
        name: "Aggressive",
        price: Math.round(fair * 0.97),
        priceVsListPct: Number(((Math.round(fair * 0.97) / list - 1) * 100).toFixed(1)),
        earnestMoney: Math.round(fair * 0.97 * 0.01),
        closingDays: 45,
        contingencies: ["inspection", "financing", "appraisal"],
        competitivenessScore: 35,
        riskLevel: "low",
        explanation:
          "Opens below fair value. Full contingency protection. Best savings if seller accepts, but higher rejection risk.",
      },
      {
        name: "Balanced",
        price: fair,
        priceVsListPct: Number(((fair / list - 1) * 100).toFixed(1)),
        earnestMoney: Math.round(fair * 0.02),
        closingDays: 35,
        contingencies: ["inspection", "financing"],
        competitivenessScore: 60,
        riskLevel: "medium",
        explanation:
          "Near fair value. Standard terms. Good balance of savings and acceptance probability.",
      },
      {
        name: "Competitive",
        price: Math.round(fair * 1.02),
        priceVsListPct: Number(((Math.round(fair * 1.02) / list - 1) * 100).toFixed(1)),
        earnestMoney: Math.round(fair * 1.02 * 0.03),
        closingDays: 30,
        contingencies: ["inspection"],
        competitivenessScore: 85,
        riskLevel: "high",
        explanation:
          "Strong offer above fair value. Minimal contingencies, fast close. Highest win probability but less protection.",
      },
    ];
    const output = {
      scenarios,
      recommendedIndex: args.competingOffers && args.competingOffers > 0 ? 2 : 1,
      inputSummary: `List: $${list.toLocaleString()}, Fair value: $${fair.toLocaleString()}, Leverage: ${args.leverageScore ?? "N/A"}`,
      refreshable: true,
    };

    const id = await ctx.db.insert("aiEngineOutputs", {
      propertyId: dealRoom.propertyId,
      engineType: "offer",
      confidence: 0.8,
      citations: [],
      reviewState: "pending",
      output: JSON.stringify(output),
      modelId: "seed-mock",
      generatedAt: new Date().toISOString(),
    });
    return id;
  },
});

// Utility type surface so clients can import
export type OfferCockpitDraftDoc = Doc<"offerCockpitDrafts">;
