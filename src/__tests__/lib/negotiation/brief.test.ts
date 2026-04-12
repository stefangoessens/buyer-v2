import { describe, it, expect } from "vitest";
import {
  assembleNegotiationBrief,
  buildBuyerStrengthSection,
  buildCompsSection,
  buildLeverageSection,
  buildPricingSection,
  buildRecommendedOfferSection,
  BUILDER_VERSION,
  detectStaleness,
} from "@/lib/negotiation/brief";
import type {
  NegotiationBriefInputs,
  BriefSourceVersions,
} from "@/lib/negotiation/types";
import type {
  PricingOutput,
  CompsOutput,
  LeverageOutput,
  OfferOutput,
} from "@/lib/ai/engines/types";

// ───────────────────────────────────────────────────────────────────────────
// Fixture helpers — keep tests declarative and reusable
// ───────────────────────────────────────────────────────────────────────────

function pricingFixture(): PricingOutput {
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
  };
}

function compsFixture(): CompsOutput {
  return {
    comps: [
      {
        candidate: {
          canonicalId: "c-1",
          address: "101 Palm Way",
          soldPrice: 615_000,
          soldDate: "2026-02-15",
          beds: 4,
          baths: 3,
          sqft: 2450,
          yearBuilt: 2018,
          propertyType: "single_family",
          zip: "33139",
          sourcePlatform: "zillow",
        },
        similarityScore: 0.94,
        explanation: "Same subdivision, same year built, +50 sqft",
        sourceCitation: "https://zillow.example/c-1",
      },
      {
        candidate: {
          canonicalId: "c-2",
          address: "205 Bayside Dr",
          soldPrice: 632_000,
          soldDate: "2026-01-28",
          beds: 4,
          baths: 3,
          sqft: 2500,
          yearBuilt: 2019,
          propertyType: "single_family",
          zip: "33139",
          sourcePlatform: "redfin",
        },
        similarityScore: 0.88,
        explanation: "Adjacent subdivision, newer build",
        sourceCitation: "https://redfin.example/c-2",
      },
      {
        candidate: {
          canonicalId: "c-3",
          address: "311 Lagoon Ct",
          soldPrice: 605_000,
          soldDate: "2026-03-02",
          beds: 4,
          baths: 2,
          sqft: 2380,
          yearBuilt: 2016,
          propertyType: "single_family",
          zip: "33139",
          sourcePlatform: "realtor",
        },
        similarityScore: 0.81,
        explanation: "Same school zone, similar size",
        sourceCitation: "https://realtor.example/c-3",
      },
    ],
    aggregates: {
      medianSoldPrice: 615_000,
      medianPricePerSqft: 250,
      medianDom: 28,
      medianSaleToListRatio: 0.97,
    },
    selectionBasis: "subdivision",
    selectionReason: "≥3 subdivision matches within 6 months",
    totalCandidates: 14,
    dedupedCandidates: 9,
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
        delta: 107.1,
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
        name: "motivated_seller_language",
        value: "bring all offers",
        marketReference: "none",
        delta: 1,
        confidence: 0.7,
        citation: "listing_description",
        direction: "bullish",
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
        explanation: "Opens below fair value to test seller urgency",
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
        explanation: "Matches likely-accepted price",
      },
      {
        name: "Competitive",
        price: 635_000,
        priceVsListPct: -1.0,
        earnestMoney: 20_000,
        closingDays: 21,
        contingencies: [],
        competitivenessScore: 92,
        riskLevel: "high",
        explanation: "Near-list with waived contingencies",
      },
    ],
    recommendedIndex: 1,
    inputSummary: "Standard scenario set",
    refreshable: true,
  };
}

function inputsFixture(
  overrides: Partial<NegotiationBriefInputs> = {},
): NegotiationBriefInputs {
  return {
    subject: {
      propertyId: "prop_1",
      address: "404 Ocean Dr, Miami Beach, FL 33139",
      listPrice: 640_000,
    },
    pricing: { version: "pricing-v1", output: pricingFixture() },
    comps: { version: "comps-v1", output: compsFixture() },
    leverage: { version: "leverage-v1", output: leverageFixture() },
    offer: { version: "offer-v1", output: offerFixture() },
    buyerStrength: {
      preApprovalAmount: 650_000,
      financingType: "conventional",
      targetCloseDays: 21,
      canWaiveInspection: false,
      canWaiveAppraisal: true,
      canWaiveFinancing: false,
    },
    generatedAt: "2026-04-12T12:00:00.000Z",
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Section builders
// ───────────────────────────────────────────────────────────────────────────

describe("buildPricingSection", () => {
  it("returns complete when ≥2 portal sources contribute", () => {
    const section = buildPricingSection({
      version: "v1",
      output: pricingFixture(),
    });
    expect(section.status).toBe("complete");
    expect(section.fairValue).toBe(625_000);
    expect(section.sources).toHaveLength(3);
    expect(section.summary).toContain("Fair value");
  });

  it("degrades to partial when only one source is available", () => {
    const out = pricingFixture();
    out.estimateSources = ["zillow"];
    const section = buildPricingSection({ version: "v1", output: out });
    expect(section.status).toBe("partial");
  });

  it("returns missing when input absent", () => {
    const section = buildPricingSection(undefined);
    expect(section.status).toBe("missing");
    expect(section.sources).toEqual([]);
  });
});

describe("buildCompsSection", () => {
  it("returns complete with ≥3 comps and includes top-5 sorted by similarity", () => {
    const section = buildCompsSection({ version: "v1", output: compsFixture() });
    expect(section.status).toBe("complete");
    expect(section.selectedCompCount).toBe(3);
    expect(section.topComps).toHaveLength(3);
    // Should be sorted descending by similarityScore
    expect(section.topComps[0].similarityScore).toBeGreaterThanOrEqual(
      section.topComps[1].similarityScore,
    );
  });

  it("returns partial when fewer than 3 comps", () => {
    const out = compsFixture();
    out.comps = out.comps.slice(0, 2);
    const section = buildCompsSection({ version: "v1", output: out });
    expect(section.status).toBe("partial");
  });

  it("returns missing when input absent", () => {
    const section = buildCompsSection(undefined);
    expect(section.status).toBe("missing");
    expect(section.topComps).toEqual([]);
  });
});

describe("buildLeverageSection", () => {
  it("sorts signals by absolute delta descending", () => {
    const section = buildLeverageSection({
      version: "v1",
      output: leverageFixture(),
    });
    expect(section.status).toBe("complete");
    expect(section.score).toBe(72);
    // dom_vs_median has delta 107.1 — should be first
    expect(section.topSignals[0].name).toBe("dom_vs_median");
  });

  it("returns partial for 1-2 signals", () => {
    const out = leverageFixture();
    out.signals = out.signals.slice(0, 2);
    out.signalCount = 2;
    const section = buildLeverageSection({ version: "v1", output: out });
    expect(section.status).toBe("partial");
  });

  it("returns missing when input absent", () => {
    const section = buildLeverageSection(undefined);
    expect(section.status).toBe("missing");
    expect(section.signalCount).toBe(0);
  });
});

describe("buildBuyerStrengthSection", () => {
  it("scores a strong buyer profile correctly", () => {
    const section = buildBuyerStrengthSection(
      {
        preApprovalAmount: 650_000,
        financingType: "conventional",
        targetCloseDays: 21,
        canWaiveInspection: true,
        canWaiveAppraisal: true,
      },
      640_000,
    );
    // conventional(25) + pre-approval full(15) + fast close(15) + waive insp(10) + waive appr(10) = 75
    expect(section.score).toBe(75);
    expect(section.status).toBe("complete");
    expect(section.contributions).toHaveLength(5);
  });

  it("scores cash buyers higher than conventional", () => {
    const cash = buildBuyerStrengthSection(
      { financingType: "cash" },
      640_000,
    );
    const conv = buildBuyerStrengthSection(
      { financingType: "conventional" },
      640_000,
    );
    expect(cash.score).toBeGreaterThan(conv.score);
  });

  it("clamps to [0, 100]", () => {
    const section = buildBuyerStrengthSection(
      {
        financingType: "cash",
        preApprovalAmount: 2_000_000,
        targetCloseDays: 7,
        canWaiveInspection: true,
        canWaiveAppraisal: true,
        canWaiveFinancing: true,
      },
      500_000,
    );
    // 40 + 15 + 15 + 10 + 10 + 10 = 100 exactly — clamp should accept this
    expect(section.score).toBeLessThanOrEqual(100);
    expect(section.score).toBeGreaterThan(0);
  });

  it("returns missing when input absent", () => {
    const section = buildBuyerStrengthSection(undefined, 500_000);
    expect(section.status).toBe("missing");
    expect(section.score).toBe(0);
  });

  it("credits pre-approval partial when within 90% of list", () => {
    const section = buildBuyerStrengthSection(
      { financingType: "conventional", preApprovalAmount: 580_000 },
      640_000, // 580k/640k = 0.906
    );
    expect(
      section.contributions.find((c) => c.factor === "pre_approval_partial"),
    ).toBeDefined();
  });
});

describe("buildRecommendedOfferSection", () => {
  it("picks the recommended scenario from the offer output", () => {
    const section = buildRecommendedOfferSection({
      version: "v1",
      output: offerFixture(),
    });
    expect(section.status).toBe("complete");
    expect(section.recommendedScenarioName).toBe("Balanced");
    expect(section.recommendedPrice).toBe(615_000);
  });

  it("clamps recommendedIndex to valid range", () => {
    const out = offerFixture();
    out.recommendedIndex = 99;
    const section = buildRecommendedOfferSection({ version: "v1", output: out });
    expect(section.recommendedScenarioName).toBe("Competitive");
  });

  it("returns missing when input absent", () => {
    const section = buildRecommendedOfferSection(undefined);
    expect(section.status).toBe("missing");
    expect(section.contingencies).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Top-level assembly
// ───────────────────────────────────────────────────────────────────────────

describe("assembleNegotiationBrief — create path", () => {
  it("produces a complete brief from full fixtures", () => {
    const brief = assembleNegotiationBrief(inputsFixture());
    expect(brief.pricing.status).toBe("complete");
    expect(brief.comps.status).toBe("complete");
    expect(brief.leverage.status).toBe("complete");
    expect(brief.buyerStrength.status).toBe("complete");
    expect(brief.recommendedOffer.status).toBe("complete");
    expect(brief.coverage).toBe(1);
    expect(brief.subject.address).toContain("Ocean Dr");
    expect(brief.sourceVersions.builderVersion).toBe(BUILDER_VERSION);
    expect(brief.narrative).toContain("Ocean Dr");
    expect(brief.narrative).toContain("Fair value");
  });

  it("gracefully handles empty inputs — coverage drops", () => {
    const brief = assembleNegotiationBrief({
      subject: {
        propertyId: "p1",
        address: "Bare property",
        listPrice: 500_000,
      },
      generatedAt: "2026-04-12T12:00:00.000Z",
    });
    expect(brief.coverage).toBe(0);
    expect(brief.pricing.status).toBe("missing");
    expect(brief.comps.status).toBe("missing");
    expect(brief.leverage.status).toBe("missing");
    expect(brief.buyerStrength.status).toBe("missing");
    expect(brief.recommendedOffer.status).toBe("missing");
    expect(brief.narrative).toContain("Bare property");
  });

  it("handles partial inputs — pricing only", () => {
    const brief = assembleNegotiationBrief({
      subject: {
        propertyId: "p1",
        address: "Pricing-only property",
        listPrice: 500_000,
      },
      pricing: { version: "v1", output: pricingFixture() },
      generatedAt: "2026-04-12T12:00:00.000Z",
    });
    expect(brief.pricing.status).toBe("complete");
    expect(brief.comps.status).toBe("missing");
    expect(brief.coverage).toBe(0.2); // 1 of 5 sections
  });

  it("records source versions for every supplied engine", () => {
    const brief = assembleNegotiationBrief(inputsFixture());
    expect(brief.sourceVersions.pricingVersion).toBe("pricing-v1");
    expect(brief.sourceVersions.compsVersion).toBe("comps-v1");
    expect(brief.sourceVersions.leverageVersion).toBe("leverage-v1");
    expect(brief.sourceVersions.offerVersion).toBe("offer-v1");
  });
});

describe("assembleNegotiationBrief — regenerate path", () => {
  it("is deterministic — same inputs produce byte-identical output", () => {
    const inputs = inputsFixture();
    const first = assembleNegotiationBrief(inputs);
    const second = assembleNegotiationBrief(inputs);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("regeneration with updated source version changes the brief", () => {
    const first = assembleNegotiationBrief(inputsFixture());
    const second = assembleNegotiationBrief(
      inputsFixture({
        pricing: { version: "pricing-v2", output: pricingFixture() },
      }),
    );
    expect(first.sourceVersions.pricingVersion).toBe("pricing-v1");
    expect(second.sourceVersions.pricingVersion).toBe("pricing-v2");
  });
});

describe("assembleNegotiationBrief — failed-export path", () => {
  // "Failed export" at this layer means the inputs were so degraded that
  // the builder produced an effectively useless artifact. The builder never
  // throws — it always returns a typed payload — so we assert the coverage
  // signals failure, not an exception.
  it("returns coverage 0 for fully-missing inputs without throwing", () => {
    expect(() =>
      assembleNegotiationBrief({
        subject: { propertyId: "p1", address: "x", listPrice: 0 },
        generatedAt: "2026-04-12T12:00:00.000Z",
      }),
    ).not.toThrow();
    const brief = assembleNegotiationBrief({
      subject: { propertyId: "p1", address: "x", listPrice: 0 },
      generatedAt: "2026-04-12T12:00:00.000Z",
    });
    expect(brief.coverage).toBe(0);
  });

  it("does not crash on NaN or infinite price inputs", () => {
    const inputs = inputsFixture({
      subject: {
        propertyId: "p1",
        address: "weird",
        listPrice: Number.NaN,
      },
    });
    expect(() => assembleNegotiationBrief(inputs)).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Staleness detection
// ───────────────────────────────────────────────────────────────────────────

describe("detectStaleness", () => {
  const baseVersions: BriefSourceVersions = {
    pricingVersion: "pricing-v1",
    compsVersion: "comps-v1",
    leverageVersion: "leverage-v1",
    offerVersion: "offer-v1",
    builderVersion: BUILDER_VERSION,
  };

  it("returns stale=false when versions match", () => {
    const result = detectStaleness(baseVersions, baseVersions);
    expect(result.stale).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("detects pricing update", () => {
    const result = detectStaleness(baseVersions, {
      ...baseVersions,
      pricingVersion: "pricing-v2",
    });
    expect(result.stale).toBe(true);
    expect(result.reasons).toContain("pricing_updated");
  });

  it("detects multiple simultaneous updates", () => {
    const result = detectStaleness(baseVersions, {
      ...baseVersions,
      pricingVersion: "pricing-v2",
      leverageVersion: "leverage-v2",
    });
    expect(result.stale).toBe(true);
    expect(result.reasons).toContain("pricing_updated");
    expect(result.reasons).toContain("leverage_updated");
    expect(result.reasons).toHaveLength(2);
  });

  it("detects builder version bump", () => {
    const result = detectStaleness(baseVersions, {
      ...baseVersions,
      builderVersion: "9.9.9",
    });
    expect(result.stale).toBe(true);
    expect(result.reasons).toContain("builder_version_changed");
  });

  it("does NOT flag staleness when fresh has undefined for a version", () => {
    // If fresh.pricingVersion is undefined (source became unavailable), we
    // do not flag — existing brief remains authoritative until the caller
    // explicitly regenerates.
    const result = detectStaleness(baseVersions, {
      ...baseVersions,
      pricingVersion: undefined,
    });
    expect(result.stale).toBe(false);
  });
});
