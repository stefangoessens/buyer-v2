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
import { DEFAULT_PRICING_PROMPT } from "../../src/lib/ai/engines/enginePromptDefaults";
import { gateway } from "../../src/lib/ai/gateway";

export const runPricingEngine = internalAction({
  args: {
    propertyId: v.id("properties"),
  },
  returns: v.union(v.id("aiEngineOutputs"), v.null()),
  handler: async (ctx, args) => {
    // 1. Load property data
    const property: any = await ctx.runQuery(
      internal.properties.getInternal,
      { propertyId: args.propertyId },
    );
    if (!property) return null;

    // 2. Get active pricing prompt from registry; fall back to the
    //    bundled default if the registry is empty so the engine never
    //    silently returns null on a fresh deployment.
    const registryPrompt: any = await ctx.runQuery(
      internal.promptRegistry.getActivePrompt,
      { engineType: "pricing" },
    );
    const prompt = registryPrompt ?? DEFAULT_PRICING_PROMPT;

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
        confidence: pricingOutput.overallConfidence,
        citations: pricingOutput.estimateSources,
        output: JSON.stringify(pricingOutput),
        modelId: result.data.usage.model,
      },
    );

    return outputId;
  },
});
