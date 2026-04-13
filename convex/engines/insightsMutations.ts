import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireRole } from "../lib/session";

/**
 * Broker/admin-only retrigger for the insights engine.
 * Persistence of generated insights flows through the shared
 * aiEngineOutputs.createOutput mutation; this file exists so the
 * admin console has a direct handle to refresh insights for a
 * single property without re-running every upstream engine.
 */
export const regenerateForProperty = mutation({
  args: { propertyId: v.id("properties") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");

    await ctx.scheduler.runAfter(
      0,
      internal.engines.insights.runInsightsEngine,
      { propertyId: args.propertyId },
    );

    return null;
  },
});
