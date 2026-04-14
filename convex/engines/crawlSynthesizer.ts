"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import {
  buildCrawlSynthesizerRequest,
  parseCrawlSynthesizerResponse,
  type CrawlSynthesizerInput,
} from "../../src/lib/ai/engines/crawlSynthesizer";
import { gateway } from "../../src/lib/ai/gateway";

/**
 * Crawl synthesizer engine — cross-references upstream crawl outputs
 * (Zestimate, Redfin Estimate, FEMA flood zone) with existing engine
 * outputs (pricing, insights) into 3-5 synthesized insights.
 *
 * PAPA + permits crawlers (KIN-1072, KIN-1073) are not yet shipped, so
 * this engine runs with the data we have today and will pick up the
 * additional sources automatically when those cards land.
 */
export const runCrawlSynthesizerEngine = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.union(v.id("aiEngineOutputs"), v.null()),
  handler: async (ctx, args) => {
    const property: any = await ctx.runQuery(
      internal.properties.getInternal,
      { propertyId: args.propertyId },
    );
    if (!property) return null;

    const prompt: any = await ctx.runQuery(
      internal.promptRegistry.getActivePrompt,
      { engineType: "crawl_synthesizer" },
    );

    const [pricingOutput, insightsOutput] = await Promise.all([
      ctx.runQuery(api.aiEngineOutputs.getLatest, {
        propertyId: args.propertyId,
        engineType: "pricing",
      }),
      ctx.runQuery(api.aiEngineOutputs.getLatest, {
        propertyId: args.propertyId,
        engineType: "insights",
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

    const input: CrawlSynthesizerInput = {
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
        yearBuilt: property.yearBuilt ?? null,
        daysOnMarket: property.daysOnMarket ?? null,
        zestimate: property.zestimate ?? null,
        redfinEstimate: property.redfinEstimate ?? null,
        femaFloodZone: property.femaFloodZone ?? null,
        femaBaseFloodElevation: property.femaBaseFloodElevation ?? null,
        femaFloodInsuranceRequired: property.femaFloodInsuranceRequired ?? null,
      },
      pricingOutput: parseIfPresent(pricingOutput),
      insightsOutput: parseIfPresent(insightsOutput),
    };

    // Cost guardrail: don't synthesize unless we have at least one
    // crawl-expansion data point. Otherwise the engine is just
    // re-summarizing the base insights, which already exist.
    const hasCrawlData =
      input.property.zestimate !== null ||
      input.property.redfinEstimate !== null ||
      input.property.femaFloodZone !== null;
    if (!hasCrawlData) return null;

    const request = buildCrawlSynthesizerRequest(
      input,
      prompt?.systemPrompt,
      prompt?.prompt,
    );
    const result = await gateway(request);
    if (!result.success) return null;

    const output = parseCrawlSynthesizerResponse(result.data.content, input);
    if (!output) return null;

    const citations = Array.from(
      new Set(
        output.insights.flatMap((i) =>
          i.citations.map((c) => `${c.source}:${c.ref}`),
        ),
      ),
    );

    const outputId: any = await ctx.runMutation(
      internal.aiEngineOutputs.createOutput,
      {
        propertyId: args.propertyId,
        engineType: "crawl_synthesizer",
        confidence: output.overallConfidence,
        citations,
        output: JSON.stringify(output),
        modelId: result.data.usage.model,
      },
    );

    return outputId;
  },
});
