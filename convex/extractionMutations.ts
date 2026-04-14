/**
 * Internal mutations backing the extraction action.
 *
 * These live in a separate file from `extractionRunner.ts` because
 * that file uses `"use node"` for `fetch()` + AbortSignal.timeout,
 * and Convex forbids mutations in Node-runtime modules.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Mirrors services/extraction/src/contracts.py::CanonicalPropertyResponse
interface PhotoResponse {
  url: string;
  caption?: string | null;
}

interface CanonicalPropertyResponse {
  source_platform: "zillow" | "redfin" | "realtor";
  source_url: string;
  listing_id: string | null;
  mls_number: string | null;
  extracted_at: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  property_type: string | null;
  price_usd: number | null;
  beds: number | null;
  baths: number | null;
  living_area_sqft: number | null;
  lot_size_sqft: number | null;
  year_built: number | null;
  days_on_market: number | null;
  hoa_monthly_usd: number | null;
  zestimate_usd: number | null;
  rent_zestimate_usd: number | null;
  redfin_estimate_usd: number | null;
  description: string | null;
  photos: PhotoResponse[];
}

interface FetchMetadataResponse {
  request_id: string;
  vendor: string;
  status_code: number;
  fetched_at: string;
  latency_ms: number;
  cost_usd: number;
  attempts: number;
}

export const markRunning = internalMutation({
  args: { sourceListingId: v.id("sourceListings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.sourceListingId);
    if (!existing) return null;
    if (existing.status !== "pending") return null;
    await ctx.db.patch(args.sourceListingId, { status: "running" });
    return null;
  },
});

export const recordFailure = internalMutation({
  args: {
    sourceListingId: v.id("sourceListings"),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.sourceListingId);
    if (!existing) return null;
    await ctx.db.patch(args.sourceListingId, {
      status: "failed",
      errorCode: args.errorCode,
      errorMessage: args.errorMessage.slice(0, 500),
    });
    return null;
  },
});

export const recordSuccess = internalMutation({
  args: {
    sourceListingId: v.id("sourceListings"),
    property: v.any(),
    fetch: v.any(),
  },
  returns: v.union(v.id("properties"), v.null()),
  handler: async (ctx, args) => {
    const sourceListing = await ctx.db.get(args.sourceListingId);
    if (!sourceListing) return null;

    const extracted = args.property as CanonicalPropertyResponse;

    // Build a canonicalId from the portal + listing ID so repeated
    // fetches of the same URL deterministically collide on the same
    // property row. Falls back to URL hash if listing_id is absent.
    const canonicalId =
      extracted.listing_id && extracted.listing_id.length > 0
        ? `${extracted.source_platform}:${extracted.listing_id}`
        : `${extracted.source_platform}:${hashString(extracted.source_url)}`;

    const existingProperty = await ctx.db
      .query("properties")
      .withIndex("by_canonicalId", (q) => q.eq("canonicalId", canonicalId))
      .unique();

    const now = new Date().toISOString();

    // The extraction response gives a single baths float (e.g. 2.5);
    // split into full baths (floor) and half baths (1 if fractional).
    const totalBaths = extracted.baths;
    const bathsFull =
      totalBaths !== null && totalBaths !== undefined
        ? Math.floor(totalBaths)
        : undefined;
    const bathsHalf =
      totalBaths !== null && totalBaths !== undefined
        ? totalBaths - Math.floor(totalBaths) >= 0.5
          ? 1
          : 0
        : undefined;

    const portalIdField: Partial<
      Record<"zillowId" | "redfinId" | "realtorId", string>
    > = {};
    if (extracted.listing_id) {
      if (extracted.source_platform === "zillow")
        portalIdField.zillowId = extracted.listing_id;
      if (extracted.source_platform === "redfin")
        portalIdField.redfinId = extracted.listing_id;
      if (extracted.source_platform === "realtor")
        portalIdField.realtorId = extracted.listing_id;
    }

    const propertyPayload = {
      canonicalId,
      mlsNumber: extracted.mls_number ?? undefined,
      address: {
        street: extracted.address_line1,
        city: extracted.city,
        state: extracted.state,
        zip: extracted.postal_code,
        formatted: `${extracted.address_line1}, ${extracted.city}, ${extracted.state} ${extracted.postal_code}`,
      },
      zip: extracted.postal_code,
      coordinates:
        extracted.latitude !== null && extracted.longitude !== null
          ? { lat: extracted.latitude, lng: extracted.longitude }
          : undefined,
      ...portalIdField,
      status: "active" as const,
      listPrice: extracted.price_usd ?? undefined,
      daysOnMarket: extracted.days_on_market ?? undefined,
      propertyType: extracted.property_type ?? undefined,
      beds: extracted.beds ?? undefined,
      bathsFull,
      bathsHalf,
      sqftLiving: extracted.living_area_sqft ?? undefined,
      lotSize: extracted.lot_size_sqft ?? undefined,
      yearBuilt: extracted.year_built ?? undefined,
      hoaFee: extracted.hoa_monthly_usd ?? undefined,
      hoaFrequency:
        extracted.hoa_monthly_usd && extracted.hoa_monthly_usd > 0
          ? "monthly"
          : undefined,
      zestimate: extracted.zestimate_usd ?? undefined,
      redfinEstimate: extracted.redfin_estimate_usd ?? undefined,
      description: extracted.description ?? undefined,
      photoUrls: extracted.photos.map((p) => p.url),
      photoCount: extracted.photos.length,
      sourcePlatform: extracted.source_platform,
      extractedAt: extracted.extracted_at,
      updatedAt: now,
    };

    let propertyId: Id<"properties">;
    if (existingProperty) {
      // Last-write-wins merge for now; KIN-933 handles per-field provenance.
      await ctx.db.patch(existingProperty._id, propertyPayload);
      propertyId = existingProperty._id;
    } else {
      propertyId = await ctx.db.insert("properties", propertyPayload);
    }

    await ctx.db.patch(args.sourceListingId, {
      status: "complete",
      propertyId,
      errorCode: undefined,
      errorMessage: undefined,
    });

    await ctx.db.insert("auditLog", {
      action: "intake_extraction_complete",
      entityType: "sourceListings",
      entityId: args.sourceListingId,
      details: JSON.stringify({
        portal: extracted.source_platform,
        propertyId,
        vendor: (args.fetch as FetchMetadataResponse)?.vendor,
        costUsd: (args.fetch as FetchMetadataResponse)?.cost_usd,
        latencyMs: (args.fetch as FetchMetadataResponse)?.latency_ms,
      }),
      timestamp: now,
    });

    // Fire-and-forget: scheduler hands off to the orchestrator action
    // since mutations cannot call actions directly.
    await ctx.scheduler.runAfter(
      0,
      internal.engines.orchestrate.runAllEnginesForProperty,
      { propertyId },
    );

    // FEMA flood zone enrichment runs in parallel with engines — only
    // fires when the extraction provided coordinates, otherwise the
    // action would no-op. Skip silently when coords are absent.
    if (
      extracted.latitude !== null &&
      extracted.longitude !== null
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.crawlers.femaFlood.lookupAndPersist,
        { propertyId },
      );
    }

    return propertyId;
  },
});

/**
 * Cheap non-cryptographic string hash (FNV-1a 32-bit) — used to build
 * a stable canonicalId when the portal didn't expose a listing id.
 */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
