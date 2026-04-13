"use node";

/**
 * Comp pool seeding (KIN-1036).
 *
 * Called as Phase 0 of the engine orchestrator. Fetches sold comparable
 * listings from the FastAPI /seed-comps endpoint (which scrapes Zillow's
 * sold-listings search page via Bright Data + the zillow_search parser)
 * and inserts them into the `properties` table with `role: "comp"` so
 * the comps/leverage/pricing engines have real neighborhood data to
 * anchor their analysis against.
 *
 * Fire-and-forget: errors are logged but never block the rest of the
 * orchestration.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

interface SoldCompPayload {
  zpid: string;
  source_url: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  sold_price_usd: number | null;
  sold_date: string | null;
  beds: number | null;
  baths: number | null;
  living_area_sqft: number | null;
  property_type: string | null;
  days_on_market: number | null;
  zestimate_usd: number | null;
}

interface SeedCompsResponse {
  zip_code: string;
  comps: SoldCompPayload[];
  fetch: {
    request_id: string;
    vendor: string;
    status_code: number;
    fetched_at: string;
    latency_ms: number;
    cost_usd: number;
    attempts: number;
  };
}

export const seedCompsForProperty = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
    fetched: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ inserted: number; skipped: number; fetched: number }> => {
    const property: any = await ctx.runQuery(
      internal.properties.getInternal,
      { propertyId: args.propertyId },
    );
    if (!property) return { inserted: 0, skipped: 0, fetched: 0 };

    const zip: string | undefined =
      property.address?.zip ?? property.zip ?? undefined;
    if (!zip) return { inserted: 0, skipped: 0, fetched: 0 };

    const beds: number | undefined = property.beds ?? undefined;

    const serviceBaseUrl =
      process.env.EXTRACTION_SERVICE_URL ?? "http://localhost:8000";

    let data: SeedCompsResponse;
    try {
      const response = await fetch(`${serviceBaseUrl}/seed-comps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip_code: zip,
          beds_min: beds && beds > 0 ? beds : null,
          status: "sold",
          limit: 25,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        return { inserted: 0, skipped: 0, fetched: 0 };
      }
      data = (await response.json()) as SeedCompsResponse;
    } catch {
      return { inserted: 0, skipped: 0, fetched: 0 };
    }

    // Filter out the subject property's own zpid if it happens to be
    // in the search results (can happen on recently-sold pages).
    const subjectZpid = property.zillowId;
    const fresh = data.comps.filter((c) => c.zpid !== subjectZpid);

    if (fresh.length === 0) {
      return { inserted: 0, skipped: 0, fetched: data.comps.length };
    }

    const mapped = fresh.map((c) => ({
      zpid: c.zpid,
      sourceUrl: c.source_url,
      addressLine1: c.address_line1,
      city: c.city,
      state: c.state,
      postalCode: c.postal_code,
      latitude: c.latitude,
      longitude: c.longitude,
      soldPriceUsd: c.sold_price_usd,
      soldDate: c.sold_date,
      beds: c.beds,
      baths: c.baths,
      livingAreaSqft: c.living_area_sqft,
      propertyType: c.property_type,
      daysOnMarket: c.days_on_market,
    }));

    const result: { inserted: number; skipped: number } =
      await ctx.runMutation(
        internal.engines.compSeederMutations.insertCompBatch,
        { comps: mapped },
      );

    await ctx.runMutation(
      internal.engines.compSeederMutations.logSeedRun,
      {
        propertyId: args.propertyId,
        zip,
        inserted: result.inserted,
        skipped: result.skipped,
        fetched: data.comps.length,
        vendor: data.fetch.vendor,
        costUsd: data.fetch.cost_usd,
      },
    );

    return {
      inserted: result.inserted,
      skipped: result.skipped,
      fetched: data.comps.length,
    };
  },
});
