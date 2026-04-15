// ═══════════════════════════════════════════════════════════════════════════
// List Price Review Query (KIN-1089)
//
// Composes the latest pricing engine output, the latest comps engine
// output, per-portal AVM estimates, and ZIP-level market velocity into
// a deterministic at/over/under-market assessment of the current list
// price. The pure scoring helper lives in
// `src/lib/dealroom/list-price-review.ts` so it can be unit-tested in
// isolation; this file is the Convex shell that hydrates its inputs.
// ═══════════════════════════════════════════════════════════════════════════

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getCurrentUser } from "./lib/session";
import {
  reviewListPrice,
  type ListPriceReviewInput,
  type MarketVelocityDomSource,
} from "../src/lib/dealroom/list-price-review";

// ───────────────────────────────────────────────────────────────────────────
// Validators
// ───────────────────────────────────────────────────────────────────────────

const priceReferenceTileValidator = v.object({
  kind: v.union(
    v.literal("suggested_list_price"),
    v.literal("avm_estimate"),
    v.literal("comp_median"),
    v.literal("market_velocity_dom"),
  ),
  value: v.union(v.number(), v.null()),
  provenance: v.string(),
  sourceCount: v.optional(v.number()),
  isAvailable: v.boolean(),
});

const listPriceReviewResultValidator = v.object({
  assessment: v.union(
    v.literal("at_market"),
    v.literal("under_market"),
    v.literal("over_market"),
    v.literal("insufficient"),
  ),
  listPrice: v.union(v.number(), v.null()),
  weightedScore: v.union(v.number(), v.null()),
  referencesAvailable: v.number(),
  signalsAgreed: v.number(),
  totalSignals: v.number(),
  explainer: v.union(v.string(), v.null()),
  tiles: v.object({
    suggestedListPrice: priceReferenceTileValidator,
    avmEstimate: priceReferenceTileValidator,
    compMedian: priceReferenceTileValidator,
    marketVelocityDom: priceReferenceTileValidator,
  }),
  propertyAddress: v.string(),
  engineFreshness: v.object({
    pricingGeneratedAt: v.union(v.string(), v.null()),
    compsGeneratedAt: v.union(v.string(), v.null()),
  }),
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

type PortalAvms = {
  zestimate: number | null;
  redfinEstimate: number | null;
  realtorEstimate: number | null;
};

interface PricingEngineParsed {
  suggestedListPrice: number | null;
  generatedAt: string | null;
}

interface CompsEngineParsed {
  compMedianSoldPrice: number | null;
  compMedianDom: number | null;
  compCount: number;
  generatedAt: string | null;
}

function pickFreshest(
  outputs: ReadonlyArray<Doc<"aiEngineOutputs">>,
  engineType: string,
): Doc<"aiEngineOutputs"> | null {
  let freshest: Doc<"aiEngineOutputs"> | null = null;
  for (const row of outputs) {
    if (row.engineType !== engineType) continue;
    if (row.reviewState === "rejected") continue;
    if (!freshest || row.generatedAt > freshest.generatedAt) {
      freshest = row;
    }
  }
  return freshest;
}

function parsePricingOutput(
  row: Doc<"aiEngineOutputs"> | null,
): PricingEngineParsed {
  if (!row) {
    return { suggestedListPrice: null, generatedAt: null };
  }
  try {
    const parsed = JSON.parse(row.output) as {
      fairValue?: { value?: unknown };
    };
    const value = parsed.fairValue?.value;
    const numeric =
      typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : null;
    return { suggestedListPrice: numeric, generatedAt: row.generatedAt };
  } catch {
    return { suggestedListPrice: null, generatedAt: row.generatedAt };
  }
}

function parseCompsOutput(
  row: Doc<"aiEngineOutputs"> | null,
): CompsEngineParsed {
  if (!row) {
    return {
      compMedianSoldPrice: null,
      compMedianDom: null,
      compCount: 0,
      generatedAt: null,
    };
  }
  try {
    const parsed = JSON.parse(row.output) as {
      comps?: ReadonlyArray<unknown>;
      aggregates?: { medianSoldPrice?: unknown; medianDom?: unknown };
    };
    const compsArray = Array.isArray(parsed.comps) ? parsed.comps : [];
    const medianSoldRaw = parsed.aggregates?.medianSoldPrice;
    const medianDomRaw = parsed.aggregates?.medianDom;
    return {
      compMedianSoldPrice:
        typeof medianSoldRaw === "number" &&
        Number.isFinite(medianSoldRaw) &&
        medianSoldRaw > 0
          ? medianSoldRaw
          : null,
      compMedianDom:
        typeof medianDomRaw === "number" &&
        Number.isFinite(medianDomRaw) &&
        medianDomRaw > 0
          ? medianDomRaw
          : null,
      compCount: compsArray.length,
      generatedAt: row.generatedAt,
    };
  } catch {
    return {
      compMedianSoldPrice: null,
      compMedianDom: null,
      compCount: 0,
      generatedAt: row.generatedAt,
    };
  }
}

async function loadPortalAvms(
  ctx: QueryCtx,
  property: Doc<"properties">,
): Promise<PortalAvms> {
  const result: PortalAvms = {
    zestimate: null,
    redfinEstimate: null,
    realtorEstimate: null,
  };

  const rows = await ctx.db
    .query("portalEstimates")
    .withIndex("by_propertyId_and_capturedAt", (q) =>
      q.eq("propertyId", property._id),
    )
    .order("desc")
    .collect();

  for (const row of rows) {
    if (row.portal === "zillow" && result.zestimate === null) {
      result.zestimate = row.estimateValue;
    } else if (row.portal === "redfin" && result.redfinEstimate === null) {
      result.redfinEstimate = row.estimateValue;
    } else if (row.portal === "realtor" && result.realtorEstimate === null) {
      result.realtorEstimate = row.estimateValue;
    }
  }

  if (result.zestimate === null && typeof property.zestimate === "number") {
    result.zestimate = property.zestimate;
  }
  if (
    result.redfinEstimate === null &&
    typeof property.redfinEstimate === "number"
  ) {
    result.redfinEstimate = property.redfinEstimate;
  }
  if (
    result.realtorEstimate === null &&
    typeof property.realtorEstimate === "number"
  ) {
    result.realtorEstimate = property.realtorEstimate;
  }

  return result;
}

async function loadMarketVelocityDom(
  ctx: QueryCtx,
  property: Doc<"properties">,
  compFallback: number | null,
): Promise<{ value: number | null; source: MarketVelocityDomSource }> {
  const zip = property.zip ?? property.address.zip;
  if (zip) {
    const ctxRow = await ctx.db
      .query("neighborhoodMarketContext")
      .withIndex("by_geoKey_and_windowDays", (q) =>
        q.eq("geoKey", zip).eq("windowDays", 90),
      )
      .unique();
    if (
      ctxRow &&
      typeof ctxRow.medianDom === "number" &&
      Number.isFinite(ctxRow.medianDom) &&
      ctxRow.medianDom > 0
    ) {
      return { value: ctxRow.medianDom, source: "zip_90d" };
    }
  }

  if (compFallback !== null) {
    return { value: compFallback, source: "comps_aggregate" };
  }

  return { value: null, source: null };
}

function formatPropertyAddress(property: Doc<"properties">): string {
  if (property.address.formatted) return property.address.formatted;
  const unit = property.address.unit ? ` ${property.address.unit}` : "";
  const street = `${property.address.street}${unit}`.trim();
  const tail = [property.address.city, property.address.state, property.address.zip]
    .filter(Boolean)
    .join(", ");
  return [street, tail].filter(Boolean).join(", ");
}

// ───────────────────────────────────────────────────────────────────────────
// Query
// ───────────────────────────────────────────────────────────────────────────

/**
 * Read model for the List Price Review widget on
 * `/property/[propertyId]/price`. Returns the deterministic at/over/
 * under-market verdict plus four reference tiles. Returns null when
 * the caller isn't authorized to see the deal room.
 */
export const getListPriceReview = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(v.null(), listPriceReviewResultValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

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

    const engineOutputs = await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", dealRoom.propertyId),
      )
      .collect();

    const pricing = parsePricingOutput(pickFreshest(engineOutputs, "pricing"));
    const comps = parseCompsOutput(pickFreshest(engineOutputs, "comps"));

    const avm = await loadPortalAvms(ctx, property);

    const velocity = await loadMarketVelocityDom(
      ctx,
      property,
      comps.compMedianDom,
    );

    const listPrice =
      typeof property.listPrice === "number" &&
      Number.isFinite(property.listPrice) &&
      property.listPrice > 0
        ? property.listPrice
        : null;
    const daysOnMarket =
      typeof property.daysOnMarket === "number" &&
      Number.isFinite(property.daysOnMarket)
        ? property.daysOnMarket
        : null;

    const reviewInput: ListPriceReviewInput = {
      listPrice,
      daysOnMarket,
      suggestedListPrice: pricing.suggestedListPrice,
      avm,
      compMedianSoldPrice: comps.compMedianSoldPrice,
      compCount: comps.compCount,
      marketVelocityDom: velocity.value,
      marketVelocityDomSource: velocity.source,
    };

    const review = reviewListPrice(reviewInput);

    return {
      ...review,
      propertyAddress: formatPropertyAddress(property),
      engineFreshness: {
        pricingGeneratedAt: pricing.generatedAt,
        compsGeneratedAt: comps.generatedAt,
      },
    };
  },
});
