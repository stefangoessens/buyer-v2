import { describe, expect, it } from "vitest";
import { orchestrate } from "@/lib/copilot/orchestrator";
import type { OrchestratorDeps } from "@/lib/copilot/orchestrator";
import type { EngineOutputRef } from "@/lib/copilot/response-composer";

const baseRef: EngineOutputRef = {
  engine: "pricing",
  engineOutputId: "k17abc",
  modelId: "claude-sonnet-4",
  generatedAt: "2026-04-12T00:00:00Z",
  confidence: 0.9,
  snippet: '{"fairValue":485000}',
};

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    llmClassify: async () => ({
      intent: "other",
      confidence: 0.4,
      method: "llm",
    }),
    loadEngineOutput: async () => baseRef,
    llmRespond: async () => "Fair value is about $485,000 per the pricing engine.",
    llmGuardedGeneral: async () => "I can only answer about this property.",
    now: () => "2026-04-12T12:00:00Z",
    ...overrides,
  };
}

describe("orchestrate", () => {
  it("routes a pricing question through the pricing engine", async () => {
    const result = await orchestrate(
      {
        question: "How much is this house worth?",
        propertyId: "p1",
        dealContext: "Test deal",
      },
      makeDeps(),
    );
    expect(result.classification.intent).toBe("pricing");
    expect(result.response.engine).toBe("pricing");
    expect(result.response.stubbed).toBe(false);
    expect(result.response.text).toContain("$485,000");
    expect(result.response.citations).toContain("k17abc");
  });

  it("stubs when engine output is missing", async () => {
    const result = await orchestrate(
      {
        question: "What are the comps?",
        propertyId: "p1",
        dealContext: "Test",
      },
      makeDeps({
        loadEngineOutput: async () => null,
      }),
    );
    expect(result.classification.intent).toBe("comps");
    expect(result.response.stubbed).toBe(true);
    expect(result.response.text).toContain("comp selection");
  });

  it("stubs when engine is not yet available (risks → case synthesis)", async () => {
    const result = await orchestrate(
      {
        question: "What are the biggest risks?",
        propertyId: "p1",
        dealContext: "",
      },
      makeDeps(),
    );
    expect(result.classification.intent).toBe("risks");
    expect(result.response.stubbed).toBe(true);
    expect(result.response.engine).toBe("case_synthesis");
  });

  it("routes off-topic questions to guarded general", async () => {
    const result = await orchestrate(
      {
        question: "What's the weather today?",
        propertyId: "p1",
        dealContext: "",
      },
      makeDeps(),
    );
    expect(result.classification.intent).toBe("other");
    expect(result.response.engine).toBe("guarded_general");
    expect(result.response.text).toContain("only answer about this property");
  });

  it("falls back to refusal when guarded general LLM fails", async () => {
    const result = await orchestrate(
      {
        question: "Tell me about politics",
        propertyId: "p1",
        dealContext: "",
      },
      makeDeps({
        llmGuardedGeneral: async () => {
          throw new Error("llm unavailable");
        },
      }),
    );
    expect(result.response.stubbed).toBe(true);
    expect(result.response.text).toContain("only help");
  });

  it("falls back to refusal when guarded general returns empty text", async () => {
    const result = await orchestrate(
      {
        question: "Recipe for paella?",
        propertyId: "p1",
        dealContext: "",
      },
      makeDeps({
        llmGuardedGeneral: async () => "   ",
      }),
    );
    expect(result.response.stubbed).toBe(true);
    expect(result.response.text).toContain("only help");
  });

  it("stubs when llmRespond throws", async () => {
    const result = await orchestrate(
      {
        question: "How much is this worth?",
        propertyId: "p1",
        dealContext: "",
      },
      makeDeps({
        llmRespond: async () => {
          throw new Error("gateway down");
        },
      }),
    );
    expect(result.response.stubbed).toBe(true);
    expect(result.response.engine).toBe("pricing");
  });

  it("invokes the llm classifier when rule confidence is too low", async () => {
    let called = false;
    const result = await orchestrate(
      {
        question: "Hmm",
        propertyId: "p1",
        dealContext: "",
      },
      makeDeps({
        llmClassify: async () => {
          called = true;
          return { intent: "pricing", confidence: 0.9, method: "llm" };
        },
      }),
    );
    expect(called).toBe(true);
    expect(result.debug.llmFallback).toBe(true);
    expect(result.classification.intent).toBe("pricing");
  });
});
