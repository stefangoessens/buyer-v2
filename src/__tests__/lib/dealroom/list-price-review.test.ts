import { describe, it, expect } from "vitest";
import {
  reviewListPrice,
  type ListPriceReviewInput,
} from "@/lib/dealroom/list-price-review";

const BASE_LIST = 500_000;
const BASE_FAIR = 500_000;

function makeInput(
  overrides: Partial<ListPriceReviewInput> = {},
): ListPriceReviewInput {
  return {
    listPrice: BASE_LIST,
    daysOnMarket: null,
    suggestedListPrice: BASE_FAIR,
    avm: {
      zestimate: BASE_FAIR,
      redfinEstimate: BASE_FAIR,
      realtorEstimate: BASE_FAIR,
    },
    compMedianSoldPrice: BASE_FAIR,
    compCount: 6,
    marketVelocityDom: null,
    marketVelocityDomSource: null,
    ...overrides,
  };
}

describe("reviewListPrice — clear over-market scenarios", () => {
  it("listing 10% above fair value, AVM, and comp median → over_market with 3 signals agreed", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 550_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
      }),
    );

    expect(result.assessment).toBe("over_market");
    expect(result.signalsAgreed).toBe(3);
    expect(result.referencesAvailable).toBe(3);
    expect(result.totalSignals).toBe(4);
  });

  it("listing 10% above fair value + 10% above AVM, comp missing → over_market with 2 references", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 550_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: null,
        compCount: 0,
      }),
    );

    expect(result.assessment).toBe("over_market");
    expect(result.referencesAvailable).toBe(2);
    expect(result.tiles.compMedian.isAvailable).toBe(false);
  });

  it("listing 10% above fair value only, AVM/comp missing → insufficient (only 1 ref)", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 550_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: null,
          redfinEstimate: null,
          realtorEstimate: null,
        },
        compMedianSoldPrice: null,
        compCount: 0,
      }),
    );

    expect(result.assessment).toBe("insufficient");
    expect(result.referencesAvailable).toBe(1);
    expect(result.weightedScore).toBeNull();
    expect(result.explainer).toBeNull();
  });
});

describe("reviewListPrice — clear under-market scenarios", () => {
  it("listing 10% below fair value, AVM, comp median → under_market", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 450_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 4,
      }),
    );

    expect(result.assessment).toBe("under_market");
    expect(result.signalsAgreed).toBeGreaterThanOrEqual(3);
  });

  it("listing 10% below fair value + DOM fast-moving (half of ZIP median) → under_market with DOM agreement", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 450_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 4,
        daysOnMarket: 15,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    expect(result.assessment).toBe("under_market");
    // DOM signal should be in agreement, so all 4 signals agree.
    expect(result.signalsAgreed).toBe(4);
  });

  it("listing 10% below fair value, DOM neutral → under_market", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 450_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 4,
      }),
    );

    expect(result.assessment).toBe("under_market");
  });
});

describe("reviewListPrice — at-market scenarios", () => {
  it("listing matches fair value exactly, AVM +1%, comp -1% → at_market", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 505_000,
          redfinEstimate: 505_000,
          realtorEstimate: 505_000,
        },
        compMedianSoldPrice: 495_000,
        compCount: 6,
      }),
    );

    expect(result.assessment).toBe("at_market");
    // Signals within the at-market agree band count as agreeing.
    expect(result.signalsAgreed).toBeGreaterThanOrEqual(2);
  });

  it("listing 2% above fair, 2% below AVM, exactly at comp median → at_market", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 510_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 520_408,
          redfinEstimate: 520_408,
          realtorEstimate: 520_408,
        },
        compMedianSoldPrice: 510_000,
        compCount: 5,
      }),
    );

    expect(result.assessment).toBe("at_market");
  });
});

describe("reviewListPrice — DOM vote logic", () => {
  it("daysOnMarket=45, marketVelocityDom=30 → DOM vote=over_market (>=20% slower)", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: 45,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    // DOM-only push (everything else neutral). With DOM weight 0.05 and a +1
    // vote, weighted = 0.05 which is exactly the threshold -> over_market.
    expect(result.weightedScore).toBeCloseTo(0.05, 4);
    expect(result.assessment).toBe("over_market");
  });

  it("daysOnMarket=20, marketVelocityDom=30 → DOM vote=under_market (>=20% faster)", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: 20,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    expect(result.weightedScore).toBeCloseTo(-0.05, 4);
    expect(result.assessment).toBe("under_market");
  });

  it("daysOnMarket=32, marketVelocityDom=30 → DOM vote=neutral (within tolerance)", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: 32,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    expect(result.weightedScore).toBeCloseTo(0, 4);
    expect(result.assessment).toBe("at_market");
  });

  it("daysOnMarket=38, marketVelocityDom=30 → DOM vote=over_market (>=7 days slower)", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: 38,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    // Even though only 26.7% slower, the absolute +7-day rule fires.
    expect(result.weightedScore).toBeCloseTo(0.05, 4);
    expect(result.assessment).toBe("over_market");
  });

  it("daysOnMarket=null → DOM contribution is 0 (missing-data path)", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: null,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    expect(result.weightedScore).toBeCloseTo(0, 4);
    expect(result.tiles.marketVelocityDom.value).toBe(30);
  });

  it("marketVelocityDom=null → DOM contribution is 0 and tile not available", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: 25,
        marketVelocityDom: null,
        marketVelocityDomSource: null,
      }),
    );

    expect(result.weightedScore).toBeCloseTo(0, 4);
    expect(result.tiles.marketVelocityDom.isAvailable).toBe(false);
  });
});

describe("reviewListPrice — insufficient data", () => {
  it("all 3 dollar refs missing, DOM present → insufficient (DOM alone doesn't count)", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: null,
        avm: {
          zestimate: null,
          redfinEstimate: null,
          realtorEstimate: null,
        },
        compMedianSoldPrice: null,
        compCount: 0,
        daysOnMarket: 25,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    expect(result.assessment).toBe("insufficient");
    expect(result.referencesAvailable).toBe(0);
    expect(result.weightedScore).toBeNull();
  });

  it("only fair value present (no AVM, no comp) → insufficient", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: null,
          redfinEstimate: null,
          realtorEstimate: null,
        },
        compMedianSoldPrice: null,
        compCount: 0,
      }),
    );

    expect(result.assessment).toBe("insufficient");
    expect(result.referencesAvailable).toBe(1);
  });

  it("2 dollar refs present → NOT insufficient, returns a real assessment", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: null,
          realtorEstimate: null,
        },
        compMedianSoldPrice: null,
        compCount: 0,
      }),
    );

    expect(result.assessment).not.toBe("insufficient");
    expect(["at_market", "under_market", "over_market"]).toContain(
      result.assessment,
    );
    expect(result.referencesAvailable).toBe(2);
  });

  it("listPrice=null → insufficient with null explainer", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: null,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 4,
      }),
    );

    expect(result.assessment).toBe("insufficient");
    expect(result.explainer).toBeNull();
    expect(result.listPrice).toBeNull();
    expect(result.weightedScore).toBeNull();
  });
});

describe("reviewListPrice — tile population", () => {
  it("AVM with 3 portal sources → tiles.avmEstimate.sourceCount=3 and provenance mentions 3 sources", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 510_000,
          redfinEstimate: 500_000,
          realtorEstimate: 490_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
      }),
    );

    expect(result.tiles.avmEstimate.sourceCount).toBe(3);
    expect(result.tiles.avmEstimate.provenance).toContain("3 sources");
    expect(result.tiles.avmEstimate.value).toBe(500_000);
  });

  it("AVM with 1 portal source (only zestimate) → value equals that one value, sourceCount=1", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 512_345,
          redfinEstimate: null,
          realtorEstimate: null,
        },
        compMedianSoldPrice: 500_000,
        compCount: 4,
      }),
    );

    expect(result.tiles.avmEstimate.sourceCount).toBe(1);
    expect(result.tiles.avmEstimate.value).toBe(512_345);
    expect(result.tiles.avmEstimate.provenance).toContain("1 source");
    // Singular wording, not plural.
    expect(result.tiles.avmEstimate.provenance).not.toContain("1 sources");
  });

  it("comp median with compCount=0 → tile not available with 'Not available yet' provenance", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: null,
        compCount: 0,
      }),
    );

    expect(result.tiles.compMedian.isAvailable).toBe(false);
    expect(result.tiles.compMedian.provenance).toBe("Not available yet");
  });

  it("market velocity source 'zip_90d' → provenance mentions ZIP", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: 30,
        marketVelocityDom: 30,
        marketVelocityDomSource: "zip_90d",
      }),
    );

    expect(result.tiles.marketVelocityDom.isAvailable).toBe(true);
    expect(result.tiles.marketVelocityDom.provenance).toContain("ZIP");
  });

  it("market velocity source 'comps_aggregate' → provenance mentions comps", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
        daysOnMarket: 30,
        marketVelocityDom: 30,
        marketVelocityDomSource: "comps_aggregate",
      }),
    );

    expect(result.tiles.marketVelocityDom.provenance.toLowerCase()).toContain(
      "comps",
    );
  });
});

describe("reviewListPrice — weighted score math", () => {
  it("fair value delta +0.10, AVM delta +0.05, comp delta 0 → weighted score 0.060 → over_market", () => {
    // Choose listPrice=550000, fairValue=500000 -> delta = +0.10
    // Pick AVM such that delta = +0.05 -> AVM = 550000 / 1.05 ~= 523809.52
    // Comp delta = 0 -> compMedian = 550000.
    const result = reviewListPrice(
      makeInput({
        listPrice: 550_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 550_000 / 1.05,
          redfinEstimate: 550_000 / 1.05,
          realtorEstimate: 550_000 / 1.05,
        },
        compMedianSoldPrice: 550_000,
        compCount: 5,
      }),
    );

    // 0.10 * 0.45 + 0.05 * 0.30 + 0 * 0.20 = 0.045 + 0.015 = 0.060
    expect(result.weightedScore).toBeCloseTo(0.06, 3);
    expect(result.assessment).toBe("over_market");
  });

  it("fair value delta -0.10, AVM delta -0.05, comp delta 0 → weighted score -0.060 → under_market", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 450_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 450_000 / 0.95,
          redfinEstimate: 450_000 / 0.95,
          realtorEstimate: 450_000 / 0.95,
        },
        compMedianSoldPrice: 450_000,
        compCount: 5,
      }),
    );

    expect(result.weightedScore).toBeCloseTo(-0.06, 3);
    expect(result.assessment).toBe("under_market");
  });
});

describe("reviewListPrice — explainer text", () => {
  it("over-market assessment produces explainer mentioning 'above' and 'fair value'", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 550_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 4,
      }),
    );

    expect(result.assessment).toBe("over_market");
    expect(result.explainer).not.toBeNull();
    expect((result.explainer ?? "").toLowerCase()).toContain("above");
    expect((result.explainer ?? "").toLowerCase()).toContain("fair value");
  });

  it("under-market assessment produces explainer mentioning 'below' and 'fair value'", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 450_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 4,
      }),
    );

    expect(result.assessment).toBe("under_market");
    expect(result.explainer).not.toBeNull();
    expect((result.explainer ?? "").toLowerCase()).toContain("below");
    expect((result.explainer ?? "").toLowerCase()).toContain("fair value");
  });

  it("at-market assessment produces explainer mentioning alignment", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: 500_000,
        avm: {
          zestimate: 500_000,
          redfinEstimate: 500_000,
          realtorEstimate: 500_000,
        },
        compMedianSoldPrice: 500_000,
        compCount: 5,
      }),
    );

    expect(result.assessment).toBe("at_market");
    expect(result.explainer).not.toBeNull();
    expect((result.explainer ?? "").toLowerCase()).toContain("aligns");
  });

  it("insufficient produces explainer === null", () => {
    const result = reviewListPrice(
      makeInput({
        listPrice: 500_000,
        suggestedListPrice: null,
        avm: {
          zestimate: null,
          redfinEstimate: null,
          realtorEstimate: null,
        },
        compMedianSoldPrice: null,
        compCount: 0,
      }),
    );

    expect(result.assessment).toBe("insufficient");
    expect(result.explainer).toBeNull();
  });
});
