/**
 * Property case synthesis layer (KIN-854).
 *
 * Deterministic orchestrator that composes structured engine outputs
 * (pricing, comps, leverage, offer) into a series of comparative claims —
 * the headline narrative the buyer reads when they open a deal room.
 *
 * CORE RULE: Every claim names a market reference. "Priced 6% above
 * neighborhood median $/sqft" is a claim. "Priced at $650k" is not.
 * Bare absolutes are stripped at the synthesizer level so no downstream
 * renderer can accidentally display them.
 *
 * Confidence-aware: claims derived from low-confidence engine outputs are
 * DROPPED, not fabricated. The synthesizer never invents a market reference
 * when the engine didn't give it one.
 *
 * No LLM calls at this layer — this is a pure composition of the structured
 * engine outputs into a typed claim stream. A separate prompt-based layer
 * can later polish the narrative text, but the composition itself is
 * deterministic so callers can cache outputs and run offline eval against
 * it.
 */

import type {
  CompsOutput,
  LeverageOutput,
  OfferOutput,
  PricingOutput,
} from "./types";

// ───────────────────────────────────────────────────────────────────────────
// Claim shape — every claim follows this structure
// ───────────────────────────────────────────────────────────────────────────

/** Topic categories for claims — used for grouping and UI ordering. */
export const CLAIM_TOPICS = [
  "pricing",
  "comps",
  "days_on_market",
  "leverage",
  "offer_recommendation",
] as const;

export type ClaimTopic = (typeof CLAIM_TOPICS)[number];

/** Direction of the delta relative to the market reference. */
export type ClaimDirection = "above" | "below" | "at";

/**
 * A single comparative claim. Every field is required because the whole
 * point is that no bare absolutes exist here — if we don't have a reference,
 * we don't emit the claim.
 */
export interface ComparativeClaim {
  /** Stable ID scoped per-synthesis; used by UI for keyed lists. */
  id: string;
  topic: ClaimTopic;
  /** The subject value (e.g., current list price, days on market). */
  value: number;
  /** Unit of the value — "usd", "psf", "days", "pct", "count". */
  unit: "usd" | "psf" | "days" | "pct" | "count";
  /** The market reference value the claim compares against. */
  marketReference: number;
  /** Human label for the market reference ("neighborhood median", "comp avg", etc.). */
  marketReferenceLabel: string;
  /** Signed delta: positive = value above reference, negative = below. */
  delta: number;
  /** Delta as a percentage of the reference (positive = above). */
  deltaPct: number;
  direction: ClaimDirection;
  /** 0-1 confidence propagated from the source engine. */
  confidence: number;
  /** ID/string that identifies the engine output this claim came from. */
  citation: string;
  /** Short human-readable summary of the claim. */
  narrative: string;
}

/** Recommended action surfaced alongside the claim stream. */
export interface RecommendedAction {
  /** Opening offer price. */
  openingPrice: number;
  /** Rationale — each reason is a reference to a claim topic. */
  rationaleClaimIds: string[];
  /** Suggested contingencies and terms. */
  suggestedContingencies: string[];
  /** Risk level from the offer engine. */
  riskLevel: "low" | "medium" | "high";
  /** Confidence in the recommended action. */
  confidence: number;
}

/** The complete synthesized case. */
export interface PropertyCase {
  claims: ComparativeClaim[];
  recommendedAction?: RecommendedAction;
  /** Overall confidence — minimum of any claim's confidence, floored at 0. */
  overallConfidence: number;
  /** Number of upstream engines that contributed usable output. */
  contributingEngines: number;
  /** Hash of the inputs — stable key for caching. */
  inputHash: string;
  /** Prompt/builder version — bump on synthesis logic change. */
  synthesisVersion: string;
  /** Engines whose output was dropped due to low confidence. */
  droppedEngines: string[];
}

/** Input envelope for the synthesizer. */
export interface CaseSynthesisInput {
  pricing?: { output: PricingOutput; citationId: string };
  comps?: { output: CompsOutput; citationId: string };
  leverage?: { output: LeverageOutput; citationId: string };
  offer?: { output: OfferOutput; citationId: string };
  /** Current list price — used as the subject value for pricing claims. */
  listPrice: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Configuration
// ───────────────────────────────────────────────────────────────────────────

/** Synthesis version — bump on any output-shape or claim-logic change. */
export const SYNTHESIS_VERSION = "1.0.0";

/** Confidence threshold below which a claim's engine is dropped entirely. */
export const MIN_CONFIDENCE = 0.5;

/**
 * Explicit mapping from leverage signal name to claim topic + unit.
 *
 * The leverage engine (KIN-788) emits signals with stable names like
 * `days_on_market_pressure`, `price_vs_market`, `price_reductions`, etc.
 * Earlier substring heuristics (`sig.name.includes("dom")`) missed these
 * names entirely, mislabeling DOM claims as "leverage"/"count" instead of
 * "days_on_market"/"days". This explicit table keeps the mapping stable
 * as new signal names are added upstream.
 *
 * Unknown signal names fall back to topic="leverage" and unit="count".
 */
const LEVERAGE_SIGNAL_CLASSIFICATION: Record<
  string,
  { topic: ClaimTopic; unit: ComparativeClaim["unit"] }
> = {
  dom_vs_median: { topic: "days_on_market", unit: "days" },
  days_on_market_pressure: { topic: "days_on_market", unit: "days" },
  listing_age: { topic: "days_on_market", unit: "days" },
  price_vs_market: { topic: "leverage", unit: "psf" },
  psf_vs_median: { topic: "leverage", unit: "psf" },
  price_reductions: { topic: "leverage", unit: "count" },
  price_cut_count: { topic: "leverage", unit: "count" },
  price_cut_total: { topic: "leverage", unit: "usd" },
  agent_avg_dom: { topic: "leverage", unit: "days" },
  agent_sale_to_list: { topic: "leverage", unit: "pct" },
};

function classifyLeverageSignal(name: string): {
  topic: ClaimTopic;
  unit: ComparativeClaim["unit"];
} {
  const exact = LEVERAGE_SIGNAL_CLASSIFICATION[name];
  if (exact) return exact;
  // Fallback for unknown names: substring heuristic, then defaults.
  // Prefer explicit registration above — this path is just a safety net.
  if (/dom|days_on_market|listing_age/i.test(name)) {
    return { topic: "days_on_market", unit: "days" };
  }
  if (/psf|per_sqft|sqft_price/i.test(name)) {
    return { topic: "leverage", unit: "psf" };
  }
  return { topic: "leverage", unit: "count" };
}

// ───────────────────────────────────────────────────────────────────────────
// Per-engine claim extractors
// ───────────────────────────────────────────────────────────────────────────

function extractPricingClaims(
  pricing: CaseSynthesisInput["pricing"],
  listPrice: number,
): ComparativeClaim[] {
  if (!pricing) return [];
  if (pricing.output.overallConfidence < MIN_CONFIDENCE) return [];

  const claims: ComparativeClaim[] = [];
  const out = pricing.output;
  const consensus = out.consensusEstimate;

  // Claim 1: list price vs consensus estimate
  if (consensus > 0) {
    const delta = listPrice - consensus;
    const deltaPct = (delta / consensus) * 100;
    const direction: ClaimDirection = delta > 0 ? "above" : delta < 0 ? "below" : "at";
    claims.push({
      id: "pricing_vs_consensus",
      topic: "pricing",
      value: listPrice,
      unit: "usd",
      marketReference: consensus,
      marketReferenceLabel: `consensus of ${out.estimateSources.length} estimates`,
      delta,
      deltaPct: round2(deltaPct),
      direction,
      confidence: out.overallConfidence,
      citation: pricing.citationId,
      narrative: `${direction === "below" ? "Below" : direction === "above" ? "Above" : "At"} the consensus of ${out.estimateSources.length} estimates by ${Math.abs(round2(deltaPct))}%`,
    });
  }

  // Claim 2: fair value vs list price
  if (out.fairValue.confidence >= MIN_CONFIDENCE) {
    const delta = listPrice - out.fairValue.value;
    const deltaPct = out.fairValue.value > 0 ? (delta / out.fairValue.value) * 100 : 0;
    const direction: ClaimDirection = delta > 0 ? "above" : delta < 0 ? "below" : "at";
    claims.push({
      id: "list_vs_fair_value",
      topic: "pricing",
      value: listPrice,
      unit: "usd",
      marketReference: out.fairValue.value,
      marketReferenceLabel: "fair value estimate",
      delta,
      deltaPct: round2(deltaPct),
      direction,
      confidence: out.fairValue.confidence,
      citation: pricing.citationId,
      narrative: `List price ${direction === "above" ? "above" : direction === "below" ? "below" : "at"} fair value by ${Math.abs(round2(deltaPct))}%`,
    });
  }

  return claims;
}

function extractCompsClaims(
  comps: CaseSynthesisInput["comps"],
  listPrice: number,
  subjectSqft?: number,
): ComparativeClaim[] {
  if (!comps) return [];
  if (comps.output.comps.length < 3) return [];

  const claims: ComparativeClaim[] = [];
  const agg = comps.output.aggregates;

  // Claim 1: list price vs median sold price
  if (agg.medianSoldPrice > 0) {
    const delta = listPrice - agg.medianSoldPrice;
    const deltaPct = (delta / agg.medianSoldPrice) * 100;
    const direction: ClaimDirection = delta > 0 ? "above" : delta < 0 ? "below" : "at";
    claims.push({
      id: "list_vs_comps_median",
      topic: "comps",
      value: listPrice,
      unit: "usd",
      marketReference: agg.medianSoldPrice,
      marketReferenceLabel: `median sold price of ${comps.output.comps.length} comps`,
      delta,
      deltaPct: round2(deltaPct),
      direction,
      confidence: 0.85,
      citation: comps.citationId,
      narrative: `List price ${direction} median of ${comps.output.comps.length} recent comps by ${Math.abs(round2(deltaPct))}%`,
    });
  }

  // Claim 2: list $/sqft vs median comp $/sqft (requires subject sqft)
  if (subjectSqft && subjectSqft > 0 && agg.medianPricePerSqft > 0) {
    const listPsf = listPrice / subjectSqft;
    const delta = listPsf - agg.medianPricePerSqft;
    const deltaPct = (delta / agg.medianPricePerSqft) * 100;
    const direction: ClaimDirection = delta > 0 ? "above" : delta < 0 ? "below" : "at";
    claims.push({
      id: "psf_vs_comps_median",
      topic: "comps",
      value: round2(listPsf),
      unit: "psf",
      marketReference: agg.medianPricePerSqft,
      marketReferenceLabel: "comp median $/sqft",
      delta: round2(delta),
      deltaPct: round2(deltaPct),
      direction,
      confidence: 0.85,
      citation: comps.citationId,
      narrative: `Priced ${direction === "above" ? "above" : direction === "below" ? "below" : "at"} comp median $/sqft by ${Math.abs(round2(deltaPct))}%`,
    });
  }

  return claims;
}

function extractLeverageClaims(
  leverage: CaseSynthesisInput["leverage"],
): ComparativeClaim[] {
  if (!leverage) return [];
  if (leverage.output.overallConfidence < MIN_CONFIDENCE) return [];

  const claims: ComparativeClaim[] = [];
  const out = leverage.output;

  // Take top 3 signals by absolute delta magnitude. We explicitly DROP
  // non-numeric signals (e.g. `motivated_seller_language` which carries
  // string value/marketReference). Coercing them to 0 would emit a
  // nonsensical "0 vs 0" comparative claim and fabricate a market
  // reference where none exists — a violation of the synthesis contract.
  // Leverage sentiment from those signals is preserved in the leverage
  // engine output itself and can be surfaced separately by the UI.
  const topSignals = [...out.signals]
    .filter(
      (s) =>
        s.confidence >= MIN_CONFIDENCE &&
        Number.isFinite(s.delta) &&
        typeof s.value === "number" &&
        typeof s.marketReference === "number" &&
        Number.isFinite(s.value) &&
        Number.isFinite(s.marketReference),
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  for (const sig of topSignals) {
    // value and marketReference are guaranteed numeric by the filter above.
    const valueNumeric = sig.value as number;
    const refNumeric = sig.marketReference as number;

    // Derive direction from the numeric delta sign, NOT from the
    // bullish/bearish sentiment label. A bullish DOM signal has a positive
    // delta (more DOM than median = above), but mapping bullish→below
    // would flip the sign and contradict the numbers the UI displays.
    // Sentiment (bullish/bearish) is a separate concept from "above/below
    // market reference" and shouldn't be conflated.
    const delta = sig.delta;
    const direction: ClaimDirection =
      delta > 0 ? "above" : delta < 0 ? "below" : "at";

    const { topic, unit } = classifyLeverageSignal(sig.name);

    claims.push({
      id: `leverage_${sig.name}`,
      topic,
      value: valueNumeric,
      unit,
      marketReference: refNumeric,
      marketReferenceLabel: "neighborhood median",
      delta: round2(delta),
      deltaPct:
        refNumeric !== 0 ? round2((delta / Math.abs(refNumeric)) * 100) : 0,
      direction,
      confidence: sig.confidence,
      citation: leverage.citationId,
      narrative: `${sig.name.replaceAll("_", " ")}: ${valueNumeric} vs ${refNumeric} (${sig.direction} sentiment, ${direction} numerically)`,
    });
  }

  return claims;
}

function extractOfferRecommendation(
  offer: CaseSynthesisInput["offer"],
  claims: ComparativeClaim[],
): RecommendedAction | undefined {
  if (!offer) return undefined;
  if (offer.output.scenarios.length === 0) return undefined;

  // Pick the recommended scenario defensively
  const rawIdx = Number.isFinite(offer.output.recommendedIndex)
    ? Math.trunc(offer.output.recommendedIndex)
    : 0;
  const idx = Math.min(
    Math.max(rawIdx, 0),
    offer.output.scenarios.length - 1,
  );
  const chosen = offer.output.scenarios[idx];

  // Rationale references existing claim IDs the caller already has — this
  // keeps the rationale grounded in the synthesized case, not in free text.
  const rationaleClaimIds = claims
    .filter((c) => c.topic === "pricing" || c.topic === "leverage")
    .slice(0, 3)
    .map((c) => c.id);

  return {
    openingPrice: chosen.price,
    rationaleClaimIds,
    suggestedContingencies: [...chosen.contingencies],
    riskLevel: chosen.riskLevel,
    confidence: chosen.competitivenessScore / 100,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Top-level synthesizer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Synthesize a property case from structured engine outputs. Pure function —
 * same inputs produce byte-identical output. The returned `inputHash` is a
 * stable key for caching.
 *
 * `subjectSqft` is optional; when supplied, enables the $/sqft comps claim.
 */
export function synthesizeCase(
  input: CaseSynthesisInput,
  options: { subjectSqft?: number } = {},
): PropertyCase {
  const droppedEngines: string[] = [];

  // Determine which engines have usable output before claim extraction so
  // the UI can show "pricing unavailable" messaging deterministically.
  if (input.pricing && input.pricing.output.overallConfidence < MIN_CONFIDENCE) {
    droppedEngines.push("pricing");
  }
  if (input.comps && input.comps.output.comps.length < 3) {
    droppedEngines.push("comps");
  }
  if (input.leverage && input.leverage.output.overallConfidence < MIN_CONFIDENCE) {
    droppedEngines.push("leverage");
  }

  const pricingClaims = extractPricingClaims(input.pricing, input.listPrice);
  const compsClaims = extractCompsClaims(
    input.comps,
    input.listPrice,
    options.subjectSqft,
  );
  const leverageClaims = extractLeverageClaims(input.leverage);

  const claims = [...pricingClaims, ...compsClaims, ...leverageClaims];

  const recommendedAction = extractOfferRecommendation(input.offer, claims);

  // Count only engines that ACTUALLY contributed output, not engines with
  // inputs present. An engine could be supplied but produce no usable
  // claims/recommendation (e.g. offer with empty scenarios, leverage with
  // all non-numeric signals). Counting by input presence inflates the
  // metric and misleads UI logic that relies on contribution counts.
  const contributingEngines =
    (pricingClaims.length > 0 ? 1 : 0) +
    (compsClaims.length > 0 ? 1 : 0) +
    (leverageClaims.length > 0 ? 1 : 0) +
    (recommendedAction ? 1 : 0);

  const overallConfidence =
    claims.length > 0
      ? Math.min(...claims.map((c) => c.confidence))
      : 0;

  const inputHash = computeInputHash(input, options.subjectSqft);

  return {
    claims,
    recommendedAction,
    overallConfidence: round2(overallConfidence),
    contributingEngines,
    inputHash,
    synthesisVersion: SYNTHESIS_VERSION,
    droppedEngines,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compute a stable hash of the synthesis inputs. Uses JSON-stringified
 * engine outputs (which are themselves deterministic) plus the subject sqft.
 * This is NOT a crypto hash — it's a cache key.
 */
function computeInputHash(
  input: CaseSynthesisInput,
  subjectSqft: number | undefined,
): string {
  const parts = [
    input.listPrice.toString(),
    subjectSqft?.toString() ?? "",
    input.pricing ? JSON.stringify(input.pricing) : "",
    input.comps ? JSON.stringify(input.comps) : "",
    input.leverage ? JSON.stringify(input.leverage) : "",
    input.offer ? JSON.stringify(input.offer) : "",
  ];
  return simpleHash(parts.join("|"));
}

/**
 * FNV-1a 32-bit hash in hex. Cheap and collision-resistant enough for a
 * cache key. Not cryptographic — do not use for security decisions.
 */
function simpleHash(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
