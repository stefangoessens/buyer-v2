// ═══════════════════════════════════════════════════════════════════════════
// Deal-Room Overview Read Model (KIN-844)
//
// Typed query surface that composes pricing, leverage, cost, offer, and
// status summary data into one payload for the deal-room overview page.
// The pure composer lives in `convex/lib/overview.ts` (mirrored at
// `src/lib/dealroom/overview.ts`) so section envelopes and role-based
// filtering have a single implementation.
//
// Role filtering:
//   - Buyer sees their own deal rooms with the buyer-safe variant
//     (internal telemetry fields stripped).
//   - Broker/admin can query any deal room and gets the internal variant
//     with provenance and pending-engine details.
//
// Data sources:
//   - `dealRooms` — status + metadata
//   - `aiEngineOutputs` — pricing, leverage, cost, offer engine outputs
//   - `offers` — latest submitted offer for the deal room (if any)
// ═══════════════════════════════════════════════════════════════════════════

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  composeOverview,
  type RawEngineOutput,
  type OverviewInputs,
} from "./lib/overview";

// ───────────────────────────────────────────────────────────────────────────
// Return shape
// ───────────────────────────────────────────────────────────────────────────

const sectionStatusValidator = v.union(
  v.literal("available"),
  v.literal("pending"),
  v.literal("unavailable"),
);

const pricingEnvelopeValidator = v.object({
  status: sectionStatusValidator,
  data: v.union(
    v.null(),
    v.object({
      fairValue: v.number(),
      likelyAccepted: v.number(),
      strongOpener: v.number(),
      walkAway: v.number(),
      overallConfidence: v.number(),
      consensusEstimate: v.number(),
    }),
  ),
  reason: v.optional(v.string()),
  confidence: v.optional(v.number()),
});

const leverageEnvelopeValidator = v.object({
  status: sectionStatusValidator,
  data: v.union(
    v.null(),
    v.object({
      score: v.number(),
      topSignals: v.array(
        v.object({
          name: v.string(),
          direction: v.union(
            v.literal("bullish"),
            v.literal("bearish"),
            v.literal("neutral"),
          ),
          delta: v.number(),
        }),
      ),
      overallConfidence: v.number(),
    }),
  ),
  reason: v.optional(v.string()),
  confidence: v.optional(v.number()),
});

const costEnvelopeValidator = v.object({
  status: sectionStatusValidator,
  data: v.union(
    v.null(),
    v.object({
      monthlyMid: v.number(),
      monthlyRange: v.object({ low: v.number(), high: v.number() }),
      annualTotal: v.number(),
      downPayment: v.number(),
    }),
  ),
  reason: v.optional(v.string()),
  confidence: v.optional(v.number()),
});

const offerEnvelopeValidator = v.object({
  status: sectionStatusValidator,
  data: v.union(
    v.null(),
    v.object({
      recommendedScenarioName: v.string(),
      recommendedPrice: v.number(),
      competitivenessScore: v.number(),
      scenarioCount: v.number(),
    }),
  ),
  reason: v.optional(v.string()),
  confidence: v.optional(v.number()),
});

const dealStatusValidator = v.union(
  v.literal("intake"),
  v.literal("analysis"),
  v.literal("tour_scheduled"),
  v.literal("offer_prep"),
  v.literal("offer_sent"),
  v.literal("under_contract"),
  v.literal("closing"),
  v.literal("closed"),
  v.literal("withdrawn"),
);

const overviewBaseValidator = {
  dealRoomId: v.string(),
  propertyId: v.string(),
  updatedAt: v.string(),
  status: v.object({
    status: dealStatusValidator,
    label: v.string(),
    tone: v.union(
      v.literal("neutral"),
      v.literal("positive"),
      v.literal("warning"),
      v.literal("critical"),
    ),
    nextAction: v.union(v.string(), v.null()),
  }),
  pricing: pricingEnvelopeValidator,
  leverage: leverageEnvelopeValidator,
  cost: costEnvelopeValidator,
  offer: offerEnvelopeValidator,
  isComplete: v.boolean(),
};

const overviewResultValidator = v.union(
  v.object({
    ...overviewBaseValidator,
    variant: v.literal("buyer_safe"),
  }),
  v.object({
    ...overviewBaseValidator,
    variant: v.literal("internal"),
    internal: v.object({
      providedBy: v.array(v.string()),
      pendingEngines: v.array(v.string()),
      lastFullRefreshAt: v.union(v.string(), v.null()),
    }),
  }),
);

// ───────────────────────────────────────────────────────────────────────────
// Query
// ───────────────────────────────────────────────────────────────────────────

/**
 * Get the composed overview payload for a deal room. Buyer sees their
 * own with the buyer-safe variant; broker/admin can query any deal
 * room and gets the internal variant with provenance details.
 */
export const getOverview = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(v.null(), overviewResultValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    // Access check: buyers can only see their own.
    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return null;
    }

    // Fetch engine outputs for the linked property. We use the
    // by_propertyId_and_engineType index per engine type, collecting
    // the latest for each. For simplicity, just collect all and let
    // the composer pick the freshest per type.
    const engineDocs = await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", dealRoom.propertyId),
      )
      .collect();

    const engines: RawEngineOutput[] = engineDocs.map(
      (d: Doc<"aiEngineOutputs">) => ({
        engineType: d.engineType,
        output: d.output,
        confidence: d.confidence,
        reviewState: d.reviewState,
        generatedAt: d.generatedAt,
      }),
    );

    // Find the most recent submitted offer for this deal room, if any.
    const offerDocs = await ctx.db
      .query("offers")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const submittedOffer = offerDocs
      .filter(
        (o: Doc<"offers">) =>
          o.status === "submitted" ||
          o.status === "countered" ||
          o.status === "accepted",
      )
      .sort(
        (a: Doc<"offers">, b: Doc<"offers">) =>
          (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""),
      )[0];

    let latestOffer: OverviewInputs["latestOffer"];
    if (submittedOffer) {
      latestOffer = {
        scenarioName: "Submitted offer",
        price: submittedOffer.offerPrice,
        // Without a scenario trail we can't recover the original
        // competitiveness score; use a neutral 50 as a placeholder.
        competitivenessScore: 50,
        scenarioCount: 1,
      };
    }

    const inputs: OverviewInputs = {
      dealRoomId: dealRoom._id,
      propertyId: dealRoom.propertyId,
      dealStatus: dealRoom.status,
      updatedAt: dealRoom.updatedAt,
      engines,
      latestOffer,
    };

    const forRole =
      user.role === "broker" || user.role === "admin"
        ? user.role
        : ("buyer" as const);

    return composeOverview(inputs, { forRole });
  },
});
