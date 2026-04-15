import { describe, it, expect } from "vitest";
import {
  calibrateCost,
  COST_DISCLAIMER,
} from "@/lib/ai/engines/inspectionCostCalibration";
import type {
  BuyerSeverity,
  InspectionFinding,
  InspectionSystem,
} from "@/lib/ai/engines/inspectionParser";

function makeFinding(
  partial: Partial<InspectionFinding> & {
    system: InspectionSystem;
    title: string;
    buyerSeverity: BuyerSeverity;
  },
): Omit<
  InspectionFinding,
  | "estimatedCostLowUsd"
  | "estimatedCostHighUsd"
  | "costEstimateConfidence"
  | "costEstimateBasis"
  | "costTier"
> {
  return {
    findingKey: "test",
    system: partial.system,
    title: partial.title,
    buyerSeverity: partial.buyerSeverity,
    buyerFriendlyExplanation: "explain",
    recommendedAction: "act",
    pageReference: null,
    evidenceQuote: null,
    confidence: 0.85,
    llmSuggestedCost: partial.llmSuggestedCost,
  };
}

describe("calibrateCost", () => {
  it("returns dollar range when LLM is confident and finding maps to a known repair class", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "electrical",
        title: "Federal Pacific Electric panel installed",
        buyerSeverity: "life_safety",
      }),
      llmSuggestedCost: { low: 3500, high: 4500, confidence: 0.85 },
    });
    expect(result.estimatedCostLowUsd).toBeDefined();
    expect(result.estimatedCostHighUsd).toBeDefined();
    expect(result.costEstimateBasis).toBe("llm_plus_rule");
    expect(result.costEstimateConfidence).toBeDefined();
    expect(result.costEstimateConfidence!).toBeLessThanOrEqual(0.9);
    expect(result.costTier).toBeUndefined();
    expect(result.disclaimerText).toBe(COST_DISCLAIMER);
  });

  it("falls back to qualitative tier when LLM confidence is low for a known class", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "roof",
        title: "Roof replacement recommended",
        buyerSeverity: "major_repair",
      }),
      llmSuggestedCost: { low: 8000, high: 25000, confidence: 0.5 },
    });
    expect(result.estimatedCostLowUsd).toBeUndefined();
    expect(result.estimatedCostHighUsd).toBeUndefined();
    expect(result.costTier).toBe("significant");
    expect(result.disclaimerText).toBe(COST_DISCLAIMER);
  });

  it("returns LLM-only dollar range for unknown repair class with high LLM confidence", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "interior",
        title: "Discoloration on ceiling tile",
        buyerSeverity: "cosmetic",
      }),
      llmSuggestedCost: { low: 100, high: 400, confidence: 0.95 },
    });
    expect(result.estimatedCostLowUsd).toBe(100);
    expect(result.estimatedCostHighUsd).toBe(400);
    expect(result.costEstimateBasis).toBe("llm_only");
    expect(result.costTier).toBeUndefined();
    expect(result.disclaimerText).toBe(COST_DISCLAIMER);
  });

  it("returns qualitative tier for unknown repair class with no/low LLM confidence", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "interior",
        title: "Discoloration on ceiling tile",
        buyerSeverity: "cosmetic",
      }),
    });
    expect(result.costTier).toBeDefined();
    expect(result.estimatedCostLowUsd).toBeUndefined();
    expect(result.disclaimerText).toBe(COST_DISCLAIMER);
  });

  it("falls back to qualitative tier when no LLM hint is provided", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "appliances",
        title: "Dishwasher near end of life",
        buyerSeverity: "monitor",
      }),
    });
    expect(result.costTier).toBeDefined();
    expect(result.estimatedCostLowUsd).toBeUndefined();
    expect(result.estimatedCostHighUsd).toBeUndefined();
  });

  it("life_safety severity maps to significant tier in fallback", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "exterior",
        title: "Damaged stair railing on second floor",
        buyerSeverity: "life_safety",
      }),
    });
    expect(result.costTier).toBe("significant");
  });

  it("cosmetic severity maps to minor tier in fallback", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "interior",
        title: "Scuffed wall paint in hallway",
        buyerSeverity: "cosmetic",
      }),
    });
    expect(result.costTier).toBe("minor");
  });

  it("polybutylene plumbing maps to significant tier even without LLM hint", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "plumbing",
        title: "Polybutylene supply lines throughout home",
        buyerSeverity: "major_repair",
      }),
    });
    expect(result.costTier).toBe("significant");
  });

  it("HVAC replacement with high LLM confidence yields rule-assisted dollar range", () => {
    const result = calibrateCost({
      finding: makeFinding({
        system: "hvac",
        title: "HVAC replacement recommended within 12 months",
        buyerSeverity: "major_repair",
      }),
      llmSuggestedCost: { low: 7000, high: 12000, confidence: 0.8 },
    });
    expect(result.costEstimateBasis).toBe("llm_plus_rule");
    expect(result.estimatedCostLowUsd).toBeLessThanOrEqual(7000);
    expect(result.estimatedCostHighUsd).toBeGreaterThanOrEqual(12000);
  });

  it("disclaimer is always present regardless of path taken", () => {
    const inputs: Array<Parameters<typeof calibrateCost>[0]> = [
      { finding: makeFinding({ system: "roof", title: "minor", buyerSeverity: "cosmetic" }) },
      {
        finding: makeFinding({
          system: "electrical",
          title: "FPE panel",
          buyerSeverity: "life_safety",
        }),
        llmSuggestedCost: { low: 3000, high: 5000, confidence: 0.9 },
      },
      {
        finding: makeFinding({
          system: "appliances",
          title: "Old fridge",
          buyerSeverity: "monitor",
        }),
        llmSuggestedCost: { low: 800, high: 1500, confidence: 0.4 },
      },
    ];
    for (const input of inputs) {
      expect(calibrateCost(input).disclaimerText).toBe(COST_DISCLAIMER);
    }
  });
});
