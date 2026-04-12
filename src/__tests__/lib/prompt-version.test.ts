import { describe, it, expect } from "vitest";
import {
  generateVersionHash,
  buildVersionContent,
} from "../../../convex/lib/promptVersion";

describe("generateVersionHash", () => {
  it("returns deterministic hash for same input", () => {
    const hash1 = generateVersionHash("test prompt");
    const hash2 = generateVersionHash("test prompt");
    expect(hash1).toBe(hash2);
  });

  it("returns different hash for different input", () => {
    const hash1 = generateVersionHash("prompt A");
    const hash2 = generateVersionHash("prompt B");
    expect(hash1).not.toBe(hash2);
  });

  it("returns v- prefixed hex string", () => {
    const hash = generateVersionHash("test");
    expect(hash).toMatch(/^v-[0-9a-f]{8}$/);
  });
});

describe("buildVersionContent", () => {
  it("includes model, system prompt, and prompt", () => {
    const content = buildVersionContent("user prompt", "system prompt", "claude-3-opus");
    expect(content).toContain("claude-3-opus");
    expect(content).toContain("system prompt");
    expect(content).toContain("user prompt");
  });

  it("handles undefined system prompt", () => {
    const content = buildVersionContent("prompt", undefined, "model");
    expect(content).toBe("5:model|0:|6:prompt");
  });

  it("avoids collisions from delimiter in field values", () => {
    // model="a::b" sys="" vs model="a" sys=":b" should differ
    const a = buildVersionContent("p", "", "a::b");
    const b = buildVersionContent("p", ":b", "a");
    expect(a).not.toBe(b);
  });

  it("different models produce different content", () => {
    const a = buildVersionContent("prompt", "sys", "model-a");
    const b = buildVersionContent("prompt", "sys", "model-b");
    expect(a).not.toBe(b);
  });
});
