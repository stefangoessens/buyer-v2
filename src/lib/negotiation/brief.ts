/**
 * Negotiation brief builder (KIN-839).
 *
 * Pure functions that compose engine outputs + buyer strength into a typed,
 * deterministic brief payload. No IO, no randomness, no timestamps generated
 * inside the assembly — all non-deterministic values travel in via the inputs.
 *
 * The builder is versioned via `BUILDER_VERSION`. Any change that alters the
 * output shape or a computed value must bump this constant — it is recorded
 * in the brief's sourceVersions and is what lets staleness detection catch
 * silent changes to assembly logic.
 */

import type { PricingOutput } from "@/lib/ai/engines/types";

import type {
  BuyerStrengthInput,
  BuyerStrengthSection,
  BriefSourceVersions,
  CompsSection,
  LeverageSection,
  NegotiationBriefInputs,
  NegotiationBriefPayload,
  PricingSection,
  RecommendedOfferSection,
  StalenessResult,
} from "./types";

/**
 * Builder version. BUMP this whenever you change the shape or computation of
 * the brief — the bump flows into sourceVersions.builderVersion, which lets
 * the staleness detector catch silent logic drift.
 */
export const BUILDER_VERSION = "1.0.0";

const BRIEF_SECTION_COUNT = 5;

// ───────────────────────────────────────────────────────────────────────────
// Section builders — each one is a pure function that handles its own
// graceful degradation. Missing inputs produce a `missing` section with an
// empty data shape; partial inputs produce a `partial` section where possible.
// ───────────────────────────────────────────────────────────────────────────

export function buildPricingSection(
  pricing: NegotiationBriefInputs["pricing"],
): PricingSection {
  if (!pricing) {
    return {
      status: "missing",
      sources: [],
      summary: "Pricing panel output is not yet available for this property.",
    };
  }
  const out = pricing.output;
  const status: PricingSection["status"] =
    out.estimateSources.length >= 2 ? "complete" : "partial";
  return {
    status,
    fairValue: out.fairValue.value,
    likelyAccepted: out.likelyAccepted.value,
    strongOpener: out.strongOpener.value,
    walkAway: out.walkAway.value,
    consensusEstimate: out.consensusEstimate,
    overallConfidence: out.overallConfidence,
    sources: out.estimateSources,
    summary: buildPricingSummary(out),
  };
}

function buildPricingSummary(out: PricingOutput): string {
  return `Fair value $${formatPrice(out.fairValue.value)}; likely accepted near $${formatPrice(out.likelyAccepted.value)}.`;
}

export function buildCompsSection(
  comps: NegotiationBriefInputs["comps"],
): CompsSection {
  if (!comps) {
    return {
      status: "missing",
      selectedCompCount: 0,
      topComps: [],
      summary: "No comparable sales data is available yet.",
    };
  }
  const out = comps.output;
  const status: CompsSection["status"] =
    out.comps.length >= 3 ? "complete" : out.comps.length > 0 ? "partial" : "missing";

  const topComps = [...out.comps]
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 5)
    .map((c) => ({
      address: c.candidate.address,
      soldPrice: c.candidate.soldPrice,
      soldDate: c.candidate.soldDate,
      similarityScore: c.similarityScore,
    }));

  return {
    status,
    medianSoldPrice: out.aggregates.medianSoldPrice,
    medianPricePerSqft: out.aggregates.medianPricePerSqft,
    medianDom: out.aggregates.medianDom,
    medianSaleToListRatio: out.aggregates.medianSaleToListRatio,
    selectedCompCount: out.comps.length,
    selectionBasis: out.selectionBasis,
    topComps,
    summary: `${out.comps.length} comps selected by ${out.selectionBasis}; median $${formatPrice(out.aggregates.medianSoldPrice)} at ${out.aggregates.medianDom}d on market.`,
  };
}

export function buildLeverageSection(
  leverage: NegotiationBriefInputs["leverage"],
): LeverageSection {
  if (!leverage) {
    return {
      status: "missing",
      signalCount: 0,
      topSignals: [],
      summary: "Seller-pressure signals have not been computed yet.",
    };
  }
  const out = leverage.output;
  const status: LeverageSection["status"] =
    out.signals.length >= 3 ? "complete" : out.signals.length > 0 ? "partial" : "missing";

  // Sort by absolute delta — most material signals first
  const topSignals = [...out.signals]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5)
    .map((s) => ({
      name: s.name,
      delta: s.delta,
      direction: s.direction,
      explanation: `${s.name}: ${formatDelta(s.delta)} vs market reference`,
    }));

  return {
    status,
    score: out.score,
    overallConfidence: out.overallConfidence,
    signalCount: out.signals.length,
    topSignals,
    summary: `Leverage score ${out.score}/100 from ${out.signals.length} signals.`,
  };
}

/**
 * Deterministic buyer strength scoring (0-100).
 *
 * Contribution weights:
 *  - Financing type: cash=40, conventional=25, va=20, fha=15, other=10
 *  - Pre-approval: 15 if ≥ list price, 10 if within 90% of list
 *  - Target closing ≤ 21d: 15; ≤ 45d: 10; ≤ 60d: 5
 *  - Waived inspection: 10
 *  - Waived appraisal: 10
 *  - Waived financing: 10 (mutually exclusive with cash uplift below conventional)
 *
 * The function clamps to [0, 100] and never returns NaN.
 */
export function buildBuyerStrengthSection(
  input: BuyerStrengthInput | undefined,
  listPrice: number,
): BuyerStrengthSection {
  if (!input) {
    return {
      status: "missing",
      score: 0,
      contributions: [],
      summary: "Buyer strength facts have not been captured yet.",
    };
  }

  const contributions: BuyerStrengthSection["contributions"] = [];

  // ─── Financing type
  const financingPoints: Record<NonNullable<BuyerStrengthInput["financingType"]>, number> = {
    cash: 40,
    conventional: 25,
    va: 20,
    fha: 15,
    other: 10,
  };
  if (input.financingType) {
    const pts = financingPoints[input.financingType];
    contributions.push({
      factor: "financing_type",
      points: pts,
      explanation: `${input.financingType} financing`,
    });
  }

  // ─── Pre-approval coverage
  if (
    typeof input.preApprovalAmount === "number" &&
    input.preApprovalAmount > 0 &&
    listPrice > 0
  ) {
    const coverage = input.preApprovalAmount / listPrice;
    if (coverage >= 1.0) {
      contributions.push({
        factor: "pre_approval_full",
        points: 15,
        explanation: "Pre-approved at or above list price",
      });
    } else if (coverage >= 0.9) {
      contributions.push({
        factor: "pre_approval_partial",
        points: 10,
        explanation: "Pre-approved within 90% of list price",
      });
    }
  }

  // ─── Closing speed
  if (typeof input.targetCloseDays === "number") {
    if (input.targetCloseDays <= 21) {
      contributions.push({
        factor: "closing_speed_fast",
        points: 15,
        explanation: `Can close in ${input.targetCloseDays} days`,
      });
    } else if (input.targetCloseDays <= 45) {
      contributions.push({
        factor: "closing_speed_standard",
        points: 10,
        explanation: `Can close in ${input.targetCloseDays} days`,
      });
    } else if (input.targetCloseDays <= 60) {
      contributions.push({
        factor: "closing_speed_slow",
        points: 5,
        explanation: `Can close in ${input.targetCloseDays} days`,
      });
    }
  }

  // ─── Waived contingencies
  if (input.canWaiveInspection) {
    contributions.push({
      factor: "waive_inspection",
      points: 10,
      explanation: "Willing to waive inspection contingency",
    });
  }
  if (input.canWaiveAppraisal) {
    contributions.push({
      factor: "waive_appraisal",
      points: 10,
      explanation: "Willing to waive appraisal contingency",
    });
  }
  if (input.canWaiveFinancing) {
    contributions.push({
      factor: "waive_financing",
      points: 10,
      explanation: "Willing to waive financing contingency",
    });
  }

  const rawScore = contributions.reduce((sum, c) => sum + c.points, 0);
  const score = clamp(Math.round(rawScore), 0, 100);

  const status: BuyerStrengthSection["status"] =
    contributions.length >= 3 ? "complete" : contributions.length > 0 ? "partial" : "missing";

  return {
    status,
    score,
    contributions,
    summary: `Buyer strength ${score}/100 from ${contributions.length} factors.`,
  };
}

export function buildRecommendedOfferSection(
  offer: NegotiationBriefInputs["offer"],
): RecommendedOfferSection {
  if (!offer) {
    return {
      status: "missing",
      contingencies: [],
      summary: "Offer scenarios have not been generated yet.",
    };
  }
  const out = offer.output;
  if (out.scenarios.length === 0) {
    return {
      status: "partial",
      contingencies: [],
      summary: "Offer engine returned no scenarios.",
    };
  }
  // Coerce to a valid array index: truncate to integer first, then clamp.
  // Guards against NaN, fractional, or out-of-range `recommendedIndex` so
  // assembly never crashes on malformed (but type-valid) offer output.
  const rawIdx = Number.isFinite(out.recommendedIndex)
    ? Math.trunc(out.recommendedIndex)
    : 0;
  const idx = clamp(rawIdx, 0, out.scenarios.length - 1);
  const chosen = out.scenarios[idx];
  return {
    status: "complete",
    recommendedPrice: chosen.price,
    recommendedScenarioName: chosen.name,
    priceVsListPct: chosen.priceVsListPct,
    riskLevel: chosen.riskLevel,
    competitivenessScore: chosen.competitivenessScore,
    contingencies: [...chosen.contingencies],
    summary: `${chosen.name} at $${formatPrice(chosen.price)} (${chosen.riskLevel} risk).`,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Top-level assembly
// ───────────────────────────────────────────────────────────────────────────

/**
 * Assemble a negotiation brief from typed inputs.
 *
 * The function is pure: same inputs → byte-identical output. Callers pass a
 * `generatedAt` timestamp in the inputs so regeneration with a frozen clock
 * produces a stable result suitable for snapshot testing.
 */
export function assembleNegotiationBrief(
  inputs: NegotiationBriefInputs,
): NegotiationBriefPayload {
  const pricing = buildPricingSection(inputs.pricing);
  const comps = buildCompsSection(inputs.comps);
  const leverage = buildLeverageSection(inputs.leverage);
  const buyerStrength = buildBuyerStrengthSection(
    inputs.buyerStrength,
    inputs.subject.listPrice,
  );
  const recommendedOffer = buildRecommendedOfferSection(inputs.offer);

  const sections = [pricing, comps, leverage, buyerStrength, recommendedOffer];
  const presentSections = sections.filter((s) => s.status !== "missing").length;
  const coverage = Number((presentSections / BRIEF_SECTION_COUNT).toFixed(2));

  const sourceVersions: BriefSourceVersions = {
    pricingVersion: inputs.pricing?.version,
    compsVersion: inputs.comps?.version,
    leverageVersion: inputs.leverage?.version,
    offerVersion: inputs.offer?.version,
    builderVersion: BUILDER_VERSION,
  };

  const narrative = buildNarrative({
    subject: inputs.subject,
    pricing,
    leverage,
    buyerStrength,
    recommendedOffer,
  });

  return {
    subject: inputs.subject,
    pricing,
    comps,
    leverage,
    buyerStrength,
    recommendedOffer,
    sourceVersions,
    coverage,
    narrative,
    generatedAt: inputs.generatedAt,
  };
}

function buildNarrative(args: {
  subject: { address: string; listPrice: number };
  pricing: PricingSection;
  leverage: LeverageSection;
  buyerStrength: BuyerStrengthSection;
  recommendedOffer: RecommendedOfferSection;
}): string {
  const parts: string[] = [];
  parts.push(
    `${args.subject.address} listed at $${formatPrice(args.subject.listPrice)}.`,
  );

  if (
    args.pricing.status !== "missing" &&
    typeof args.pricing.fairValue === "number"
  ) {
    const delta = args.pricing.fairValue - args.subject.listPrice;
    const direction = delta >= 0 ? "above" : "below";
    parts.push(
      `Fair value runs $${formatPrice(Math.abs(delta))} ${direction} list.`,
    );
  }

  if (args.leverage.status !== "missing" && typeof args.leverage.score === "number") {
    parts.push(`Seller leverage reads ${args.leverage.score}/100.`);
  }

  if (args.buyerStrength.status !== "missing") {
    parts.push(`Buyer strength ${args.buyerStrength.score}/100.`);
  }

  if (
    args.recommendedOffer.status === "complete" &&
    typeof args.recommendedOffer.recommendedPrice === "number"
  ) {
    parts.push(
      `Recommended opener: $${formatPrice(args.recommendedOffer.recommendedPrice)} (${args.recommendedOffer.recommendedScenarioName}).`,
    );
  }

  return parts.join(" ");
}

// ───────────────────────────────────────────────────────────────────────────
// Staleness detection
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compare the versions stored on an existing brief against the versions
 * available in a fresh input set. Returns the set of reasons the brief is
 * stale. A brief is considered stale if ANY source version or the builder
 * version has changed.
 *
 * If a source was previously present and is now absent, that is NOT
 * considered staleness — callers should regenerate explicitly if they want
 * the brief to reflect the absence. This keeps staleness detection purely
 * additive and avoids spurious invalidations.
 */
export function detectStaleness(
  existing: BriefSourceVersions,
  fresh: BriefSourceVersions,
): StalenessResult {
  const reasons: StalenessResult["reasons"] = [];

  if (
    fresh.pricingVersion !== undefined &&
    existing.pricingVersion !== fresh.pricingVersion
  ) {
    reasons.push("pricing_updated");
  }
  if (
    fresh.compsVersion !== undefined &&
    existing.compsVersion !== fresh.compsVersion
  ) {
    reasons.push("comps_updated");
  }
  if (
    fresh.leverageVersion !== undefined &&
    existing.leverageVersion !== fresh.leverageVersion
  ) {
    reasons.push("leverage_updated");
  }
  if (
    fresh.offerVersion !== undefined &&
    existing.offerVersion !== fresh.offerVersion
  ) {
    reasons.push("offer_updated");
  }
  if (existing.builderVersion !== fresh.builderVersion) {
    reasons.push("builder_version_changed");
  }

  return { stale: reasons.length > 0, reasons };
}

// ───────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ───────────────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function formatDelta(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}
