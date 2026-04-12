import type { LeverageInput, LeverageSignal, LeverageOutput } from "./types";

const MOTIVATED_PHRASES = [
  "must sell",
  "bring all offers",
  "priced to sell",
  "as-is",
  "estate sale",
  "relocating",
  "price improvement",
  "seller motivated",
  "make an offer",
  "won't last",
  "price reduced",
  "below market",
];

export function detectMotivatedLanguage(
  description?: string,
): LeverageSignal | null {
  if (!description) return null;
  const lower = description.toLowerCase();
  const found = MOTIVATED_PHRASES.filter((p) => lower.includes(p));
  if (found.length === 0) return null;
  return {
    name: "motivated_seller_language",
    value: found.join(", "),
    marketReference: "none expected",
    delta: found.length * 10,
    confidence: 0.7,
    citation: "Listing description analysis",
    direction: "bullish",
  };
}

export function detectDomPressure(
  dom: number,
  neighborhoodMedian?: number,
): LeverageSignal | null {
  if (!neighborhoodMedian || neighborhoodMedian === 0) return null;
  const delta = ((dom - neighborhoodMedian) / neighborhoodMedian) * 100;
  return {
    name: "days_on_market_pressure",
    value: dom,
    marketReference: neighborhoodMedian,
    delta: Number(delta.toFixed(1)),
    confidence: 0.85,
    citation: "DOM vs neighborhood median",
    direction: delta > 20 ? "bullish" : delta < -20 ? "bearish" : "neutral",
  };
}

export function detectPriceReductions(
  reductions?: Array<{ amount: number; date: string }>,
): LeverageSignal | null {
  if (!reductions || reductions.length === 0) return null;
  const totalReduction = reductions.reduce((sum, r) => sum + r.amount, 0);
  return {
    name: "price_reductions",
    value: reductions.length,
    marketReference: 0,
    delta: totalReduction,
    confidence: 0.9,
    citation: `${reductions.length} reduction(s), total $${totalReduction.toLocaleString()}`,
    direction: "bullish",
  };
}

export function detectPriceVsMarket(
  listPrice: number,
  sqft: number,
  neighborhoodMedianPsf?: number,
): LeverageSignal | null {
  if (!neighborhoodMedianPsf || neighborhoodMedianPsf === 0 || sqft === 0)
    return null;
  const listingPsf = listPrice / sqft;
  const delta =
    ((listingPsf - neighborhoodMedianPsf) / neighborhoodMedianPsf) * 100;
  return {
    name: "price_vs_market",
    value: Number(listingPsf.toFixed(0)),
    marketReference: neighborhoodMedianPsf,
    delta: Number(delta.toFixed(1)),
    confidence: 0.8,
    citation: "Listing $/sqft vs neighborhood median",
    direction: delta > 10 ? "bearish" : delta < -5 ? "bullish" : "neutral",
  };
}

export function detectListingTrajectory(
  input: LeverageInput,
): LeverageSignal | null {
  const flags: string[] = [];
  if (input.wasRelisted) flags.push("relisted");
  if (input.wasWithdrawn) flags.push("was withdrawn");
  if (input.wasPendingFellThrough) flags.push("pending fell through");
  if (flags.length === 0) return null;
  return {
    name: "listing_trajectory",
    value: flags.join(", "),
    marketReference: "clean listing history",
    delta: flags.length * 15,
    confidence: 0.75,
    citation: "Listing history analysis",
    direction: "bullish",
  };
}

export function computeLeverageScore(signals: LeverageSignal[]): number {
  if (signals.length === 0) return 50; // neutral baseline

  let score = 50; // start neutral
  for (const signal of signals) {
    const weight = signal.confidence;
    if (signal.direction === "bullish") {
      score += Math.min(signal.delta * weight * 0.1, 15);
    } else if (signal.direction === "bearish") {
      score -= Math.min(Math.abs(signal.delta) * weight * 0.1, 15);
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function analyzeLeverage(input: LeverageInput): LeverageOutput {
  const signals: LeverageSignal[] = [];

  const dom = detectDomPressure(input.daysOnMarket, input.neighborhoodMedianDom);
  if (dom) signals.push(dom);

  const reductions = detectPriceReductions(input.priceReductions);
  if (reductions) signals.push(reductions);

  const language = detectMotivatedLanguage(input.description);
  if (language) signals.push(language);

  const priceVsMarket = detectPriceVsMarket(
    input.listPrice,
    input.sqft,
    input.neighborhoodMedianPsf,
  );
  if (priceVsMarket) signals.push(priceVsMarket);

  const trajectory = detectListingTrajectory(input);
  if (trajectory) signals.push(trajectory);

  const score = computeLeverageScore(signals);
  const avgConfidence =
    signals.length > 0
      ? signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
      : 0.5;

  return {
    score,
    signals,
    overallConfidence: Number(avgConfidence.toFixed(2)),
    signalCount: signals.length,
  };
}
