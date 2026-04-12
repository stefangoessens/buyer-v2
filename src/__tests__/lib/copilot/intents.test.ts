import { describe, expect, it } from "vitest";
import {
  ALL_INTENTS,
  FALLBACK_THRESHOLD,
  HIGH_CONFIDENCE,
  classifyIntentRuleBased,
  isHighConfidence,
  needsLlmFallback,
} from "@/lib/copilot/intents";

describe("classifyIntentRuleBased", () => {
  it("classifies pricing questions", () => {
    expect(classifyIntentRuleBased("What's this house worth?").intent).toBe(
      "pricing",
    );
    expect(
      classifyIntentRuleBased("Is the fair value below the list price?").intent,
    ).toBe("pricing");
  });

  it("classifies comps questions", () => {
    expect(
      classifyIntentRuleBased("Show me the comps for this property").intent,
    ).toBe("comps");
    expect(
      classifyIntentRuleBased("What have similar homes sold for?").intent,
    ).toBe("comps");
  });

  it("classifies costs questions", () => {
    expect(
      classifyIntentRuleBased("How much will this cost me per month?").intent,
    ).toBe("costs");
    expect(
      classifyIntentRuleBased("What are the property taxes and HOA fees?").intent,
    ).toBe("costs");
  });

  it("classifies leverage questions", () => {
    expect(
      classifyIntentRuleBased("Why would the seller accept less?").intent,
    ).toBe("leverage");
    expect(
      classifyIntentRuleBased("How many days on market has this been?").intent,
    ).toBe("leverage");
  });

  it("classifies risk questions", () => {
    expect(
      classifyIntentRuleBased("What are the biggest risks here?").intent,
    ).toBe("risks");
    expect(
      classifyIntentRuleBased("Is this in a flood zone?").intent,
    ).toBe("risks");
  });

  it("classifies document questions", () => {
    expect(
      classifyIntentRuleBased("Can I see the seller disclosure?").intent,
    ).toBe("documents");
    expect(
      classifyIntentRuleBased("What do the HOA docs say?").intent,
    ).toBe("documents");
  });

  it("classifies offer questions", () => {
    expect(
      classifyIntentRuleBased("How much should I offer?").intent,
    ).toBe("offer");
    expect(
      classifyIntentRuleBased("Should I waive the appraisal contingency?")
        .intent,
    ).toBe("offer");
  });

  it("classifies scheduling questions", () => {
    expect(
      classifyIntentRuleBased("Can we tour this house on Saturday?").intent,
    ).toBe("scheduling");
    expect(
      classifyIntentRuleBased("Is there an open house scheduled?").intent,
    ).toBe("scheduling");
  });

  it("classifies agreement questions", () => {
    expect(
      classifyIntentRuleBased("Do I need to sign a buyer agreement?").intent,
    ).toBe("agreement");
    expect(
      classifyIntentRuleBased("What's a tour pass?").intent,
    ).toBe("agreement");
  });

  it("classifies off-topic questions as other with high confidence", () => {
    const result = classifyIntentRuleBased(
      "What's the weather in Miami today?",
    );
    expect(result.intent).toBe("other");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("classifies poem/story requests as other", () => {
    expect(
      classifyIntentRuleBased("Write me a poem about this house.").intent,
    ).toBe("other");
  });

  it("returns low-confidence other for unknown phrasings", () => {
    const result = classifyIntentRuleBased("Blah blah blah");
    expect(result.intent).toBe("other");
    expect(result.confidence).toBeLessThan(FALLBACK_THRESHOLD);
  });

  it("returns zero confidence for empty questions", () => {
    const result = classifyIntentRuleBased("");
    expect(result.intent).toBe("other");
    expect(result.confidence).toBe(0);
  });

  it("exports all 10 intents", () => {
    expect(ALL_INTENTS).toHaveLength(10);
  });
});

describe("isHighConfidence / needsLlmFallback", () => {
  it("high confidence rule match triggers HC", () => {
    const c = classifyIntentRuleBased("What's this house worth?");
    expect(isHighConfidence(c)).toBe(true);
    expect(needsLlmFallback(c)).toBe(false);
  });

  it("low confidence unknown triggers fallback", () => {
    const c = classifyIntentRuleBased("Hmm");
    expect(needsLlmFallback(c)).toBe(true);
    expect(isHighConfidence(c)).toBe(false);
  });

  it("HIGH_CONFIDENCE threshold is stricter than FALLBACK_THRESHOLD", () => {
    expect(HIGH_CONFIDENCE).toBeGreaterThan(FALLBACK_THRESHOLD);
  });
});
