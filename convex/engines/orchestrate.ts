"use node";

import { internalAction, action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Orchestrate all property-level AI engines. Called after a property
 * is extracted + inserted (from extractionMutations.recordSuccess) or
 * manually retriggered from the admin console.
 *
 * Each engine is fire-and-forget — errors are caught and logged
 * per-engine so one failing engine doesn't block the others.
 */
export const runAllEnginesForProperty = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Pricing, comps, leverage, and cost run in parallel — they have no
    // cross-engine dependencies. Offer depends on pricing + leverage
    // outputs, so it runs after the first batch resolves.
    const independent = [
      { name: "pricing", ref: internal.engines.pricing.runPricingEngine },
      { name: "comps", ref: internal.engines.comps.runCompsEngine },
      { name: "leverage", ref: internal.engines.leverage.runLeverageEngine },
      { name: "cost", ref: internal.engines.cost.runCostEngine },
    ] as const;

    const independentResults = await Promise.all(
      independent.map(async ({ name, ref }) => {
        try {
          await ctx.runAction(ref, { propertyId: args.propertyId });
          return { name, ok: true as const };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return { name, ok: false as const, error: message };
        }
      }),
    );

    let offerResult: { name: "offer"; ok: boolean; error?: string };
    try {
      await ctx.runAction(internal.engines.offer.runOfferEngine, {
        propertyId: args.propertyId,
      });
      offerResult = { name: "offer", ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      offerResult = { name: "offer", ok: false, error: message };
    }

    // Phase 3: insights synthesizes every upstream engine output into
    // buyer-readable analytical takes — so it must run last.
    let insightsResult: { name: "insights"; ok: boolean; error?: string };
    try {
      await ctx.runAction(internal.engines.insights.runInsightsEngine, {
        propertyId: args.propertyId,
      });
      insightsResult = { name: "insights", ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      insightsResult = { name: "insights", ok: false, error: message };
    }

    const results = [...independentResults, offerResult, insightsResult];

    await ctx.runMutation(internal.engines.orchestrateMutations.logRun, {
      propertyId: args.propertyId,
      summary: results.map((r) => ({
        engine: r.name,
        ok: r.ok,
        error: r.ok ? undefined : (r.error ?? "unknown_error"),
      })),
      runAt: new Date().toISOString(),
    });

    return null;
  },
});

/**
 * Public-facing retry action for the admin console (future).
 */
export const retryAllEngines = action({
  args: { propertyId: v.id("properties") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.engines.orchestrate.runAllEnginesForProperty,
      { propertyId: args.propertyId },
    );
    return null;
  },
});
