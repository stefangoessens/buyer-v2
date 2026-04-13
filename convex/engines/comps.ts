"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const runCompsEngine = internalAction({
  args: {
    propertyId: v.id("properties"),
    candidates: v.optional(v.array(v.any())),
  },
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

    const { selectComps } = await import("../../src/lib/ai/engines/comps");

    const subject = {
      address: property.address?.formatted ?? "Unknown",
      beds: property.beds ?? 0,
      baths: (property.bathsFull ?? 0) + (property.bathsHalf ?? 0) * 0.5,
      sqft: property.sqftLiving ?? 0,
      yearBuilt: property.yearBuilt ?? 0,
      lotSize: property.lotSize,
      propertyType: property.propertyType ?? "Unknown",
      waterfront: property.waterfrontType
        ? property.waterfrontType !== "none"
        : false,
      pool: property.pool,
      hoaFee: property.hoaFee,
      subdivision: property.subdivision,
      zip: property.zip ?? property.address?.zip ?? "",
      listPrice: property.listPrice ?? 0,
    };

    const candidates =
      args.candidates && args.candidates.length > 0
        ? args.candidates
        : enrichment?.engineInputs?.compsCandidates ?? [];

    const result = selectComps({ subject, candidates });

    const outputId: any = await ctx.runMutation(
      internal.aiEngineOutputs.createOutput,
      {
        propertyId: args.propertyId,
        engineType: "comps",
        confidence:
          result.comps.length >= 3
            ? 0.85
            : result.comps.length >= 1
              ? 0.6
              : 0.3,
        citations: result.comps.map((c) => c.sourceCitation),
        output: JSON.stringify(result),
        modelId: "deterministic-v1",
      },
    );

    return outputId;
  },
});
