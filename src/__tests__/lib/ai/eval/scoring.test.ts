/**
 * Unit tests for per-engine scoring functions (KIN-856).
 *
 * Each scorer is a pure function that compares actual to expected engine
 * output and returns a 0-1 score plus a details breakdown. These tests
 * verify the scoring math across perfect matches, large errors, and edge
 * cases (empty, zeros, missing fields).
 */
import { describe, it, expect } from "vitest";
import {
  scorePricing,
  scoreComps,
  scoreLeverage,
  scoreOffer,
  scoreCost,
  scoreDocs,
  scoreCaseSynthesis,
} from "@/lib/ai/eval/scoring";
import type {
  PricingOutput,
  CompsOutput,
  LeverageOutput,
  OfferOutput,
  CostOutput,
  CompCandidate,
} from "@/lib/ai/engines/types";

// ─── pricing fixtures ────────────────────────────────────────────────────

function makePricing(
  fair: number,
  likely: number,
  opener: number,
  walk: number,
): PricingOutput {
  return {
    fairValue: { value: fair, deltaVsListPrice: 0, deltaVsConsensus: 0, confidence: 0.85 },
    likelyAccepted: {
      value: likely,
      deltaVsListPrice: 0,
      deltaVsConsensus: 0,
      confidence: 0.8,
    },
    strongOpener: {
      value: opener,
      deltaVsListPrice: 0,
      deltaVsConsensus: 0,
      confidence: 0.75,
    },
    walkAway: { value: walk, deltaVsListPrice: 0, deltaVsConsensus: 0, confidence: 0.7 },
    consensusEstimate: 640000,
    estimateSpread: 0.01,
    estimateSources: ["zestimate"],
    overallConfidence: 0.82,
  };
}

// ─── comps helpers ───────────────────────────────────────────────────────

function makeCandidate(id: string): CompCandidate {
  return {
    canonicalId: id,
    address: `${id} Test St`,
    soldPrice: 600000,
    soldDate: "2026-01-15",
    beds: 2,
    baths: 2,
    sqft: 1200,
    yearBuilt: 2018,
    propertyType: "condo",
    zip: "33131",
    sourcePlatform: "mls",
  };
}

function makeComps(
  ids: string[],
  medianSoldPrice: number,
): CompsOutput {
  return {
    comps: ids.map((id) => ({
      candidate: makeCandidate(id),
      similarityScore: 0.9,
      explanation: "",
      sourceCitation: "",
    })),
    aggregates: {
      medianSoldPrice,
      medianPricePerSqft: 500,
      medianDom: 30,
      medianSaleToListRatio: 0.98,
    },
    selectionBasis: "zip",
    selectionReason: "",
    totalCandidates: ids.length,
    dedupedCandidates: ids.length,
  };
}

// ─── leverage helper ─────────────────────────────────────────────────────

function makeLeverage(score: number): LeverageOutput {
  return { score, signals: [], overallConfidence: 0.8, signalCount: 0 };
}

// ─── offer helper ────────────────────────────────────────────────────────

function makeOffer(prices: number[], recommendedIndex: number): OfferOutput {
  return {
    scenarios: prices.map((p, i) => ({
      name: `scenario-${i}`,
      price: p,
      priceVsListPct: 0,
      earnestMoney: 10000,
      closingDays: 30,
      contingencies: [],
      competitivenessScore: 75,
      riskLevel: "medium",
      explanation: "",
    })),
    recommendedIndex,
    inputSummary: "",
    refreshable: true,
  };
}

// ─── cost helper ─────────────────────────────────────────────────────────

function makeCost(totalMonthlyMid: number, totalAnnual: number): CostOutput {
  return {
    lineItems: [],
    totalMonthlyLow: totalMonthlyMid * 0.9,
    totalMonthlyMid,
    totalMonthlyHigh: totalMonthlyMid * 1.1,
    totalAnnual,
    upfrontCosts: { downPayment: 0, closingCosts: 0, total: 0 },
    assumptions: {
      interestRate: 0.065,
      downPaymentPct: 0.2,
      propertyTaxRate: 0.0185,
      maintenancePct: 0.01,
      pmiRate: 0.005,
      closingCostPct: 0.03,
    },
    disclaimers: [],
  };
}

// ─── pricing scorer tests ────────────────────────────────────────────────

describe("scorePricing", () => {
  it("returns 1.0 for an exact match", () => {
    const expected = makePricing(645000, 625000, 595000, 670000);
    const actual = makePricing(645000, 625000, 595000, 670000);
    const result = scorePricing(actual, expected);
    expect(result.score).toBe(1);
    expect(result.details.avgError).toBe(0);
  });

  it("returns a lower score for ~5% error", () => {
    const expected = makePricing(1000000, 950000, 900000, 1050000);
    const actual = makePricing(1050000, 997500, 945000, 1102500); // +5% on every point
    const result = scorePricing(actual, expected);
    // avg err = 0.05, score = 1 - 0.25 = 0.75
    expect(result.score).toBeCloseTo(0.75, 2);
  });

  it("clamps to zero for >= 20% average error", () => {
    const expected = makePricing(1000000, 1000000, 1000000, 1000000);
    const actual = makePricing(1500000, 1500000, 1500000, 1500000); // +50%
    const result = scorePricing(actual, expected);
    expect(result.score).toBe(0);
  });

  it("exposes per-field errors in details", () => {
    const expected = makePricing(1000000, 1000000, 1000000, 1000000);
    const actual = makePricing(1100000, 1000000, 1000000, 1000000); // 10% on fair only
    const result = scorePricing(actual, expected);
    expect(result.details.fairValueError).toBeCloseTo(0.1, 3);
    expect(result.details.likelyAcceptedError).toBe(0);
    expect(result.details.strongOpenerError).toBe(0);
    expect(result.details.walkAwayError).toBe(0);
  });

  it("handles zero expected gracefully (no divide-by-zero)", () => {
    const expected = makePricing(0, 0, 0, 0);
    const actual = makePricing(0, 0, 0, 0);
    const result = scorePricing(actual, expected);
    expect(result.score).toBe(1); // 0-0 is counted as 0% error
  });
});

// ─── comps scorer tests ──────────────────────────────────────────────────

describe("scoreComps", () => {
  it("returns 1.0 when comps and aggregates match exactly", () => {
    const expected = makeComps(["a", "b", "c"], 600000);
    const actual = makeComps(["a", "b", "c"], 600000);
    const result = scoreComps(actual, expected);
    expect(result.score).toBe(1);
    expect(result.details.jaccard).toBe(1);
  });

  it("returns 0 when no comps intersect and median is far off", () => {
    const expected = makeComps(["a", "b", "c"], 600000);
    const actual = makeComps(["x", "y", "z"], 1200000); // jaccard 0 + 100% err
    const result = scoreComps(actual, expected);
    expect(result.details.jaccard).toBe(0);
    expect(result.score).toBe(0);
  });

  it("computes partial jaccard correctly for half overlap", () => {
    // actual = {a,b,c,d}, expected = {c,d,e,f} → union 6, intersection 2 → 1/3
    const expected = makeComps(["c", "d", "e", "f"], 600000);
    const actual = makeComps(["a", "b", "c", "d"], 600000);
    const result = scoreComps(actual, expected);
    expect(result.details.jaccard).toBeCloseTo(1 / 3, 2);
    // aggScore = 1 (perfect median), so final = (1/3 + 1) / 2 = 2/3
    expect(result.score).toBeCloseTo(2 / 3, 2);
  });

  it("handles empty comps arrays (jaccard = 0)", () => {
    const expected = makeComps([], 600000);
    const actual = makeComps([], 600000);
    const result = scoreComps(actual, expected);
    expect(result.details.jaccard).toBe(0);
    // agg is perfect (0 err), so score = (0 + 1)/2 = 0.5
    expect(result.score).toBe(0.5);
  });

  it("exposes matchedComps and totalExpected in details", () => {
    const expected = makeComps(["a", "b", "c"], 600000);
    const actual = makeComps(["a", "d"], 600000);
    const result = scoreComps(actual, expected);
    expect(result.details.matchedComps).toBe(1);
    expect(result.details.totalExpected).toBe(3);
  });
});

// ─── leverage scorer tests ───────────────────────────────────────────────

describe("scoreLeverage", () => {
  it("returns 1.0 for an exact score match", () => {
    const result = scoreLeverage(makeLeverage(75), makeLeverage(75));
    expect(result.score).toBe(1);
    expect(result.details.scoreDelta).toBe(0);
  });

  it("returns 0 when delta is 50 or more", () => {
    const result = scoreLeverage(makeLeverage(10), makeLeverage(90));
    expect(result.score).toBe(0);
    expect(result.details.scoreDelta).toBe(80);
  });

  it("scales linearly with delta", () => {
    const result = scoreLeverage(makeLeverage(50), makeLeverage(75));
    // delta 25 out of 50 → 0.5
    expect(result.score).toBe(0.5);
  });

  it("records actual and expected scores in details", () => {
    const result = scoreLeverage(makeLeverage(40), makeLeverage(60));
    expect(result.details.actualScore).toBe(40);
    expect(result.details.expectedScore).toBe(60);
  });
});

// ─── offer scorer tests ──────────────────────────────────────────────────

describe("scoreOffer", () => {
  it("returns 1.0 for a perfect match with matching recommended index", () => {
    const expected = makeOffer([600000, 620000, 640000], 1);
    const actual = makeOffer([600000, 620000, 640000], 1);
    const result = scoreOffer(actual, expected);
    expect(result.score).toBe(1);
  });

  it("penalizes when recommended index differs", () => {
    const expected = makeOffer([600000, 620000, 640000], 1);
    const actual = makeOffer([600000, 620000, 640000], 2);
    const result = scoreOffer(actual, expected);
    // priceScore 1 + recommendedMatch 0 → 0.5
    expect(result.score).toBe(0.5);
    expect(result.details.recommendedIndexMatch).toBe(0);
  });

  it("records a non-fatal error on scenario count mismatch", () => {
    const expected = makeOffer([600000, 620000, 640000], 1);
    const actual = makeOffer([600000, 620000], 1);
    const result = scoreOffer(actual, expected);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("scores 0 price error + matching recommended as 1.0", () => {
    const expected = makeOffer([1000000, 1100000], 0);
    const actual = makeOffer([1000000, 1100000], 0);
    const result = scoreOffer(actual, expected);
    expect(result.details.avgPriceError).toBe(0);
    expect(result.score).toBe(1);
  });
});

// ─── cost scorer tests ───────────────────────────────────────────────────

describe("scoreCost", () => {
  it("returns 1.0 for exact match on monthly and annual", () => {
    const result = scoreCost(makeCost(4500, 54000), makeCost(4500, 54000));
    expect(result.score).toBe(1);
  });

  it("returns 0 for 20%+ average error", () => {
    const result = scoreCost(makeCost(9000, 108000), makeCost(4500, 54000));
    // 100% err on both → avg 100% → score 0
    expect(result.score).toBe(0);
  });

  it("records monthlyMid and annual errors in details", () => {
    const result = scoreCost(makeCost(4725, 54000), makeCost(4500, 54000));
    // 5% err on monthly, 0% on annual → avg 2.5% → score 0.875
    expect(result.details.monthlyMidError).toBeCloseTo(0.05, 3);
    expect(result.details.annualError).toBe(0);
    expect(result.score).toBeCloseTo(0.875, 3);
  });

  it("handles zero expected totals without divide-by-zero", () => {
    const result = scoreCost(makeCost(0, 0), makeCost(0, 0));
    expect(result.score).toBe(1);
  });
});

// ─── docs scorer tests ───────────────────────────────────────────────────

describe("scoreDocs", () => {
  it("returns 1.0 for identical records", () => {
    const expected = { a: 1, b: "hello", c: true };
    const actual = { a: 1, b: "hello", c: true };
    const result = scoreDocs(actual, expected);
    expect(result.score).toBe(1);
    expect(result.details.matchedKeys).toBe(3);
  });

  it("returns 0.5 when half of keys match", () => {
    const expected = { a: 1, b: 2, c: 3, d: 4 };
    const actual = { a: 1, b: 2, c: 99, d: 99 };
    const result = scoreDocs(actual, expected);
    expect(result.score).toBe(0.5);
  });

  it("records missing keys as non-fatal errors", () => {
    const expected = { a: 1, b: 2, c: 3 };
    const actual = { a: 1 };
    const result = scoreDocs(actual, expected);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBe(2); // b and c are missing
  });

  it("handles deep equality via JSON stringify", () => {
    const expected = { nested: { foo: "bar" }, arr: [1, 2, 3] };
    const actual = { nested: { foo: "bar" }, arr: [1, 2, 3] };
    const result = scoreDocs(actual, expected);
    expect(result.score).toBe(1);
  });

  it("handles empty expected as 1.0", () => {
    const result = scoreDocs({}, {});
    expect(result.score).toBe(1);
    expect(result.details.totalKeys).toBe(0);
  });
});

// ─── case synthesis scorer tests ─────────────────────────────────────────

describe("scoreCaseSynthesis", () => {
  it("returns 1.0 for identical narrative and key points", () => {
    const expected = {
      narrative: "Buyer offered 3% below list. Seller accepted after 2 days.",
      keyPoints: ["3% below list", "2 days"],
    };
    const result = scoreCaseSynthesis(expected, expected);
    expect(result.score).toBe(1);
  });

  it("penalizes when narrative is half the expected length", () => {
    const expected = {
      narrative: "a".repeat(100),
      keyPoints: [],
    };
    const actual = {
      narrative: "a".repeat(50),
      keyPoints: [],
    };
    const result = scoreCaseSynthesis(actual, expected);
    // lenRatio 0.5, keyPointScore 1 → 0.75
    expect(result.details.lengthRatio).toBe(0.5);
    expect(result.score).toBe(0.75);
  });

  it("matches key points case-insensitively", () => {
    const expected = {
      narrative: "The buyer won with a strong opener.",
      keyPoints: ["BUYER", "strong opener"],
    };
    const actual = {
      narrative: "The buyer won with a strong opener.",
      keyPoints: [],
    };
    const result = scoreCaseSynthesis(actual, expected);
    expect(result.details.matchedKeyPoints).toBe(2);
    expect(result.details.keyPointScore).toBe(1);
  });

  it("scores missing key points as 0", () => {
    const expected = {
      narrative: "Short narrative.",
      keyPoints: ["nowhere", "also missing"],
    };
    const actual = {
      narrative: "Short narrative.",
      keyPoints: [],
    };
    const result = scoreCaseSynthesis(actual, expected);
    expect(result.details.matchedKeyPoints).toBe(0);
    expect(result.details.keyPointScore).toBe(0);
  });

  it("handles empty expected narrative and no key points", () => {
    const result = scoreCaseSynthesis(
      { narrative: "", keyPoints: [] },
      { narrative: "", keyPoints: [] },
    );
    expect(result.details.lengthRatio).toBe(1);
    expect(result.details.keyPointScore).toBe(1);
    expect(result.score).toBe(1);
  });

  it("exposes counts in details", () => {
    const expected = {
      narrative: "Three key points here.",
      keyPoints: ["alpha", "beta", "gamma"],
    };
    const actual = {
      narrative: "Mentions alpha and beta only.",
      keyPoints: [],
    };
    const result = scoreCaseSynthesis(actual, expected);
    expect(result.details.totalKeyPoints).toBe(3);
    expect(result.details.matchedKeyPoints).toBe(2);
  });
});
