/**
 * Eval runner: execute an engine over a fixture set and aggregate scores.
 *
 * The runner does NOT invoke AI models directly. Callers pass an
 * `EngineFunction` callable so tests can stub it with fixture-provided
 * outputs and production callers can wire in the real gateway.
 */

import type {
  EngineFunction,
  EvalRunResult,
  Fixture,
  ScoreReport,
  ScoringFunction,
} from "./types";

/** Default pass threshold. Individual engines can override per-run. */
export const DEFAULT_PASS_THRESHOLD = 0.7;

/**
 * Run an eval: execute the engine on each fixture, score the output,
 * and aggregate results into a structured report.
 *
 * Errors thrown by the engine are captured per-fixture — they produce a
 * failing report with score 0, never abort the whole run.
 *
 * All fixtures in a run must share the same engine type; this is enforced
 * upfront so aggregate results always describe a single engine.
 */
export async function runEval<TInput, TOutput>(
  fixtures: Fixture<TInput, TOutput>[],
  engine: EngineFunction<TInput, TOutput>,
  scorer: ScoringFunction<TOutput>,
  options: {
    fixtureSetName: string;
    promptVersion: string;
    passThreshold?: number;
  },
): Promise<EvalRunResult> {
  const threshold = options.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  const reports: ScoreReport[] = [];
  const startMs = Date.now();

  if (fixtures.length === 0) {
    throw new Error("runEval: no fixtures provided");
  }

  const engineType = fixtures[0].engineType;
  for (const f of fixtures) {
    if (f.engineType !== engineType) {
      throw new Error(
        `Fixture ${f.id} has engineType ${f.engineType}, expected ${engineType}`,
      );
    }
  }

  for (const fixture of fixtures) {
    const runAt = new Date().toISOString();
    try {
      const actual = await engine(fixture.input, options.promptVersion);
      const { score, details, errors } = scorer(actual, fixture.expected, fixture.rubric);
      reports.push({
        fixtureId: fixture.id,
        engineType: fixture.engineType,
        promptVersion: options.promptVersion,
        score,
        passed: score >= threshold,
        threshold,
        details,
        errors,
        runAt,
      });
    } catch (err) {
      reports.push({
        fixtureId: fixture.id,
        engineType: fixture.engineType,
        promptVersion: options.promptVersion,
        score: 0,
        passed: false,
        threshold,
        details: {},
        errors: [err instanceof Error ? err.message : String(err)],
        runAt,
      });
    }
  }

  const scores = reports.map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  return {
    engineType,
    fixtureSetName: options.fixtureSetName,
    promptVersion: options.promptVersion,
    totalFixtures: fixtures.length,
    passed: reports.filter((r) => r.passed).length,
    failed: reports.filter((r) => !r.passed).length,
    avgScore: avg,
    medianScore: median,
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
    reports,
    runAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
  };
}
