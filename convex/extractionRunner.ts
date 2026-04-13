"use node";

/**
 * Convex action that runs a property extraction job for a sourceListing.
 *
 * Flow:
 *   1. Fetch the listing via the FastAPI extraction service
 *      (which calls Bright Data → parses HTML → returns canonical data).
 *   2. On success, dispatch to `extractionMutations.recordSuccess` which
 *      inserts the property row and flips the sourceListing to "complete".
 *   3. On failure, dispatch to `extractionMutations.recordFailure` with a
 *      typed error code so the client can render a useful message.
 *
 * Deal rooms are intentionally NOT created here — the anonymous paste
 * flow just lands on /property/${id} which can prompt signup before
 * creating a scoped deal room.
 *
 * This file uses "use node" for fetch() + AbortSignal.timeout, so it
 * may only contain actions. Mutations live in `extractionMutations.ts`.
 */

import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

// ═══ Types the extraction service returns ═══
// Mirrors services/extraction/src/contracts.py::CanonicalPropertyResponse.

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

interface ExtractListingResponse {
  portal: "zillow" | "redfin" | "realtor";
  property: CanonicalPropertyResponse;
  fetch: FetchMetadataResponse;
}

interface ErrorResponse {
  code: string;
  message: string;
  portal?: string | null;
  url?: string | null;
  vendor?: string | null;
  retryable?: boolean | null;
  request_id?: string | null;
}

// ═══ Action entry point ═══

/**
 * Run an extraction job for a sourceListing. Fire-and-forget — the
 * caller (usually `intake.submitUrl`) schedules this and immediately
 * returns the sourceListingId to the client, which polls for the
 * propertyId via `intake.getIntakeStatus`.
 *
 * Never returns a thrown error to the caller: all failures are recorded
 * as `status: "failed"` on the sourceListing so the client can
 * distinguish "still running" from "permanently broken".
 */
export const runExtractionJob = internalAction({
  args: {
    sourceListingId: v.id("sourceListings"),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const serviceBaseUrl =
      process.env.EXTRACTION_SERVICE_URL ?? "http://localhost:8000";

    // Mark running so the client UI can show a spinner rather than
    // staying on "queued" forever if the service takes a few seconds.
    await ctx.runMutation(internal.extractionMutations.markRunning, {
      sourceListingId: args.sourceListingId,
    });

    let response: Response;
    try {
      response = await fetch(`${serviceBaseUrl}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: args.url }),
        // Allow up to 90s — Bright Data + Browser Use fallback can take
        // a while on slow pages. Convex default action timeout is 10 min
        // so this headroom is safe.
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      await ctx.runMutation(internal.extractionMutations.recordFailure, {
        sourceListingId: args.sourceListingId,
        errorCode: "service_unreachable",
        errorMessage:
          error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    if (!response.ok) {
      // FastAPI returns ErrorResponse as JSON for 4xx/5xx.
      let payload: ErrorResponse = {
        code: "unknown_error",
        message: `HTTP ${response.status}`,
      };
      try {
        payload = (await response.json()) as ErrorResponse;
      } catch {
        // Body wasn't JSON — keep the default.
      }
      await ctx.runMutation(internal.extractionMutations.recordFailure, {
        sourceListingId: args.sourceListingId,
        errorCode: payload.code ?? "unknown_error",
        errorMessage: payload.message ?? `HTTP ${response.status}`,
      });
      return null;
    }

    let result: ExtractListingResponse;
    try {
      result = (await response.json()) as ExtractListingResponse;
    } catch (error) {
      await ctx.runMutation(internal.extractionMutations.recordFailure, {
        sourceListingId: args.sourceListingId,
        errorCode: "invalid_response_body",
        errorMessage:
          error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    await ctx.runMutation(internal.extractionMutations.recordSuccess, {
      sourceListingId: args.sourceListingId,
      property: result.property,
      fetch: result.fetch,
    });

    return null;
  },
});

// ═══ Public action — used for manual retries from the UI ═══

/**
 * Public-facing action that lets the frontend trigger a retry for a
 * failed sourceListing. Calls the internal runner after verifying
 * the caller is authenticated (anonymous paste → buyer → retry flow).
 */
export const retryExtraction = action({
  args: { sourceListingId: v.id("sourceListings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await ctx.runQuery(api.intake.getIntakeStatus, {
      sourceListingId: args.sourceListingId,
    });
    if (!listing) throw new Error("Source listing not found");
    if (listing.status !== "failed") {
      throw new Error(
        `Cannot retry — sourceListing is in state "${listing.status}"`,
      );
    }
    await ctx.scheduler.runAfter(
      0,
      internal.extractionRunner.runExtractionJob,
      {
        sourceListingId: args.sourceListingId,
        url: listing.sourceUrl,
      },
    );
    return null;
  },
});
