/**
 * Core types for the offline AI eval harness.
 *
 * The harness runs AI engine prompt versions against fixture sets and
 * produces structured score reports used by:
 *   - Prompt iteration (pricing calibration loop, KIN-786)
 *   - CI regression detection when prompts change
 *   - Drift detection between prompt versions
 *
 * This is a pure TS library — no Convex, no AI SDK, no I/O. The runner
 * accepts an `EngineFunction` callable for dependency injection so tests
 * can stub it with fixture-provided outputs and production can wire in
 * the real gateway.
 */

/** A golden fixture pairing an input with expected output for eval scoring. */
export interface Fixture<TInput = unknown, TOutput = unknown> {
  /** Unique fixture ID within its engine type. */
  id: string;
  /** Engine type this fixture targets. */
  engineType: EngineType;
  /** Human-readable label for reports. */
  label: string;
  /** Input payload passed to the engine. */
  input: TInput;
  /** Expected output or expected-range for scoring. */
  expected: TOutput;
  /** Optional scoring rubric notes for reviewers. */
  rubric?: string;
  /** ISO timestamp of when fixture was created. */
  createdAt: string;
  /** Source — e.g., "calibration-loop" or "manual" or "closed-deal-2026-01". */
  source?: string;
}

export type EngineType =
  | "pricing"
  | "comps"
  | "leverage"
  | "offer"
  | "cost"
  | "docs"
  | "case_synthesis";

/** Result of scoring one fixture against engine output. */
export interface ScoreReport {
  fixtureId: string;
  engineType: EngineType;
  promptVersion: string;
  /** 0-1 score, higher = better. */
  score: number;
  /** Whether score met the pass threshold for this engine. */
  passed: boolean;
  /** Pass/fail threshold for score. */
  threshold: number;
  /** Per-dimension breakdown (e.g., {fairValueAccuracy: 0.95, ...}). */
  details: Record<string, number | string>;
  /** Any non-fatal validation errors from scoring. */
  errors?: string[];
  runAt: string;
}

/** Full result of running an eval on a fixture set. */
export interface EvalRunResult {
  engineType: EngineType;
  fixtureSetName: string;
  promptVersion: string;
  totalFixtures: number;
  passed: number;
  failed: number;
  avgScore: number;
  medianScore: number;
  minScore: number;
  maxScore: number;
  reports: ScoreReport[];
  runAt: string;
  durationMs: number;
}

/** Drift report comparing two eval runs. */
export interface DriftReport {
  engineType: EngineType;
  fixtureSetName: string;
  versionA: string;
  versionB: string;
  avgScoreA: number;
  avgScoreB: number;
  /** scoreB - scoreA. Positive = improvement. */
  delta: number;
  /** Fixtures where B scored higher than A by > 0.01. */
  improvedFixtures: string[];
  /** Fixtures where B scored lower than A by > 0.01. */
  regressedFixtures: string[];
  /** Fixtures with roughly equal scores. */
  unchangedFixtures: string[];
  /** Overall verdict. */
  verdict: "improved" | "regressed" | "unchanged";
}

/** Generic callable for an engine under test. */
export type EngineFunction<TInput, TOutput> = (
  input: TInput,
  promptVersion: string,
) => Promise<TOutput>;

/** Generic scoring function. */
export type ScoringFunction<TOutput> = (
  actual: TOutput,
  expected: TOutput,
  rubric?: string,
) => {
  score: number;
  details: Record<string, number | string>;
  errors?: string[];
};
