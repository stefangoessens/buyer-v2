/**
 * Unit tests for the fixture registry (KIN-856).
 *
 * The registry exposes loadFixtures and availableFixtureEngines as the
 * public API. On day one only the pricing engine has a seed fixture; the
 * other engines are intentional placeholders that will populate from the
 * calibration loop as closed-deal data becomes available (KIN-786).
 */
import { describe, it, expect } from "vitest";
import {
  loadFixtures,
  availableFixtureEngines,
  FIXTURE_SETS,
} from "@/lib/ai/eval/fixtures";
import type { EngineType } from "@/lib/ai/eval/types";

describe("loadFixtures", () => {
  it("returns at least one fixture for the pricing engine", () => {
    const fixtures = loadFixtures("pricing");
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
  });

  it("returns fixtures with the required structure", () => {
    const fixtures = loadFixtures("pricing");
    for (const f of fixtures) {
      expect(f.id).toBeTruthy();
      expect(f.engineType).toBe("pricing");
      expect(f.label).toBeTruthy();
      expect(f.input).toBeDefined();
      expect(f.expected).toBeDefined();
      expect(f.createdAt).toBeTruthy();
    }
  });

  it("throws for an engine with no fixtures yet", () => {
    const empties: EngineType[] = [
      "comps",
      "leverage",
      "offer",
      "cost",
      "docs",
      "case_synthesis",
    ];
    for (const engine of empties) {
      expect(() => loadFixtures(engine)).toThrow(/No fixtures available/);
    }
  });

  it("returns a fixture whose ID is the documented miami-condo-001 seed", () => {
    const fixtures = loadFixtures("pricing");
    const ids = fixtures.map((f) => f.id);
    expect(ids).toContain("miami-condo-001");
  });

  it("the seed pricing fixture has input and expected matching the PricingInput / PricingOutput shapes", () => {
    const fixtures = loadFixtures("pricing");
    const seed = fixtures.find((f) => f.id === "miami-condo-001");
    expect(seed).toBeDefined();
    // Use index access via unknown to read without importing the engine types.
    const input = seed!.input as Record<string, unknown>;
    expect(input.propertyId).toBeDefined();
    expect(typeof input.listPrice).toBe("number");
    expect(typeof input.beds).toBe("number");
    expect(typeof input.sqft).toBe("number");

    const expected = seed!.expected as Record<string, unknown>;
    expect(expected.fairValue).toBeDefined();
    expect(expected.likelyAccepted).toBeDefined();
    expect(expected.strongOpener).toBeDefined();
    expect(expected.walkAway).toBeDefined();
  });
});

describe("availableFixtureEngines", () => {
  it("includes 'pricing'", () => {
    const engines = availableFixtureEngines();
    expect(engines).toContain("pricing");
  });

  it("excludes engines with no fixtures yet", () => {
    const engines = availableFixtureEngines();
    expect(engines).not.toContain("comps");
    expect(engines).not.toContain("leverage");
    expect(engines).not.toContain("offer");
    expect(engines).not.toContain("cost");
    expect(engines).not.toContain("docs");
    expect(engines).not.toContain("case_synthesis");
  });

  it("returns only engine types defined in the registry keys", () => {
    const engines = availableFixtureEngines();
    const allKeys = Object.keys(FIXTURE_SETS) as EngineType[];
    for (const e of engines) {
      expect(allKeys).toContain(e);
    }
  });
});

describe("FIXTURE_SETS registry", () => {
  it("has a key for every known engine type", () => {
    const keys = Object.keys(FIXTURE_SETS);
    expect(keys).toEqual(
      expect.arrayContaining([
        "pricing",
        "comps",
        "leverage",
        "offer",
        "cost",
        "docs",
        "case_synthesis",
      ]),
    );
  });

  it("every fixture in the pricing set has engineType='pricing'", () => {
    for (const f of FIXTURE_SETS.pricing) {
      expect(f.engineType).toBe("pricing");
    }
  });
});
