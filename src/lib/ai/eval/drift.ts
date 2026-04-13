/**
 * Drift detection: compare two eval runs on the same fixture set and
 * engine to see whether a prompt version change improved or regressed
 * quality.
 *
 * Used by CI to gate prompt changes and by the calibration loop to
 * track incremental improvement.
 */

import type { DriftReport, EvalRunResult } from "./types";

/** Threshold below which score deltas are considered noise. */
export const DRIFT_NOISE_THRESHOLD = 0.01;

/**
 * Compare two eval runs on the same fixture set and engine. Returns a
 * drift report categorizing each fixture as improved, regressed, or
 * unchanged, plus an overall verdict derived from the average-score
 * delta.
 *
 * Throws if the two runs are not comparable (different engine type or
 * different fixture set name).
 */
export function detectDrift(a: EvalRunResult, b: EvalRunResult): DriftReport {
  if (a.engineType !== b.engineType) {
    throw new Error(`Engine mismatch: ${a.engineType} vs ${b.engineType}`);
  }
  if (a.fixtureSetName !== b.fixtureSetName) {
    throw new Error(`Fixture set mismatch: ${a.fixtureSetName} vs ${b.fixtureSetName}`);
  }

  const aByFixture = new Map(a.reports.map((r) => [r.fixtureId, r.score]));
  const bByFixture = new Map(b.reports.map((r) => [r.fixtureId, r.score]));

  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];

  const allFixtureIds = new Set([...aByFixture.keys(), ...bByFixture.keys()]);
  for (const id of allFixtureIds) {
    const scoreA = aByFixture.get(id) ?? 0;
    const scoreB = bByFixture.get(id) ?? 0;
    const delta = scoreB - scoreA;
    if (delta > DRIFT_NOISE_THRESHOLD) improved.push(id);
    else if (delta < -DRIFT_NOISE_THRESHOLD) regressed.push(id);
    else unchanged.push(id);
  }

  const overallDelta = b.avgScore - a.avgScore;
  const verdict: DriftReport["verdict"] =
    overallDelta > DRIFT_NOISE_THRESHOLD
      ? "improved"
      : overallDelta < -DRIFT_NOISE_THRESHOLD
        ? "regressed"
        : "unchanged";

  return {
    engineType: a.engineType,
    fixtureSetName: a.fixtureSetName,
    versionA: a.promptVersion,
    versionB: b.promptVersion,
    avgScoreA: a.avgScore,
    avgScoreB: b.avgScore,
    delta: overallDelta,
    improvedFixtures: improved,
    regressedFixtures: regressed,
    unchangedFixtures: unchanged,
    verdict,
  };
}
