"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { LeverageInput } from "../../src/lib/ai/engines/types";
import { analyzeLeverage } from "../../src/lib/ai/engines/leverage";

export const runLeverageEngine = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.union(v.id("aiEngineOutputs"), v.null()),
  handler: async (ctx, args) => {
    const property: any = await ctx.runQuery(internal.properties.getInternal, {
      propertyId: args.propertyId,
    });
    if (!property) return null;

    const enrichment: any = await ctx.runQuery(
      internal.enrichment.getForPropertyInternal,
      { propertyId: args.propertyId },
    );

    const input: LeverageInput =
      enrichment?.engineInputs?.leverage ?? {
        propertyId: args.propertyId,
        listPrice: property.listPrice ?? 0,
        daysOnMarket: property.daysOnMarket ?? 0,
        description: property.description,
        sqft: property.sqftLiving ?? 0,
        neighborhoodMedianDom: property.neighborhoodMedianDom,
        neighborhoodMedianPsf: property.neighborhoodMedianPsf,
        wasRelisted: property.wasRelisted,
        wasWithdrawn: property.wasWithdrawn,
        wasPendingFellThrough: property.wasPendingFellThrough,
      };

    const result = analyzeLeverage(input);

    const outputId: any = await ctx.runMutation(
      internal.aiEngineOutputs.createOutput,
      {
        propertyId: args.propertyId,
        engineType: "leverage",
        confidence: result.overallConfidence,
        citations: result.signals.map((s: { citation: string }) => s.citation),
        output: JSON.stringify(result),
        modelId: "deterministic-v1",
      },
    );

    return outputId;
  },
});
