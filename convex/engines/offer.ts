"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

export const runOfferEngine = internalAction({
  args: {
    propertyId: v.id("properties"),
    buyerMaxBudget: v.optional(v.number()),
    competingOffers: v.optional(v.number()),
  },
  returns: v.union(v.id("aiEngineOutputs"), v.null()),
  handler: async (ctx, args) => {
    const property: any = await ctx.runQuery(internal.properties.getInternal, {
      propertyId: args.propertyId,
    });
    if (!property || !property.listPrice) return null;

    const { generateOfferScenarios } = await import(
      "../../src/lib/ai/engines/offer"
    );

    // Get latest pricing output for fair value
    const pricingOutput: any = await ctx.runQuery(
      api.aiEngineOutputs.getLatest,
      {
        propertyId: args.propertyId,
        engineType: "pricing",
      },
    );
    let fairValue: number | undefined;
    if (pricingOutput) {
      try {
        fairValue = JSON.parse(pricingOutput.output).fairValue?.value;
      } catch {
        // pricing output may not be parseable — proceed without fair value
      }
    }

    // Get latest leverage score
    const leverageOutput: any = await ctx.runQuery(
      api.aiEngineOutputs.getLatest,
      {
        propertyId: args.propertyId,
        engineType: "leverage",
      },
    );
    let leverageScore: number | undefined;
    if (leverageOutput) {
      try {
        leverageScore = JSON.parse(leverageOutput.output).score;
      } catch {
        // leverage output may not be parseable — proceed without leverage score
      }
    }

    const result = generateOfferScenarios({
      listPrice: property.listPrice,
      fairValue,
      leverageScore,
      buyerMaxBudget: args.buyerMaxBudget,
      daysOnMarket: property.daysOnMarket,
      competingOffers: args.competingOffers,
    });

    const outputId: any = await ctx.runMutation(
      internal.aiEngineOutputs.createOutput,
      {
        propertyId: args.propertyId,
        engineType: "offer",
        confidence: 0.75,
        citations: ["pricing_engine", "leverage_engine"],
        output: JSON.stringify(result),
        modelId: "deterministic-v1",
      },
    );

    return outputId;
  },
});
