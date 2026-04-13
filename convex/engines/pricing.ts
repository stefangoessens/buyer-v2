"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { PricingInput } from "../../src/lib/ai/engines/types";
import {
  buildPricingRequest,
  parsePricingResponse,
  computeConsensus,
} from "../../src/lib/ai/engines/pricing";
import { gateway } from "../../src/lib/ai/gateway";

export const runPricingEngine = internalAction({
  args: {
    propertyId: v.id("properties"),
    promptVersion: v.string(),
  },
  returns: v.union(v.id("aiEngineOutputs"), v.null()),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.promptRegistry.syncCatalogPrompts, {
      activateMissing: true,
    });

    // 1. Load property data
    const property: any = await ctx.runQuery(
      internal.properties.getInternal,
      { propertyId: args.propertyId },
    );
    if (!property) return null;

    // 2. Load the explicitly requested pricing prompt version
    const prompt: any = await ctx.runQuery(
      internal.promptRegistry.getByVersion,
      {
        engineType: "pricing",
        promptKey: "default",
        version: args.promptVersion,
      },
    );
    if (!prompt) {
      throw new Error(`Unknown pricing prompt version: ${args.promptVersion}`);
    }

    const enrichment: any = await ctx.runQuery(
      internal.enrichment.getForPropertyInternal,
      { propertyId: args.propertyId },
    );

    // 3. Build and run the pricing engine
    const input: PricingInput =
      enrichment?.engineInputs?.pricing ?? {
        propertyId: args.propertyId,
        listPrice: property.listPrice ?? 0,
        address: property.address?.formatted ?? "Unknown",
        beds: property.beds ?? 0,
        baths: (property.bathsFull ?? 0) + (property.bathsHalf ?? 0) * 0.5,
        sqft: property.sqftLiving ?? 0,
        yearBuilt: property.yearBuilt ?? 0,
        propertyType: property.propertyType ?? "Unknown",
        zestimate: property.zestimate,
        redfinEstimate: property.redfinEstimate,
        realtorEstimate: property.realtorEstimate,
      };
    const inputSnapshot = JSON.stringify(input);

    const request = buildPricingRequest(input, prompt.prompt, prompt.systemPrompt);
    const result = await gateway(request);

    if (!result.success) return null;

    const { consensus, spread, sources } = computeConsensus(input);
    const pricingOutput = parsePricingResponse(
      result.data.content,
      input,
      consensus,
      spread,
      sources,
    );

    if (!pricingOutput) return null;

    // 4. Store the engine output
    const outputId: any = await ctx.runMutation(
      internal.aiEngineOutputs.createOutput,
      {
        propertyId: args.propertyId,
        engineType: "pricing",
        promptKey: "default",
        promptVersion: args.promptVersion,
        inputSnapshot,
        confidence: pricingOutput.overallConfidence,
        citations: pricingOutput.estimateSources,
        output: JSON.stringify(pricingOutput),
        modelId: result.data.usage.model,
      },
    );

    return outputId;
  },
});
