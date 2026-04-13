import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_REGISTRY_ENTRIES,
  PROMPT_REGISTRY_ENGINE_TYPES,
  buildVersionContent,
  generateVersionHash,
  getPromptVersionRef,
  materializePromptRegistryEntries,
} from "../../../../packages/shared/src/prompt-registry";
import {
  COPILOT_PROMPTS,
  COPILOT_PROMPT_VERSION_REFS,
  hashPrompt,
} from "@/lib/copilot/prompts";

describe("prompt registry catalog", () => {
  it("assigns a deterministic version hash to every prompt entry", () => {
    for (const entry of DEFAULT_PROMPT_REGISTRY_ENTRIES) {
      const expected = generateVersionHash(
        buildVersionContent(entry.prompt, entry.systemPrompt, entry.model),
      );
      expect(entry.version).toBe(expected);
    }
  });

  it("covers every runtime engine type with at least one prompt entry", () => {
    const coveredEngines = new Set(
      DEFAULT_PROMPT_REGISTRY_ENTRIES.map((entry) => entry.engineType),
    );
    expect(Array.from(coveredEngines).sort()).toEqual(
      [...PROMPT_REGISTRY_ENGINE_TYPES].sort(),
    );
  });

  it("keeps prompt keys unique within each engine", () => {
    const keysByEngine = new Map<string, Set<string>>();
    for (const entry of DEFAULT_PROMPT_REGISTRY_ENTRIES) {
      const seen = keysByEngine.get(entry.engineType) ?? new Set<string>();
      expect(seen.has(entry.promptKey)).toBe(false);
      seen.add(entry.promptKey);
      keysByEngine.set(entry.engineType, seen);
    }
  });

  it("materializes active flags from the catalog definitions", () => {
    const entries = materializePromptRegistryEntries();
    expect(entries.every((entry) => entry.isActive)).toBe(true);
  });

  it("returns a stable explicit version ref for named prompts", () => {
    const pricing = getPromptVersionRef("pricing", "default");
    const copilotClassifier = getPromptVersionRef("copilot", "classifier");

    expect(pricing.engineType).toBe("pricing");
    expect(pricing.promptKey).toBe("default");
    expect(pricing.version).toMatch(/^v-[0-9a-f]{8}$/);

    expect(copilotClassifier.engineType).toBe("copilot");
    expect(copilotClassifier.promptKey).toBe("classifier");
    expect(copilotClassifier.version).toMatch(/^v-[0-9a-f]{8}$/);
  });
});

describe("copilot prompt bindings", () => {
  it("uses registry-backed version refs for every UI template", () => {
    const versions = new Set([
      COPILOT_PROMPT_VERSION_REFS.classifier.version,
      COPILOT_PROMPT_VERSION_REFS.guardedGeneral.version,
      COPILOT_PROMPT_VERSION_REFS.responsePricing.version,
      COPILOT_PROMPT_VERSION_REFS.responseComps.version,
      COPILOT_PROMPT_VERSION_REFS.responseCosts.version,
      COPILOT_PROMPT_VERSION_REFS.responseLeverage.version,
      COPILOT_PROMPT_VERSION_REFS.responseOffer.version,
    ]);

    expect(COPILOT_PROMPTS).toHaveLength(7);
    for (const prompt of COPILOT_PROMPTS) {
      expect(versions.has(hashPrompt(prompt))).toBe(true);
    }
  });
});
