/**
 * Per-engine scoring functions for the eval harness.
 *
 * Each scorer is a pure function that compares an actual engine output
 * to an expected output (drawn from a golden fixture) and returns a
 * 0-1 score plus a detail breakdown. No I/O, no side effects.
 *
 * Scoring strategies by engine:
 *   - pricing  : MAPE across the 4 price points (fair/likely/opener/walk)
 *   - comps    : Jaccard of selected comps + aggregate accuracy
 *   - leverage : absolute score delta
 *   - offer    : scenario price MAPE + recommended-scenario match
 *   - cost     : MAPE on monthly + annual totals
 *   - docs     : structural field-by-field match
 *   - case     : narrative length ratio + key-point keyword presence
 */

import type {
  CompsOutput,
  CostOutput,
  LeverageOutput,
  OfferOutput,
  PricingOutput,
} from "../engines/types";
import type { ScoringFunction } from "./types";

// ─── helpers ─────────────────────────────────────────────────────────────

/** Absolute percentage error between actual (a) and expected (e). */
function pctError(a: number, e: number): number {
  if (e === 0) return a === 0 ? 0 : 1;
  return Math.abs(a - e) / Math.abs(e);
}

/**
 * Linear MAPE-to-score mapping: 0% error → 1.0, 20%+ error → 0.0.
 * Anything in between scales linearly (slope = 5).
 */
function mapeToScore(avgErr: number): number {
  return Math.max(0, 1 - avgErr * 5);
}

// ─── pricing ─────────────────────────────────────────────────────────────

/**
 * Score a pricing engine output against expected values.
 *
 * Uses MAPE (mean absolute percentage error) across fair value, likely
 * accepted, strong opener, and walk-away. Returns 1.0 for 0% error and
 * 0.0 for >= 20% average error.
 */
export const scorePricing: ScoringFunction<PricingOutput> = (actual, expected) => {
  const errors: string[] = [];
  const details: Record<string, number | string> = {};

  const fairValueErr = pctError(actual.fairValue.value, expected.fairValue.value);
  const likelyErr = pctError(actual.likelyAccepted.value, expected.likelyAccepted.value);
  const openerErr = pctError(actual.strongOpener.value, expected.strongOpener.value);
  const walkAwayErr = pctError(actual.walkAway.value, expected.walkAway.value);

  details.fairValueError = fairValueErr;
  details.likelyAcceptedError = likelyErr;
  details.strongOpenerError = openerErr;
  details.walkAwayError = walkAwayErr;

  const avgErr = (fairValueErr + likelyErr + openerErr + walkAwayErr) / 4;
  details.avgError = avgErr;

  const score = mapeToScore(avgErr);

  return { score, details, errors: errors.length > 0 ? errors : undefined };
};

// ─── comps ───────────────────────────────────────────────────────────────

/**
 * Score comps output by checking: (a) how many of the expected comps are
 * in the actual selection (Jaccard over canonical IDs), and (b) aggregate
 * accuracy on median sold price. Final score is the mean of those two
 * sub-scores.
 */
export const scoreComps: ScoringFunction<CompsOutput> = (actual, expected) => {
  const details: Record<string, number | string> = {};

  const actualIds = new Set(actual.comps.map((c) => c.candidate.canonicalId));
  const expectedIds = new Set(expected.comps.map((c) => c.candidate.canonicalId));
  const intersection = new Set([...actualIds].filter((id) => expectedIds.has(id)));
  const union = new Set([...actualIds, ...expectedIds]);
  const jaccard = union.size === 0 ? 0 : intersection.size / union.size;

  details.jaccard = jaccard;
  details.matchedComps = intersection.size;
  details.totalExpected = expectedIds.size;

  const medianErr =
    expected.aggregates.medianSoldPrice === 0
      ? 0
      : Math.abs(
          actual.aggregates.medianSoldPrice - expected.aggregates.medianSoldPrice,
        ) / expected.aggregates.medianSoldPrice;
  details.medianPriceError = medianErr;

  const aggScore = mapeToScore(medianErr);
  const score = (jaccard + aggScore) / 2;

  return { score, details };
};

// ─── leverage ────────────────────────────────────────────────────────────

/**
 * Score leverage output using absolute score delta on the 0-100 scale.
 * 0 delta → 1.0, 50+ delta → 0.0.
 */
export const scoreLeverage: ScoringFunction<LeverageOutput> = (actual, expected) => {
  const details: Record<string, number | string> = {};
  const scoreDelta = Math.abs(actual.score - expected.score);
  details.scoreDelta = scoreDelta;
  details.actualScore = actual.score;
  details.expectedScore = expected.score;

  const score = Math.max(0, 1 - scoreDelta / 50);
  return { score, details };
};

// ─── offer ───────────────────────────────────────────────────────────────

/**
 * Score offer output with two sub-scores averaged together:
 *   1. Scenario price MAPE across paired scenarios (by index)
 *   2. Binary match on recommendedIndex
 *
 * Scenario-count mismatch is flagged as a non-fatal error but scoring
 * continues over the intersecting prefix.
 */
export const scoreOffer: ScoringFunction<OfferOutput> = (actual, expected) => {
  const details: Record<string, number | string> = {};
  const errors: string[] = [];

  if (actual.scenarios.length !== expected.scenarios.length) {
    errors.push(
      `Scenario count mismatch: actual=${actual.scenarios.length}, expected=${expected.scenarios.length}`,
    );
  }

  const len = Math.min(actual.scenarios.length, expected.scenarios.length);
  let totalPriceErr = 0;
  for (let i = 0; i < len; i++) {
    const a = actual.scenarios[i];
    const e = expected.scenarios[i];
    if (e.price > 0) {
      totalPriceErr += Math.abs(a.price - e.price) / e.price;
    }
  }
  const avgPriceErr = len > 0 ? totalPriceErr / len : 1;
  details.avgPriceError = avgPriceErr;

  const priceScore = mapeToScore(avgPriceErr);
  const recommendedMatch = actual.recommendedIndex === expected.recommendedIndex ? 1 : 0;
  details.recommendedIndexMatch = recommendedMatch;

  const score = (priceScore + recommendedMatch) / 2;
  return { score, details, errors: errors.length > 0 ? errors : undefined };
};

// ─── cost ────────────────────────────────────────────────────────────────

/**
 * Score cost output using MAPE on monthly mid and annual total.
 */
export const scoreCost: ScoringFunction<CostOutput> = (actual, expected) => {
  const details: Record<string, number | string> = {};

  const midErr = pctError(actual.totalMonthlyMid, expected.totalMonthlyMid);
  const annualErr = pctError(actual.totalAnnual, expected.totalAnnual);
  details.monthlyMidError = midErr;
  details.annualError = annualErr;

  const avgErr = (midErr + annualErr) / 2;
  const score = mapeToScore(avgErr);
  return { score, details };
};

// ─── docs ────────────────────────────────────────────────────────────────

/**
 * Generic docs parser scorer: compares two records key-by-key.
 * Expected to work on parser outputs that are plain object maps. Any
 * missing key on actual is recorded as a non-fatal error.
 */
export const scoreDocs: ScoringFunction<Record<string, unknown>> = (actual, expected) => {
  const details: Record<string, number | string> = {};
  const errors: string[] = [];

  const expectedKeys = Object.keys(expected);
  let matchedKeys = 0;
  for (const key of expectedKeys) {
    if (actual[key] === undefined) {
      errors.push(`Missing key: ${key}`);
    } else if (JSON.stringify(actual[key]) === JSON.stringify(expected[key])) {
      matchedKeys++;
    }
  }

  details.matchedKeys = matchedKeys;
  details.totalKeys = expectedKeys.length;
  const score = expectedKeys.length === 0 ? 1 : matchedKeys / expectedKeys.length;
  return { score, details, errors: errors.length > 0 ? errors : undefined };
};

// ─── case synthesis ──────────────────────────────────────────────────────

/**
 * Narrative quality scorer: basic keyword presence + length sanity.
 *
 * Real narrative scoring is a separate concern (e.g., LLM-as-judge) —
 * this is the minimum viable check: the narrative should be roughly the
 * same length as expected, and it should mention the expected key points.
 */
export const scoreCaseSynthesis: ScoringFunction<{
  narrative: string;
  keyPoints: string[];
}> = (actual, expected) => {
  const details: Record<string, number | string> = {};
  const errors: string[] = [];

  // Length check: ratio of min/max. Symmetric, within [0, 1].
  const lenRatio =
    expected.narrative.length === 0
      ? 1
      : Math.min(actual.narrative.length, expected.narrative.length) /
        Math.max(actual.narrative.length, expected.narrative.length);
  details.lengthRatio = lenRatio;

  // Key point presence: case-insensitive substring match.
  const expectedKeyPoints = expected.keyPoints;
  let matchedKeyPoints = 0;
  for (const point of expectedKeyPoints) {
    if (actual.narrative.toLowerCase().includes(point.toLowerCase())) {
      matchedKeyPoints++;
    }
  }
  const keyPointScore =
    expectedKeyPoints.length === 0 ? 1 : matchedKeyPoints / expectedKeyPoints.length;
  details.keyPointScore = keyPointScore;
  details.matchedKeyPoints = matchedKeyPoints;
  details.totalKeyPoints = expectedKeyPoints.length;

  const score = (lenRatio + keyPointScore) / 2;
  return { score, details, errors: errors.length > 0 ? errors : undefined };
};
