import { describe, expect, it } from "vitest";
import {
  composeGroundedAnswer,
  composeLlmPrompt,
  composeOffTopicRefusal,
  composeStubResponse,
  hasEnoughContext,
  type EngineOutputRef,
} from "@/lib/copilot/response-composer";

const pricingRef: EngineOutputRef = {
  engine: "pricing",
  engineOutputId: "k17abc",
  modelId: "claude-sonnet-4",
  generatedAt: "2026-04-12T00:00:00Z",
  confidence: 0.9,
  snippet: '{"fairValue":485000}',
};

describe("composeStubResponse", () => {
  it("returns a human-friendly stub when engine output is missing", () => {
    const result = composeStubResponse({
      intent: "pricing",
      engine: "pricing",
      engineRef: null,
      questionPreview: "How much is this worth?",
    });
    expect(result.stubbed).toBe(true);
    expect(result.text).toContain("pricing analysis");
    expect(result.citations).toHaveLength(0);
  });

  it("stubs for planned engines too", () => {
    const result = composeStubResponse({
      intent: "documents",
      engine: "docs",
      engineRef: null,
      questionPreview: "",
    });
    expect(result.engine).toBe("docs");
    expect(result.text).toContain("document analysis");
  });
});

describe("composeOffTopicRefusal", () => {
  it("returns the guardrail message for short off-topic", () => {
    const result = composeOffTopicRefusal("weather?");
    expect(result.intent).toBe("other");
    expect(result.engine).toBe("guarded_general");
    expect(result.stubbed).toBe(true);
    expect(result.text).toContain("only help with questions about this property");
  });
});

describe("composeLlmPrompt", () => {
  it("returns a preview with citations from the engine output id", () => {
    const { requiresLlm, preview } = composeLlmPrompt({
      intent: "pricing",
      engine: "pricing",
      engineRef: pricingRef,
      questionPreview: "What's fair value?",
    });
    expect(requiresLlm).toBe(true);
    expect(preview.citations).toContain("k17abc");
  });
});

describe("composeGroundedAnswer", () => {
  it("trims and returns the LLM text with citations", () => {
    const response = composeGroundedAnswer(
      {
        intent: "pricing",
        engine: "pricing",
        engineRef: pricingRef,
        questionPreview: "What's fair value?",
      },
      "  Fair value is about $485,000 per the pricing engine.  ",
    );
    expect(response.text).toBe(
      "Fair value is about $485,000 per the pricing engine.",
    );
    expect(response.citations).toContain("k17abc");
    expect(response.stubbed).toBe(false);
    expect(response.requiresLlm).toBe(false);
  });

  it("handles empty LLM response with a safe fallback", () => {
    const response = composeGroundedAnswer(
      {
        intent: "pricing",
        engine: "pricing",
        engineRef: pricingRef,
        questionPreview: "What's fair value?",
      },
      "   ",
    );
    expect(response.text).toContain("empty response");
  });
});

describe("hasEnoughContext", () => {
  it("returns false when ref is null", () => {
    expect(hasEnoughContext(null)).toBe(false);
  });

  it("returns false when snippet is empty", () => {
    expect(
      hasEnoughContext({ engine: "pricing", snippet: "" }),
    ).toBe(false);
  });

  it("returns true when snippet has content", () => {
    expect(hasEnoughContext(pricingRef)).toBe(true);
  });
});
