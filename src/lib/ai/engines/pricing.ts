import type { PricingInput, PricingOutput, PricePoint } from "./types";
import type { GatewayRequest } from "../types";

/**
 * Compute consensus estimate from available portal estimates.
 * Uses median of available values.
 */
export function computeConsensus(input: PricingInput): {
  consensus: number;
  spread: number;
  sources: string[];
} {
  const estimates: { value: number; source: string }[] = [];
  if (input.zestimate) estimates.push({ value: input.zestimate, source: "zillow" });
  if (input.redfinEstimate) estimates.push({ value: input.redfinEstimate, source: "redfin" });
  if (input.realtorEstimate) estimates.push({ value: input.realtorEstimate, source: "realtor" });

  if (estimates.length === 0) {
    return { consensus: input.listPrice, spread: 0, sources: [] };
  }

  const values = estimates.map((e) => e.value).sort((a, b) => a - b);
  const sources = estimates.map((e) => e.source);

  // Median
  const mid = Math.floor(values.length / 2);
  const consensus =
    values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];

  // Spread = coefficient of variation (std dev / mean)
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const spread = mean > 0 ? Math.sqrt(variance) / mean : 0;

  return { consensus, spread, sources };
}

/**
 * Compute confidence adjustment based on estimate spread.
 * High disagreement between portals lowers confidence.
 */
export function spreadConfidenceAdjustment(spread: number): number {
  if (spread < 0.03) return 1.0; // < 3% spread — high agreement
  if (spread < 0.07) return 0.9; // 3-7% — moderate
  if (spread < 0.12) return 0.75; // 7-12% — some disagreement
  return 0.6; // > 12% — significant disagreement
}

/**
 * Build a price point with deltas.
 */
export function buildPricePoint(
  value: number,
  listPrice: number,
  consensus: number,
  baseConfidence: number,
): PricePoint {
  return {
    value: Math.round(value),
    deltaVsListPrice: Number(
      (((value - listPrice) / listPrice) * 100).toFixed(1),
    ),
    deltaVsConsensus: Number(
      (((value - consensus) / consensus) * 100).toFixed(1),
    ),
    confidence: Number(baseConfidence.toFixed(2)),
  };
}

/**
 * Build the gateway request for the pricing engine.
 */
export function buildPricingRequest(
  input: PricingInput,
  promptTemplate: string,
  systemPrompt?: string,
): GatewayRequest {
  const { consensus, spread, sources } = computeConsensus(input);
  const spreadAdj = spreadConfidenceAdjustment(spread);

  const userMessage = promptTemplate
    .replace("{{address}}", input.address)
    .replace("{{listPrice}}", input.listPrice.toLocaleString())
    .replace("{{beds}}", String(input.beds))
    .replace("{{baths}}", String(input.baths))
    .replace("{{sqft}}", input.sqft.toLocaleString())
    .replace("{{yearBuilt}}", String(input.yearBuilt))
    .replace("{{propertyType}}", input.propertyType)
    .replace("{{consensus}}", consensus.toLocaleString())
    .replace("{{spread}}", (spread * 100).toFixed(1))
    .replace("{{sources}}", sources.join(", ") || "none")
    .replace(
      "{{neighborhoodMedianPsf}}",
      input.neighborhoodMedianPsf?.toLocaleString() ?? "N/A",
    )
    .replace(
      "{{compAvgPsf}}",
      input.compAvgPsf?.toLocaleString() ?? "N/A",
    );

  const messages: GatewayRequest["messages"] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userMessage });

  return {
    messages,
    engineType: "pricing",
    maxTokens: 2048,
    temperature: 0,
  };
}

/**
 * Parse the AI response into a typed PricingOutput.
 * Expects JSON in the response.
 */
export function parsePricingResponse(
  responseText: string,
  input: PricingInput,
  consensus: number,
  spread: number,
  sources: string[],
): PricingOutput | null {
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const spreadAdj = spreadConfidenceAdjustment(spread);

    return {
      fairValue: buildPricePoint(
        parsed.fairValue,
        input.listPrice,
        consensus,
        0.85 * spreadAdj,
      ),
      likelyAccepted: buildPricePoint(
        parsed.likelyAccepted,
        input.listPrice,
        consensus,
        0.8 * spreadAdj,
      ),
      strongOpener: buildPricePoint(
        parsed.strongOpener,
        input.listPrice,
        consensus,
        0.75 * spreadAdj,
      ),
      walkAway: buildPricePoint(
        parsed.walkAway,
        input.listPrice,
        consensus,
        0.7 * spreadAdj,
      ),
      consensusEstimate: consensus,
      estimateSpread: Number((spread * 100).toFixed(1)),
      estimateSources: sources,
      overallConfidence: Number((0.8 * spreadAdj).toFixed(2)),
    };
  } catch {
    return null;
  }
}
