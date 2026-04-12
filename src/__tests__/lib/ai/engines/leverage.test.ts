import { describe, it, expect } from "vitest";
import {
  detectMotivatedLanguage,
  detectDomPressure,
  detectPriceReductions,
  computeLeverageScore,
  analyzeLeverage,
} from "@/lib/ai/engines/leverage";

describe("detectMotivatedLanguage", () => {
  it("detects motivated seller phrases", () => {
    const result = detectMotivatedLanguage(
      "Must sell! Bring all offers. As-is condition.",
    );
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("bullish");
  });

  it("returns null for clean descriptions", () => {
    expect(
      detectMotivatedLanguage("Beautiful 3-bed home with pool."),
    ).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(detectMotivatedLanguage(undefined)).toBeNull();
  });
});

describe("detectDomPressure", () => {
  it("detects high DOM as bullish", () => {
    const result = detectDomPressure(90, 30);
    expect(result!.direction).toBe("bullish");
    expect(result!.delta).toBe(200);
  });

  it("detects low DOM as bearish", () => {
    const result = detectDomPressure(5, 30);
    expect(result!.direction).toBe("bearish");
  });
});

describe("detectPriceReductions", () => {
  it("detects reductions", () => {
    const result = detectPriceReductions([
      { amount: 10000, date: "2024-11-01" },
      { amount: 5000, date: "2024-12-01" },
    ]);
    expect(result!.direction).toBe("bullish");
    expect(result!.delta).toBe(15000);
  });

  it("returns null for no reductions", () => {
    expect(detectPriceReductions([])).toBeNull();
  });
});

describe("computeLeverageScore", () => {
  it("returns 50 for no signals", () => {
    expect(computeLeverageScore([])).toBe(50);
  });

  it("increases for bullish signals", () => {
    const score = computeLeverageScore([
      {
        name: "test",
        value: 1,
        marketReference: 0,
        delta: 50,
        confidence: 0.9,
        citation: "",
        direction: "bullish",
      },
    ]);
    expect(score).toBeGreaterThan(50);
  });
});

describe("analyzeLeverage", () => {
  it("produces complete output", () => {
    const result = analyzeLeverage({
      propertyId: "p1",
      listPrice: 500000,
      daysOnMarket: 90,
      sqft: 1800,
      description: "Must sell! Priced to sell.",
      neighborhoodMedianDom: 30,
      neighborhoodMedianPsf: 280,
      priceReductions: [{ amount: 20000, date: "2024-12-01" }],
    });
    expect(result.score).toBeGreaterThan(50);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.overallConfidence).toBeGreaterThan(0);
  });
});
