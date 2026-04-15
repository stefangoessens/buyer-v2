/**
 * List Price Review (KIN-1089)
 *
 * Pure deterministic assessment that compares the current list price
 * against four reference signals and produces an at/over/under-market
 * verdict. No Convex imports — testable in isolation.
 */

export type ListPriceAssessment =
  | "at_market"
  | "under_market"
  | "over_market"
  | "insufficient";

export type PriceTileKind =
  | "suggested_list_price"
  | "avm_estimate"
  | "comp_median"
  | "market_velocity_dom";

export interface PriceReferenceTile {
  kind: PriceTileKind;
  value: number | null;
  provenance: string;
  sourceCount?: number;
  isAvailable: boolean;
}

export type MarketVelocityDomSource =
  | "zip_90d"
  | "redfin_market_insights"
  | "comps_aggregate"
  | null;

export interface ListPriceReviewInput {
  listPrice: number | null;
  daysOnMarket: number | null;
  suggestedListPrice: number | null;
  avm: {
    zestimate: number | null;
    redfinEstimate: number | null;
    realtorEstimate: number | null;
  };
  compMedianSoldPrice: number | null;
  compCount: number;
  marketVelocityDom: number | null;
  marketVelocityDomSource: MarketVelocityDomSource;
}

export interface ListPriceReviewOutput {
  assessment: ListPriceAssessment;
  listPrice: number | null;
  weightedScore: number | null;
  referencesAvailable: number;
  signalsAgreed: number;
  totalSignals: number;
  explainer: string | null;
  tiles: {
    suggestedListPrice: PriceReferenceTile;
    avmEstimate: PriceReferenceTile;
    compMedian: PriceReferenceTile;
    marketVelocityDom: PriceReferenceTile;
  };
}

const FAIR_VALUE_WEIGHT = 0.45;
const AVM_WEIGHT = 0.3;
const COMP_WEIGHT = 0.2;
const DOM_WEIGHT = 0.05;

const ASSESSMENT_THRESHOLD = 0.05;
const AT_MARKET_AGREE_BAND = 0.02;

type DomVote = -1 | 0 | 1;

interface SignalContribution {
  kind: PriceTileKind;
  weighted: number;
  delta: number | null;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function computeAvmEstimate(avm: ListPriceReviewInput["avm"]): {
  value: number | null;
  sourceCount: number;
} {
  const values: number[] = [];
  if (isPositiveNumber(avm.zestimate)) values.push(avm.zestimate);
  if (isPositiveNumber(avm.redfinEstimate)) values.push(avm.redfinEstimate);
  if (isPositiveNumber(avm.realtorEstimate)) values.push(avm.realtorEstimate);
  if (values.length === 0) {
    return { value: null, sourceCount: 0 };
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { value: Math.round(mean), sourceCount: values.length };
}

function priceDelta(listPrice: number, reference: number): number {
  return (listPrice - reference) / reference;
}

function computeDomVote(
  daysOnMarket: number | null,
  marketVelocityDom: number | null,
): DomVote {
  if (
    daysOnMarket === null ||
    marketVelocityDom === null ||
    !Number.isFinite(daysOnMarket) ||
    !Number.isFinite(marketVelocityDom) ||
    marketVelocityDom <= 0
  ) {
    return 0;
  }
  if (
    daysOnMarket >= marketVelocityDom * 1.2 ||
    daysOnMarket >= marketVelocityDom + 7
  ) {
    return 1;
  }
  if (
    daysOnMarket <= marketVelocityDom * 0.8 ||
    daysOnMarket <= marketVelocityDom - 7
  ) {
    return -1;
  }
  return 0;
}

function provenanceForVelocity(source: MarketVelocityDomSource): string {
  switch (source) {
    case "zip_90d":
      return "ZIP median \u00b7 90d";
    case "redfin_market_insights":
      return "Redfin market insights";
    case "comps_aggregate":
      return "Selected comps";
    default:
      return "Not available yet";
  }
}

function provenanceForAvm(sourceCount: number): string {
  if (sourceCount === 0) return "Not available yet";
  return `Portal consensus (${sourceCount} source${sourceCount === 1 ? "" : "s"})`;
}

function provenanceForCompMedian(compCount: number): string {
  if (compCount === 0) return "Not available yet";
  return `Selected comps (${compCount})`;
}

function buildExplainer(
  assessment: ListPriceAssessment,
  contributions: SignalContribution[],
  domVote: DomVote,
  domAvailable: boolean,
): string | null {
  if (assessment === "insufficient") return null;

  const fairValue = contributions.find((c) => c.kind === "suggested_list_price");
  const fairValueDeltaPct =
    fairValue && fairValue.delta !== null
      ? Math.abs(fairValue.delta * 100)
      : null;

  if (assessment === "at_market") {
    return "List price aligns with our fair value, the portal consensus, and recent comps.";
  }

  const direction = assessment === "over_market" ? "above" : "below";
  const fairValuePart =
    fairValueDeltaPct !== null
      ? `Listed ${fairValueDeltaPct.toFixed(1)}% ${direction} our fair value`
      : `Listed ${direction} our fair value`;

  const domPart =
    domAvailable &&
    ((assessment === "over_market" && domVote === 1) ||
      (assessment === "under_market" && domVote === -1))
      ? assessment === "over_market"
        ? " and sitting longer than the ZIP median"
        : " and moving faster than the ZIP median"
      : "";

  return `${fairValuePart}${domPart}.`;
}

export function reviewListPrice(
  input: ListPriceReviewInput,
): ListPriceReviewOutput {
  const listPriceValid = isPositiveNumber(input.listPrice);
  const listPrice = listPriceValid ? (input.listPrice as number) : null;

  const avmComputed = computeAvmEstimate(input.avm);
  const compMedianValid = isPositiveNumber(input.compMedianSoldPrice);
  const fairValueValid = isPositiveNumber(input.suggestedListPrice);
  const velocityValid =
    isPositiveNumber(input.marketVelocityDom) &&
    input.marketVelocityDomSource !== null;

  const fairValueDelta =
    listPriceValid && fairValueValid
      ? priceDelta(listPrice as number, input.suggestedListPrice as number)
      : null;
  const avmDelta =
    listPriceValid && avmComputed.value !== null
      ? priceDelta(listPrice as number, avmComputed.value)
      : null;
  const compDelta =
    listPriceValid && compMedianValid
      ? priceDelta(listPrice as number, input.compMedianSoldPrice as number)
      : null;

  const fairValueContribution =
    fairValueDelta !== null
      ? clamp(fairValueDelta, -1, 1) * FAIR_VALUE_WEIGHT
      : 0;
  const avmContribution =
    avmDelta !== null ? clamp(avmDelta, -1, 1) * AVM_WEIGHT : 0;
  const compContribution =
    compDelta !== null ? clamp(compDelta, -1, 1) * COMP_WEIGHT : 0;

  const domVote = velocityValid
    ? computeDomVote(input.daysOnMarket, input.marketVelocityDom)
    : 0;
  const domContribution = domVote * DOM_WEIGHT;

  const referencesAvailable =
    (fairValueValid ? 1 : 0) +
    (avmComputed.value !== null ? 1 : 0) +
    (compMedianValid ? 1 : 0);

  const contributions: SignalContribution[] = [
    {
      kind: "suggested_list_price",
      weighted: fairValueContribution,
      delta: fairValueDelta,
    },
    { kind: "avm_estimate", weighted: avmContribution, delta: avmDelta },
    { kind: "comp_median", weighted: compContribution, delta: compDelta },
    {
      kind: "market_velocity_dom",
      weighted: domContribution,
      delta: domVote === 0 ? null : domVote,
    },
  ];

  let assessment: ListPriceAssessment;
  let weightedScore: number | null;

  if (referencesAvailable < 2 || !listPriceValid) {
    assessment = "insufficient";
    weightedScore = null;
  } else {
    const total =
      fairValueContribution +
      avmContribution +
      compContribution +
      domContribution;
    weightedScore = Number(total.toFixed(4));
    if (total >= ASSESSMENT_THRESHOLD) {
      assessment = "over_market";
    } else if (total <= -ASSESSMENT_THRESHOLD) {
      assessment = "under_market";
    } else {
      assessment = "at_market";
    }
  }

  let signalsAgreed = 0;
  if (assessment !== "insufficient") {
    for (const contribution of contributions) {
      if (assessment === "over_market" && contribution.weighted > 0) {
        signalsAgreed += 1;
      } else if (assessment === "under_market" && contribution.weighted < 0) {
        signalsAgreed += 1;
      } else if (
        assessment === "at_market" &&
        Math.abs(contribution.weighted) <= AT_MARKET_AGREE_BAND
      ) {
        signalsAgreed += 1;
      }
    }
  }

  const explainer = buildExplainer(
    assessment,
    contributions,
    domVote,
    velocityValid,
  );

  const tiles: ListPriceReviewOutput["tiles"] = {
    suggestedListPrice: {
      kind: "suggested_list_price",
      value: fairValueValid ? (input.suggestedListPrice as number) : null,
      provenance: fairValueValid ? "Pricing engine" : "Not available yet",
      isAvailable: fairValueValid,
    },
    avmEstimate: {
      kind: "avm_estimate",
      value: avmComputed.value,
      provenance: provenanceForAvm(avmComputed.sourceCount),
      sourceCount: avmComputed.sourceCount,
      isAvailable: avmComputed.value !== null,
    },
    compMedian: {
      kind: "comp_median",
      value: compMedianValid ? (input.compMedianSoldPrice as number) : null,
      provenance: provenanceForCompMedian(input.compCount),
      sourceCount: input.compCount,
      isAvailable: compMedianValid,
    },
    marketVelocityDom: {
      kind: "market_velocity_dom",
      value: velocityValid ? (input.marketVelocityDom as number) : null,
      provenance: provenanceForVelocity(
        velocityValid ? input.marketVelocityDomSource : null,
      ),
      isAvailable: velocityValid,
    },
  };

  return {
    assessment,
    listPrice,
    weightedScore,
    referencesAvailable,
    signalsAgreed,
    totalSignals: 4,
    explainer,
    tiles,
  };
}
