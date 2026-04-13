"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { InsightsInput } from "../../src/lib/ai/engines/types";
import {
  buildInsightsRequest,
  parseInsightsResponse,
} from "../../src/lib/ai/engines/insights";
import { gateway } from "../../src/lib/ai/gateway";

/**
 * Insights engine — Phase 3 of the property pipeline.
 * Runs after pricing, comps, leverage, cost, and offer have persisted,
 * because it references their outputs when building the prompt payload.
 * Returns the inserted aiEngineOutputs ID, or null on failure.
 */
export const runInsightsEngine = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.union(v.id("aiEngineOutputs"), v.null()),
  handler: async (ctx, args) => {
    const property: any = await ctx.runQuery(internal.properties.getInternal, {
      propertyId: args.propertyId,
    });
    if (!property) return null;

    const prompt: any = await ctx.runQuery(
      internal.promptRegistry.getActivePrompt,
      { engineType: "insights" },
    );

    const [
      pricingOutput,
      compsOutput,
      leverageOutput,
      offerOutput,
      costOutput,
    ] = await Promise.all([
      ctx.runQuery(api.aiEngineOutputs.getLatest, {
        propertyId: args.propertyId,
        engineType: "pricing",
      }),
      ctx.runQuery(api.aiEngineOutputs.getLatest, {
        propertyId: args.propertyId,
        engineType: "comps",
      }),
      ctx.runQuery(api.aiEngineOutputs.getLatest, {
        propertyId: args.propertyId,
        engineType: "leverage",
      }),
      ctx.runQuery(api.aiEngineOutputs.getLatest, {
        propertyId: args.propertyId,
        engineType: "offer",
      }),
      ctx.runQuery(api.aiEngineOutputs.getLatest, {
        propertyId: args.propertyId,
        engineType: "cost",
      }),
    ]);

    const parseIfPresent = (record: any): unknown => {
      if (!record || typeof record.output !== "string") return undefined;
      try {
        return JSON.parse(record.output);
      } catch {
        return undefined;
      }
    };

    const input: InsightsInput = {
      propertyId: args.propertyId,
      property: {
        listPrice: property.listPrice ?? null,
        address: {
          city: property.address?.city ?? "",
          state: property.address?.state ?? "FL",
          zip: property.address?.zip ?? "",
          formatted: property.address?.formatted,
        },
        propertyType: property.propertyType ?? null,
        beds: property.beds ?? null,
        bathsFull: property.bathsFull ?? null,
        bathsHalf: property.bathsHalf ?? null,
        sqftLiving: property.sqftLiving ?? null,
        lotSize: property.lotSize ?? null,
        yearBuilt: property.yearBuilt ?? null,
        hoaFee: property.hoaFee ?? null,
        daysOnMarket: property.daysOnMarket ?? null,
        description: property.description ?? null,
        sourcePlatform: property.sourcePlatform ?? "unknown",
      },
      pricingOutput: parseIfPresent(pricingOutput),
      compsOutput: parseIfPresent(compsOutput),
      leverageOutput: parseIfPresent(leverageOutput),
      offerOutput: parseIfPresent(offerOutput),
      costOutput: parseIfPresent(costOutput),
    };

    const request = buildInsightsRequest(
      input,
      prompt?.systemPrompt,
      prompt?.prompt,
    );
    const result = await gateway(request);
    if (!result.success) return null;

    const tokensUsed =
      result.data.usage.inputTokens + result.data.usage.outputTokens;
    const insightsOutput = parseInsightsResponse(
      result.data.content,
      input,
      tokensUsed,
    );
    if (!insightsOutput) return null;

    const citations = Array.from(
      new Set(insightsOutput.insights.flatMap((i) => i.citations)),
    );

    const outputId: any = await ctx.runMutation(
      internal.aiEngineOutputs.createOutput,
      {
        propertyId: args.propertyId,
        engineType: "insights",
        confidence: insightsOutput.overallConfidence,
        citations,
        output: JSON.stringify(insightsOutput),
        modelId: result.data.usage.model,
      },
    );

    return outputId;
  },
});
