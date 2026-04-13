import { describe, it, expect } from "vitest";
import { generateOfferScenarios } from "@/lib/ai/engines/offer";

describe("generateOfferScenarios", () => {
  const baseInput = { listPrice: 500000 };

  it("returns 3 scenarios", () => {
    const result = generateOfferScenarios(baseInput);
    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios[0].name).toBe("Aggressive");
    expect(result.scenarios[1].name).toBe("Balanced");
    expect(result.scenarios[2].name).toBe("Competitive");
  });

  it("aggressive is cheapest, competitive is most expensive", () => {
    const result = generateOfferScenarios(baseInput);
    expect(result.scenarios[0].price).toBeLessThanOrEqual(
      result.scenarios[1].price,
    );
    expect(result.scenarios[1].price).toBeLessThanOrEqual(
      result.scenarios[2].price,
    );
  });

  it("competitive has highest competitiveness score", () => {
    const result = generateOfferScenarios(baseInput);
    expect(result.scenarios[2].competitivenessScore).toBeGreaterThan(
      result.scenarios[0].competitivenessScore,
    );
  });

  it("recommends competitive when competing offers exist", () => {
    const result = generateOfferScenarios({
      ...baseInput,
      competingOffers: 2,
    });
    expect(result.recommendedIndex).toBe(2);
  });

  it("recommends balanced by default", () => {
    const result = generateOfferScenarios(baseInput);
    expect(result.recommendedIndex).toBe(1);
  });

  it("caps prices to buyer budget", () => {
    const result = generateOfferScenarios({
      ...baseInput,
      buyerMaxBudget: 450000,
    });
    for (const s of result.scenarios) {
      expect(s.price).toBeLessThanOrEqual(450000);
    }
  });

  it("adjusts for high leverage", () => {
    const lowLeverage = generateOfferScenarios({
      ...baseInput,
      leverageScore: 20,
    });
    const highLeverage = generateOfferScenarios({
      ...baseInput,
      leverageScore: 80,
    });
    expect(highLeverage.scenarios[0].price).toBeLessThan(
      lowLeverage.scenarios[0].price,
    );
  });

  it("is refreshable", () => {
    const result = generateOfferScenarios(baseInput);
    expect(result.refreshable).toBe(true);
  });
});
