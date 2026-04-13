/**
 * Unit tests for drift detection (KIN-856).
 *
 * detectDrift compares two eval runs on the same fixture set and engine
 * to determine whether version B improved, regressed, or stayed
 * unchanged vs version A. Tests cover verdicts, fixture-level
 * categorization, noise threshold, and guard-rail errors.
 */
import { describe, it, expect } from "vitest";
import { detectDrift, DRIFT_NOISE_THRESHOLD } from "@/lib/ai/eval/drift";
import type { EvalRunResult, ScoreReport, EngineType } from "@/lib/ai/eval/types";

// ─── test helpers ────────────────────────────────────────────────────────

function makeReport(
  fixtureId: string,
  score: number,
  promptVersion = "v1",
  engineType: EngineType = "pricing",
): ScoreReport {
  return {
    fixtureId,
    engineType,
    promptVersion,
    score,
    passed: score >= 0.7,
    threshold: 0.7,
    details: {},
    runAt: "2026-04-12T00:00:00Z",
  };
}

function makeRun(
  opts: {
    engineType?: EngineType;
    fixtureSetName?: string;
    promptVersion?: string;
    scores: Array<[string, number]>;
  },
): EvalRunResult {
  const engineType = opts.engineType ?? "pricing";
  const fixtureSetName = opts.fixtureSetName ?? "test-set";
  const promptVersion = opts.promptVersion ?? "v1";
  const reports = opts.scores.map(([id, s]) =>
    makeReport(id, s, promptVersion, engineType),
  );
  const scoreValues = reports.map((r) => r.score);
  const avg =
    scoreValues.length > 0
      ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
      : 0;
  const sorted = [...scoreValues].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
  return {
    engineType,
    fixtureSetName,
    promptVersion,
    totalFixtures: reports.length,
    passed: reports.filter((r) => r.passed).length,
    failed: reports.filter((r) => !r.passed).length,
    avgScore: avg,
    medianScore: median,
    minScore: scoreValues.length > 0 ? Math.min(...scoreValues) : 0,
    maxScore: scoreValues.length > 0 ? Math.max(...scoreValues) : 0,
    reports,
    runAt: "2026-04-12T00:00:00Z",
    durationMs: 100,
  };
}

// ─── verdict tests ───────────────────────────────────────────────────────

describe("detectDrift — verdicts", () => {
  it("returns 'unchanged' when both runs are identical", () => {
    const a = makeRun({
      promptVersion: "v1",
      scores: [
        ["a", 0.8],
        ["b", 0.9],
        ["c", 0.7],
      ],
    });
    const b = makeRun({
      promptVersion: "v2",
      scores: [
        ["a", 0.8],
        ["b", 0.9],
        ["c", 0.7],
      ],
    });
    const drift = detectDrift(a, b);
    expect(drift.verdict).toBe("unchanged");
    expect(drift.unchangedFixtures).toHaveLength(3);
    expect(drift.improvedFixtures).toHaveLength(0);
    expect(drift.regressedFixtures).toHaveLength(0);
    expect(drift.delta).toBeCloseTo(0, 5);
  });

  it("returns 'improved' when every fixture gets better", () => {
    const a = makeRun({
      promptVersion: "v1",
      scores: [
        ["a", 0.5],
        ["b", 0.6],
      ],
    });
    const b = makeRun({
      promptVersion: "v2",
      scores: [
        ["a", 0.8],
        ["b", 0.9],
      ],
    });
    const drift = detectDrift(a, b);
    expect(drift.verdict).toBe("improved");
    expect(drift.improvedFixtures).toEqual(expect.arrayContaining(["a", "b"]));
    expect(drift.regressedFixtures).toHaveLength(0);
    expect(drift.delta).toBeGreaterThan(0);
  });

  it("returns 'regressed' when every fixture gets worse", () => {
    const a = makeRun({
      promptVersion: "v1",
      scores: [
        ["a", 0.9],
        ["b", 0.8],
      ],
    });
    const b = makeRun({
      promptVersion: "v2",
      scores: [
        ["a", 0.4],
        ["b", 0.3],
      ],
    });
    const drift = detectDrift(a, b);
    expect(drift.verdict).toBe("regressed");
    expect(drift.regressedFixtures).toEqual(expect.arrayContaining(["a", "b"]));
    expect(drift.improvedFixtures).toHaveLength(0);
    expect(drift.delta).toBeLessThan(0);
  });

  it("categorizes each fixture correctly in a mixed run", () => {
    const a = makeRun({
      promptVersion: "v1",
      scores: [
        ["up", 0.5], // will go up
        ["down", 0.9], // will go down
        ["same", 0.8], // exactly the same
      ],
    });
    const b = makeRun({
      promptVersion: "v2",
      scores: [
        ["up", 0.9],
        ["down", 0.4],
        ["same", 0.8],
      ],
    });
    const drift = detectDrift(a, b);
    expect(drift.improvedFixtures).toEqual(["up"]);
    expect(drift.regressedFixtures).toEqual(["down"]);
    expect(drift.unchangedFixtures).toEqual(["same"]);
  });
});

// ─── fixture-only-in-one-run tests ───────────────────────────────────────

describe("detectDrift — fixture presence mismatches", () => {
  it("treats a fixture only in A as regressed (B score = 0)", () => {
    const a = makeRun({
      promptVersion: "v1",
      scores: [
        ["shared", 0.8],
        ["only-a", 0.9],
      ],
    });
    const b = makeRun({
      promptVersion: "v2",
      scores: [["shared", 0.8]],
    });
    const drift = detectDrift(a, b);
    expect(drift.regressedFixtures).toContain("only-a");
    expect(drift.unchangedFixtures).toContain("shared");
  });

  it("treats a fixture only in B as improved (A score = 0)", () => {
    const a = makeRun({
      promptVersion: "v1",
      scores: [["shared", 0.8]],
    });
    const b = makeRun({
      promptVersion: "v2",
      scores: [
        ["shared", 0.8],
        ["only-b", 0.9],
      ],
    });
    const drift = detectDrift(a, b);
    expect(drift.improvedFixtures).toContain("only-b");
    expect(drift.unchangedFixtures).toContain("shared");
  });
});

// ─── guard rail tests ────────────────────────────────────────────────────

describe("detectDrift — guards", () => {
  it("throws on engine type mismatch", () => {
    const a = makeRun({ engineType: "pricing", scores: [["a", 0.8]] });
    const b = makeRun({ engineType: "offer", scores: [["a", 0.8]] });
    expect(() => detectDrift(a, b)).toThrow(/Engine mismatch/);
  });

  it("throws on fixture set name mismatch", () => {
    const a = makeRun({
      fixtureSetName: "pricing-seed",
      scores: [["a", 0.8]],
    });
    const b = makeRun({
      fixtureSetName: "pricing-extended",
      scores: [["a", 0.8]],
    });
    expect(() => detectDrift(a, b)).toThrow(/Fixture set mismatch/);
  });
});

// ─── noise threshold tests ───────────────────────────────────────────────

describe("detectDrift — noise threshold", () => {
  it("treats score deltas within DRIFT_NOISE_THRESHOLD as unchanged", () => {
    // delta = 0.005 < 0.01 noise threshold
    const a = makeRun({ scores: [["a", 0.8]] });
    const b = makeRun({ scores: [["a", 0.805]] });
    const drift = detectDrift(a, b);
    expect(drift.unchangedFixtures).toContain("a");
    expect(drift.improvedFixtures).toHaveLength(0);
  });

  it("treats score deltas just above DRIFT_NOISE_THRESHOLD as improved", () => {
    // delta = 0.02 > 0.01
    const a = makeRun({ scores: [["a", 0.8]] });
    const b = makeRun({ scores: [["a", 0.82]] });
    const drift = detectDrift(a, b);
    expect(drift.improvedFixtures).toContain("a");
  });

  it("exports DRIFT_NOISE_THRESHOLD as 0.01", () => {
    expect(DRIFT_NOISE_THRESHOLD).toBe(0.01);
  });
});

// ─── metadata passthrough ────────────────────────────────────────────────

describe("detectDrift — metadata", () => {
  it("carries version labels and avg scores into the report", () => {
    const a = makeRun({
      promptVersion: "v1",
      scores: [
        ["a", 0.8],
        ["b", 0.6],
      ],
    });
    const b = makeRun({
      promptVersion: "v2",
      scores: [
        ["a", 0.9],
        ["b", 0.7],
      ],
    });
    const drift = detectDrift(a, b);
    expect(drift.versionA).toBe("v1");
    expect(drift.versionB).toBe("v2");
    expect(drift.avgScoreA).toBeCloseTo(0.7, 5);
    expect(drift.avgScoreB).toBeCloseTo(0.8, 5);
    expect(drift.delta).toBeCloseTo(0.1, 5);
  });

  it("preserves the engineType and fixtureSetName from run A", () => {
    const a = makeRun({
      engineType: "pricing",
      fixtureSetName: "pricing-seed",
      scores: [["a", 0.8]],
    });
    const b = makeRun({
      engineType: "pricing",
      fixtureSetName: "pricing-seed",
      scores: [["a", 0.8]],
    });
    const drift = detectDrift(a, b);
    expect(drift.engineType).toBe("pricing");
    expect(drift.fixtureSetName).toBe("pricing-seed");
  });
});
