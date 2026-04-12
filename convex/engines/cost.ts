"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const runCostEngine = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.union(v.id("aiEngineOutputs"), v.null()),
  handler: async (ctx, args) => {
    const property: any = await ctx.runQuery(internal.properties.getInternal, { propertyId: args.propertyId });
    if (!property) return null;

    const { computeOwnershipCosts } = await import("../../src/lib/ai/engines/cost");

    const input = {
      purchasePrice: property.listPrice ?? 0,
      taxAnnual: property.taxAnnual,
      taxAssessedValue: property.taxAssessedValue,
      hoaFee: property.hoaFee,
      hoaFrequency: property.hoaFrequency,
      roofYear: property.roofYear,
      yearBuilt: property.yearBuilt ?? 2000,
      impactWindows: property.impactWindows,
      stormShutters: property.stormShutters,
      constructionType: property.constructionType,
      floodZone: property.floodZone,
    };

    const result = computeOwnershipCosts(input);

    const outputId: any = await ctx.runMutation(internal.aiEngineOutputs.createOutput, {
      propertyId: args.propertyId,
      engineType: "cost",
      confidence: 0.75,
      citations: result.lineItems.filter(i => i.source === "fact").map(i => i.label),
      output: JSON.stringify(result),
      modelId: "deterministic-v1",
    });

    return outputId;
  },
});
