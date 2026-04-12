/**
 * Unit tests for the eval runner (KIN-856).
 *
 * The runner accepts a fixture set, an engine function, and a scoring
 * function; it executes engine→scorer across all fixtures and aggregates
 * into a single EvalRunResult. These tests cover the happy path, error
 * capture (engine throws → recorded as failed), empty-fixture and mixed-
 * engine guards, threshold override, and aggregate math.
 */
import { describe, it, expect } from "vitest";
import {
  runEval,
  DEFAULT_PASS_THRESHOLD,
} from "@/lib/ai/eval/runner";
import type {
  EngineFunction,
  Fixture,
  ScoringFunction,
} from "@/lib/ai/eval/types";

// ─── test helpers ────────────────────────────────────────────────────────

type NumOutput = { value: number };

function fx(id: string, expectedValue: number): Fixture<unknown, NumOutput> {
  return {
    id,
    engineType: "pricing",
    label: `fixture-${id}`,
    input: {},
    expected: { value: expectedValue },
    createdAt: "2026-04-12T00:00:00Z",
    source: "test",
  };
}

// Engine that returns exactly the fixture's expected output
const perfectEngine: EngineFunction<unknown, NumOutput> = async (_input) => ({
  value: 100,
});

// Simple scorer: 1.0 if value matches exactly, 0 otherwise
const exactScorer: ScoringFunction<NumOutput> = (actual, expected) => ({
  score: actual.value === expected.value ? 1 : 0,
  details: { actualValue: actual.value, expectedValue: expected.value },
});

// Scorer that returns proportional scores based on closeness
const proportionalScorer: ScoringFunction<NumOutput> = (actual, expected) => {
  const details: Record<string, number | string> = {};
  if (expected.value === 0) return { score: 1, details };
  const err = Math.abs(actual.value - expected.value) / expected.value;
  details.err = err;
  return { score: Math.max(0, 1 - err), details };
};

// ─── tests ───────────────────────────────────────────────────────────────

describe("runEval — happy path", () => {
  it("aggregates passing results correctly for a single fixture", async () => {
    const fixtures = [fx("a", 100)];
    const result = await runEval(fixtures, perfectEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });

    expect(result.totalFixtures).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.avgScore).toBe(1);
    expect(result.medianScore).toBe(1);
    expect(result.minScore).toBe(1);
    expect(result.maxScore).toBe(1);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].passed).toBe(true);
    expect(result.reports[0].threshold).toBe(DEFAULT_PASS_THRESHOLD);
    expect(result.reports[0].fixtureId).toBe("a");
    expect(result.reports[0].engineType).toBe("pricing");
    expect(result.reports[0].promptVersion).toBe("v1");
    expect(result.engineType).toBe("pricing");
    expect(result.fixtureSetName).toBe("test-set");
  });

  it("handles mixed pass/fail across fixtures", async () => {
    // perfectEngine returns {value: 100}; fixture a expects 100, b expects 999
    const fixtures = [fx("a", 100), fx("b", 999)];
    const result = await runEval(fixtures, perfectEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });

    expect(result.totalFixtures).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.avgScore).toBe(0.5);
  });

  it("marks all fixtures as failing when all scores are below threshold", async () => {
    const fixtures = [fx("a", 999), fx("b", 888)];
    const result = await runEval(fixtures, perfectEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.avgScore).toBe(0);
  });
});

describe("runEval — engine error capture", () => {
  it("catches engine errors and records them as score 0", async () => {
    const throwingEngine: EngineFunction<unknown, NumOutput> = async () => {
      throw new Error("simulated engine failure");
    };
    const fixtures = [fx("a", 100)];
    const result = await runEval(fixtures, throwingEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.reports[0].score).toBe(0);
    expect(result.reports[0].passed).toBe(false);
    expect(result.reports[0].errors).toBeDefined();
    expect(result.reports[0].errors?.[0]).toContain("simulated engine failure");
  });

  it("captures non-Error thrown values via String()", async () => {
    const throwingEngine: EngineFunction<unknown, NumOutput> = async () => {
      // eslint-disable-next-line no-throw-literal
      throw "raw string error";
    };
    const fixtures = [fx("a", 100)];
    const result = await runEval(fixtures, throwingEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });

    expect(result.reports[0].errors?.[0]).toBe("raw string error");
  });

  it("continues processing remaining fixtures after one throws", async () => {
    let callCount = 0;
    const flakyEngine: EngineFunction<unknown, NumOutput> = async () => {
      callCount++;
      if (callCount === 1) throw new Error("first call fails");
      return { value: 100 };
    };
    const fixtures = [fx("a", 100), fx("b", 100), fx("c", 100)];
    const result = await runEval(fixtures, flakyEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });

    expect(result.totalFixtures).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
  });
});

describe("runEval — validation", () => {
  it("throws on empty fixture array", async () => {
    await expect(
      runEval([], perfectEngine, exactScorer, {
        fixtureSetName: "test-set",
        promptVersion: "v1",
      }),
    ).rejects.toThrow("no fixtures provided");
  });

  it("throws on mixed engine types in fixtures", async () => {
    const fixtures: Fixture<unknown, NumOutput>[] = [
      fx("a", 100),
      { ...fx("b", 100), engineType: "offer" },
    ];
    await expect(
      runEval(fixtures, perfectEngine, exactScorer, {
        fixtureSetName: "test-set",
        promptVersion: "v1",
      }),
    ).rejects.toThrow(/engineType/);
  });
});

describe("runEval — threshold handling", () => {
  it("respects a custom pass threshold override", async () => {
    // proportionalScorer gives 0.8 for a 20% error
    const engine: EngineFunction<unknown, NumOutput> = async () => ({ value: 80 });
    const fixtures = [fx("a", 100)];

    // Default threshold 0.7 → passes (0.8 >= 0.7)
    const defaultRun = await runEval(fixtures, engine, proportionalScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });
    expect(defaultRun.passed).toBe(1);

    // Threshold 0.9 → fails (0.8 < 0.9)
    const strictRun = await runEval(fixtures, engine, proportionalScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
      passThreshold: 0.9,
    });
    expect(strictRun.passed).toBe(0);
    expect(strictRun.reports[0].threshold).toBe(0.9);
  });

  it("uses DEFAULT_PASS_THRESHOLD (0.7) when no override provided", async () => {
    const fixtures = [fx("a", 100)];
    const result = await runEval(fixtures, perfectEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });
    expect(result.reports[0].threshold).toBe(0.7);
  });
});

describe("runEval — aggregate math", () => {
  it("computes avg, median, min, max across odd-length score list", async () => {
    // 3 fixtures with proportional scores 1.0, 0.5, 0.0
    let i = 0;
    const engine: EngineFunction<unknown, NumOutput> = async () => {
      const values = [100, 50, 0];
      return { value: values[i++] };
    };
    const fixtures = [fx("a", 100), fx("b", 100), fx("c", 100)];
    const result = await runEval(fixtures, engine, proportionalScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });

    expect(result.avgScore).toBeCloseTo(0.5, 5);
    expect(result.medianScore).toBe(0.5);
    expect(result.minScore).toBe(0);
    expect(result.maxScore).toBe(1);
  });

  it("computes median correctly for an even-length score list", async () => {
    let i = 0;
    const engine: EngineFunction<unknown, NumOutput> = async () => {
      const values = [100, 90, 80, 70]; // scores: 1, 0.9, 0.8, 0.7
      return { value: values[i++] };
    };
    const fixtures = [fx("a", 100), fx("b", 100), fx("c", 100), fx("d", 100)];
    const result = await runEval(fixtures, engine, proportionalScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });
    // sorted: 0.7, 0.8, 0.9, 1.0 → median = (0.8 + 0.9)/2 = 0.85
    expect(result.medianScore).toBeCloseTo(0.85, 5);
  });

  it("durationMs is non-negative", async () => {
    const fixtures = [fx("a", 100)];
    const result = await runEval(fixtures, perfectEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns an ISO timestamp in runAt", async () => {
    const fixtures = [fx("a", 100)];
    const result = await runEval(fixtures, perfectEngine, exactScorer, {
      fixtureSetName: "test-set",
      promptVersion: "v1",
    });
    expect(() => new Date(result.runAt).toISOString()).not.toThrow();
  });
});
