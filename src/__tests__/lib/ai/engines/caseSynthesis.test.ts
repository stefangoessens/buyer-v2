import { describe, it, expect } from "vitest";
import {
  synthesizeCase,
  SYNTHESIS_VERSION,
  MIN_CONFIDENCE,
  CLAIM_TOPICS,
  type CaseSynthesisInput,
} from "@/lib/ai/engines/caseSynthesis";
import type {
  PricingOutput,
  CompsOutput,
  LeverageOutput,
  OfferOutput,
} from "@/lib/ai/engines/types";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

function pricingFixture(overrides: Partial<PricingOutput> = {}): PricingOutput {
  return {
    fairValue: {
      value: 625_000,
      deltaVsListPrice: -2.5,
      deltaVsConsensus: 0.5,
      confidence: 0.82,
    },
    likelyAccepted: {
      value: 615_000,
      deltaVsListPrice: -4.0,
      deltaVsConsensus: -1.1,
      confidence: 0.78,
    },
    strongOpener: {
      value: 598_000,
      deltaVsListPrice: -6.7,
      deltaVsConsensus: -3.8,
      confidence: 0.75,
    },
    walkAway: {
      value: 660_000,
      deltaVsListPrice: 3.1,
      deltaVsConsensus: 6.2,
      confidence: 0.8,
    },
    consensusEstimate: 621_000,
    estimateSpread: 0.045,
    estimateSources: ["zillow", "redfin", "realtor"],
    overallConfidence: 0.85,
    ...overrides,
  };
}

function compsFixture(count = 5): CompsOutput {
  return {
    comps: Array.from({ length: count }, (_, i) => ({
      candidate: {
        canonicalId: `c-${i}`,
        address: `${100 + i} Palm Way`,
        soldPrice: 620_000 + i * 5000,
        soldDate: "2026-02-01",
        beds: 4,
        baths: 3,
        sqft: 2450,
        yearBuilt: 2018,
        propertyType: "single_family",
        zip: "33139",
        sourcePlatform: "zillow",
      },
      similarityScore: 0.9 - i * 0.02,
      explanation: "matched subdivision",
      sourceCitation: `https://zillow.example/c-${i}`,
    })),
    aggregates: {
      medianSoldPrice: 630_000,
      medianPricePerSqft: 250,
      medianDom: 28,
      medianSaleToListRatio: 0.97,
    },
    selectionBasis: "subdivision",
    selectionReason: "subdivision match",
    totalCandidates: 12,
    dedupedCandidates: 8,
  };
}

function leverageFixture(): LeverageOutput {
  return {
    score: 72,
    signals: [
      {
        name: "dom_vs_median",
        value: 58,
        marketReference: 28,
        delta: 30,
        confidence: 0.9,
        citation: "mls_2026_q1",
        direction: "bullish",
      },
      {
        name: "price_reductions",
        value: 2,
        marketReference: 0,
        delta: 2,
        confidence: 0.95,
        citation: "listing_history",
        direction: "bullish",
      },
      {
        name: "psf_vs_median",
        value: 270,
        marketReference: 250,
        delta: 20,
        confidence: 0.85,
        citation: "comps_aggregate",
        direction: "bearish",
      },
    ],
    overallConfidence: 0.85,
    signalCount: 3,
  };
}

function offerFixture(): OfferOutput {
  return {
    scenarios: [
      {
        name: "Aggressive",
        price: 598_000,
        priceVsListPct: -6.7,
        earnestMoney: 10_000,
        closingDays: 21,
        contingencies: ["inspection"],
        competitivenessScore: 62,
        riskLevel: "medium",
        explanation: "below fair",
      },
      {
        name: "Balanced",
        price: 615_000,
        priceVsListPct: -4.0,
        earnestMoney: 15_000,
        closingDays: 30,
        contingencies: ["inspection", "financing"],
        competitivenessScore: 78,
        riskLevel: "low",
        explanation: "matches likely",
      },
    ],
    recommendedIndex: 1,
    inputSummary: "",
    refreshable: true,
  };
}

function fullInput(listPrice = 640_000): CaseSynthesisInput {
  return {
    listPrice,
    pricing: { output: pricingFixture(), citationId: "engineOut_pricing_1" },
    comps: { output: compsFixture(), citationId: "engineOut_comps_1" },
    leverage: { output: leverageFixture(), citationId: "engineOut_leverage_1" },
    offer: { output: offerFixture(), citationId: "engineOut_offer_1" },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Full synthesis
// ───────────────────────────────────────────────────────────────────────────

describe("synthesizeCase — full engine inputs", () => {
  const result = synthesizeCase(fullInput(), { subjectSqft: 2450 });

  it("produces claims from all three upstream engines", () => {
    const topics = new Set(result.claims.map((c) => c.topic));
    expect(topics.has("pricing")).toBe(true);
    expect(topics.has("comps")).toBe(true);
    // Leverage signals distribute across leverage + days_on_market topics
    expect(
      topics.has("leverage") || topics.has("days_on_market"),
    ).toBe(true);
  });

  it("every claim has a market reference (no bare absolutes)", () => {
    for (const claim of result.claims) {
      expect(claim.marketReferenceLabel).toBeTruthy();
      expect(typeof claim.marketReference).toBe("number");
    }
  });

  it("every claim has a signed delta and deltaPct", () => {
    for (const claim of result.claims) {
      expect(Number.isFinite(claim.delta)).toBe(true);
      expect(Number.isFinite(claim.deltaPct)).toBe(true);
    }
  });

  it("every claim has a citation linking to the engine output", () => {
    for (const claim of result.claims) {
      expect(claim.citation).toMatch(/^engineOut_/);
    }
  });

  it("every claim has confidence in [0, 1]", () => {
    for (const claim of result.claims) {
      expect(claim.confidence).toBeGreaterThanOrEqual(0);
      expect(claim.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("produces a recommended action from the offer engine", () => {
    expect(result.recommendedAction).toBeDefined();
    expect(result.recommendedAction?.openingPrice).toBe(615_000);
    expect(result.recommendedAction?.riskLevel).toBe("low");
  });

  it("rationale references existing claim IDs", () => {
    const claimIds = new Set(result.claims.map((c) => c.id));
    for (const id of result.recommendedAction?.rationaleClaimIds ?? []) {
      expect(claimIds.has(id)).toBe(true);
    }
  });

  it("reports contributing engines count", () => {
    expect(result.contributingEngines).toBe(4);
  });

  it("records the synthesis version", () => {
    expect(result.synthesisVersion).toBe(SYNTHESIS_VERSION);
  });

  it("produces a deterministic input hash", () => {
    const first = synthesizeCase(fullInput(), { subjectSqft: 2450 });
    const second = synthesizeCase(fullInput(), { subjectSqft: 2450 });
    expect(first.inputHash).toBe(second.inputHash);
  });

  it("different inputs produce different hashes", () => {
    const a = synthesizeCase(fullInput(640_000), { subjectSqft: 2450 });
    const b = synthesizeCase(fullInput(650_000), { subjectSqft: 2450 });
    expect(a.inputHash).not.toBe(b.inputHash);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Low confidence → drop engine, don't fabricate
// ───────────────────────────────────────────────────────────────────────────

describe("synthesizeCase — low confidence drops claims", () => {
  it("drops pricing when overallConfidence < MIN_CONFIDENCE", () => {
    const input = fullInput();
    input.pricing!.output = pricingFixture({ overallConfidence: 0.3 });
    const result = synthesizeCase(input, { subjectSqft: 2450 });
    expect(result.droppedEngines).toContain("pricing");
    expect(result.claims.filter((c) => c.topic === "pricing")).toHaveLength(0);
  });

  it("drops leverage when overallConfidence < MIN_CONFIDENCE", () => {
    const input = fullInput();
    input.leverage!.output = {
      ...leverageFixture(),
      overallConfidence: 0.3,
    };
    const result = synthesizeCase(input);
    expect(result.droppedEngines).toContain("leverage");
  });

  it("drops comps when fewer than 3 comps", () => {
    const input = fullInput();
    input.comps!.output = compsFixture(2);
    const result = synthesizeCase(input, { subjectSqft: 2450 });
    expect(result.droppedEngines).toContain("comps");
    expect(result.claims.filter((c) => c.topic === "comps")).toHaveLength(0);
  });

  it("still produces a case with partial inputs", () => {
    const input = fullInput();
    input.pricing = undefined;
    const result = synthesizeCase(input, { subjectSqft: 2450 });
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.contributingEngines).toBe(3);
  });

  it("produces empty claims with no inputs but doesn't crash", () => {
    const result = synthesizeCase({ listPrice: 500_000 });
    expect(result.claims).toEqual([]);
    expect(result.contributingEngines).toBe(0);
    expect(result.overallConfidence).toBe(0);
    expect(result.droppedEngines).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Absolute-number guard — the core rule
// ───────────────────────────────────────────────────────────────────────────

describe("synthesizeCase — never emits bare absolutes", () => {
  const result = synthesizeCase(fullInput(), { subjectSqft: 2450 });

  it("every claim has a non-empty marketReferenceLabel", () => {
    for (const claim of result.claims) {
      expect(claim.marketReferenceLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it("marketReference is always a finite number", () => {
    for (const claim of result.claims) {
      expect(Number.isFinite(claim.marketReference)).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Caching helpers
// ───────────────────────────────────────────────────────────────────────────

describe("synthesizeCase — input hash for caching", () => {
  it("hash is 8 hex chars", () => {
    const result = synthesizeCase(fullInput(), { subjectSqft: 2450 });
    expect(result.inputHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("hash includes subjectSqft in key derivation", () => {
    const a = synthesizeCase(fullInput(), { subjectSqft: 2450 });
    const b = synthesizeCase(fullInput(), { subjectSqft: 2500 });
    expect(a.inputHash).not.toBe(b.inputHash);
  });

  it("hash stable when only citation IDs change? No — ids are part of inputs", () => {
    // Citation IDs ARE part of the inputs — different ids legitimately mean
    // different underlying engine runs, so they should produce different
    // hashes. This test documents the design choice.
    const a = synthesizeCase(fullInput());
    const inputB = fullInput();
    inputB.pricing!.citationId = "engineOut_pricing_OTHER";
    const b = synthesizeCase(inputB);
    expect(a.inputHash).not.toBe(b.inputHash);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Non-numeric leverage signals and engine counting
// ───────────────────────────────────────────────────────────────────────────

describe("synthesizeCase — non-numeric leverage signals dropped", () => {
  it("drops leverage signals with string value/marketReference", () => {
    const input = fullInput();
    // Include a string-valued signal — should be dropped, not coerced to 0
    input.leverage!.output = {
      score: 72,
      signals: [
        {
          name: "motivated_seller_language",
          value: "bring all offers",
          marketReference: "standard listing",
          delta: 1,
          confidence: 0.85,
          citation: "listing_description",
          direction: "bullish",
        },
        {
          name: "dom_vs_median",
          value: 58,
          marketReference: 28,
          delta: 30,
          confidence: 0.9,
          citation: "mls",
          direction: "bullish",
        },
      ],
      overallConfidence: 0.85,
      signalCount: 2,
    };
    const result = synthesizeCase(input);
    const leverageClaims = result.claims.filter(
      (c) => c.topic === "leverage" || c.topic === "days_on_market",
    );
    // Only the dom_vs_median numeric signal should produce a claim
    expect(leverageClaims).toHaveLength(1);
    expect(leverageClaims[0].id).toBe("leverage_dom_vs_median");
    // No claim should have been generated for the string-valued signal
    expect(
      result.claims.find((c) => c.id === "leverage_motivated_seller_language"),
    ).toBeUndefined();
  });

  it("direction follows numeric delta sign, not bullish/bearish label", () => {
    const input = fullInput();
    input.leverage!.output = {
      score: 72,
      signals: [
        {
          name: "dom_vs_median",
          value: 58,
          marketReference: 28,
          delta: 30, // positive delta = above
          confidence: 0.9,
          citation: "mls",
          direction: "bullish", // bullish sentiment BUT numerically above
        },
      ],
      overallConfidence: 0.85,
      signalCount: 1,
    };
    const result = synthesizeCase(input);
    const domClaim = result.claims.find(
      (c) => c.id === "leverage_dom_vs_median",
    );
    expect(domClaim?.direction).toBe("above");
  });
});

describe("synthesizeCase — engine counting from output, not input presence", () => {
  it("counts only engines that produced claims/recommendation", () => {
    const input = fullInput();
    // Replace offer with empty scenarios — recommendation will be undefined
    input.offer!.output = {
      scenarios: [],
      recommendedIndex: 0,
      inputSummary: "",
      refreshable: true,
    };
    const result = synthesizeCase(input, { subjectSqft: 2450 });
    // pricing + comps + leverage contributed; offer did NOT (empty scenarios)
    expect(result.contributingEngines).toBe(3);
  });

  it("counts zero when no engines produce output", () => {
    const result = synthesizeCase({ listPrice: 500_000 });
    expect(result.contributingEngines).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("CLAIM_TOPICS + constants", () => {
  it("exposes the 5 canonical topics", () => {
    expect(CLAIM_TOPICS).toContain("pricing");
    expect(CLAIM_TOPICS).toContain("comps");
    expect(CLAIM_TOPICS).toContain("days_on_market");
    expect(CLAIM_TOPICS).toContain("leverage");
    expect(CLAIM_TOPICS).toContain("offer_recommendation");
  });

  it("MIN_CONFIDENCE is sane", () => {
    expect(MIN_CONFIDENCE).toBeGreaterThan(0);
    expect(MIN_CONFIDENCE).toBeLessThan(1);
  });
});
