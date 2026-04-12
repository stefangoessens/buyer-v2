import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, ENGINE_CONFIGS } from "@/lib/ai/gateway";
import { MODEL_COSTS } from "@/lib/ai/types";

describe("Gateway config", () => {
  it("defaults to Anthropic primary with OpenAI fallback", () => {
    expect(DEFAULT_CONFIG.primaryProvider).toBe("anthropic");
    expect(DEFAULT_CONFIG.fallbackProvider).toBe("openai");
    expect(DEFAULT_CONFIG.primaryModel).toBe("claude-sonnet-4-20250514");
    expect(DEFAULT_CONFIG.fallbackModel).toBe("gpt-4o");
  });

  it("has per-engine config overrides", () => {
    expect(ENGINE_CONFIGS.doc_parser?.timeoutMs).toBe(60000);
    expect(ENGINE_CONFIGS.copilot?.timeoutMs).toBe(15000);
  });
});

describe("MODEL_COSTS", () => {
  it("has cost entries for primary models", () => {
    expect(MODEL_COSTS["claude-sonnet-4-20250514"]).toBeDefined();
    expect(MODEL_COSTS["gpt-4o"]).toBeDefined();
  });

  it("has input and output costs", () => {
    const claude = MODEL_COSTS["claude-sonnet-4-20250514"];
    expect(claude.input).toBeGreaterThan(0);
    expect(claude.output).toBeGreaterThan(0);
    expect(claude.output).toBeGreaterThan(claude.input);
  });
});
