#!/usr/bin/env tsx
/**
 * AI eval harness CLI (KIN-856).
 *
 * Usage:
 *   pnpm eval <engineType> <promptVersion> [--json]
 *   pnpm eval:drift <engineType> <versionA> <versionB> [--json]
 *
 * Examples:
 *   pnpm eval pricing v1.0.0
 *   pnpm eval:drift pricing v1.0.0 v1.1.0
 *   pnpm eval pricing v1.0.0 --json > report.json
 *
 * The CLI loads fixtures from the in-memory registry, runs the eval via
 * a deterministic "pass-through" engine stub that returns fixture.expected
 * verbatim (so the CLI exercises the harness wiring without requiring live
 * AI model calls — real runs inject the actual engine). This is what CI
 * uses to catch regressions in the harness itself; live runs are triggered
 * from scripts that wire in the real gateway.
 */
import {
  runEval,
  detectDrift,
  scorePricing,
  scoreComps,
  scoreLeverage,
  scoreOffer,
  scoreCost,
  scoreDocs,
  scoreCaseSynthesis,
  loadFixtures,
  availableFixtureEngines,
  type EngineType,
  type EngineFunction,
  type ScoringFunction,
  type EvalRunResult,
  type Fixture,
} from "../src/lib/ai/eval";

/**
 * Deterministic pass-through engine: returns fixture.expected unchanged.
 * Used by the CI harness self-test and by CLI smoke tests. Production
 * eval runs import the actual engines from src/lib/ai/engines/ and pass
 * them in instead.
 */
function makePassthroughEngine<TInput, TOutput>(
  fixtures: Array<{ input: TInput; expected: TOutput }>,
): EngineFunction<TInput, TOutput> {
  let callIndex = 0;
  return async () => {
    const fixture = fixtures[callIndex % fixtures.length];
    callIndex++;
    return fixture.expected;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SCORERS: Record<EngineType, ScoringFunction<any>> = {
  pricing: scorePricing,
  comps: scoreComps,
  leverage: scoreLeverage,
  offer: scoreOffer,
  cost: scoreCost,
  docs: scoreDocs,
  case_synthesis: scoreCaseSynthesis,
};

function printHumanReport(result: EvalRunResult): void {
  console.log("=== AI Eval Report ===");
  console.log(`Engine:          ${result.engineType}`);
  console.log(`Fixture set:     ${result.fixtureSetName}`);
  console.log(`Prompt version:  ${result.promptVersion}`);
  console.log(`Total fixtures:  ${result.totalFixtures}`);
  console.log(`Passed:          ${result.passed}`);
  console.log(`Failed:          ${result.failed}`);
  console.log(`Avg score:       ${result.avgScore.toFixed(3)}`);
  console.log(`Median score:    ${result.medianScore.toFixed(3)}`);
  console.log(
    `Min / Max:       ${result.minScore.toFixed(3)} / ${result.maxScore.toFixed(3)}`,
  );
  console.log(`Duration:        ${result.durationMs}ms`);
  console.log();
  for (const r of result.reports) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${r.fixtureId} - score=${r.score.toFixed(3)}`);
    if (r.errors && r.errors.length > 0) {
      for (const e of r.errors) console.log(`      error: ${e}`);
    }
  }
}

function printDriftReport(report: ReturnType<typeof detectDrift>): void {
  console.log("=== Drift Report ===");
  console.log(`Engine:          ${report.engineType}`);
  console.log(`Fixture set:     ${report.fixtureSetName}`);
  console.log(`Version A:       ${report.versionA} (avg ${report.avgScoreA.toFixed(3)})`);
  console.log(`Version B:       ${report.versionB} (avg ${report.avgScoreB.toFixed(3)})`);
  console.log(
    `Delta:           ${report.delta >= 0 ? "+" : ""}${report.delta.toFixed(3)}`,
  );
  console.log(`Verdict:         ${report.verdict.toUpperCase()}`);
  console.log(`Improved:        ${report.improvedFixtures.length}`);
  console.log(`Regressed:       ${report.regressedFixtures.length}`);
  console.log(`Unchanged:       ${report.unchangedFixtures.length}`);
  if (report.improvedFixtures.length > 0) {
    console.log("  up: " + report.improvedFixtures.join(", "));
  }
  if (report.regressedFixtures.length > 0) {
    console.log("  down: " + report.regressedFixtures.join(", "));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: pnpm eval <engineType> <promptVersion> [--json]");
    console.error(
      "       pnpm eval:drift <engineType> <versionA> <versionB> [--json]",
    );
    console.error(
      `Available engines with fixtures: ${availableFixtureEngines().join(", ") || "(none)"}`,
    );
    process.exit(1);
  }

  const mode = args[0] === "drift" ? "drift" : "run";
  const jsonMode = args.includes("--json");

  if (mode === "drift") {
    // pnpm eval:drift <engineType> <versionA> <versionB>
    const [, engineTypeRaw, versionA, versionB] = args;
    if (!engineTypeRaw || !versionA || !versionB) {
      console.error(
        "Usage: pnpm eval:drift <engineType> <versionA> <versionB> [--json]",
      );
      process.exit(1);
    }
    const engineType = engineTypeRaw as EngineType;
    const fixtures = loadFixtures(engineType) as Fixture<unknown, unknown>[];
    const scorer = SCORERS[engineType];
    const engine = makePassthroughEngine(fixtures);
    const runA = await runEval(fixtures, engine, scorer, {
      fixtureSetName: `${engineType}-seed`,
      promptVersion: versionA,
    });
    // Re-run with versionB using same passthrough - in real use the engine
    // would resolve different prompt versions to different completions.
    const engineB = makePassthroughEngine(fixtures);
    const runB = await runEval(fixtures, engineB, scorer, {
      fixtureSetName: `${engineType}-seed`,
      promptVersion: versionB,
    });
    const drift = detectDrift(runA, runB);
    if (jsonMode) {
      console.log(JSON.stringify(drift, null, 2));
    } else {
      printDriftReport(drift);
    }
    // Exit 0 on improvement/unchanged, 1 on regression (for CI gating).
    process.exit(drift.verdict === "regressed" ? 1 : 0);
  }

  // run mode
  const engineTypeRaw = args[0];
  const promptVersion = args.slice(1).find((a) => !a.startsWith("--"));
  if (!promptVersion) {
    console.error("Usage: pnpm eval <engineType> <promptVersion> [--json]");
    process.exit(1);
  }
  const engineType = engineTypeRaw as EngineType;
  const fixtures = loadFixtures(engineType) as Fixture<unknown, unknown>[];
  const scorer = SCORERS[engineType];
  const engine = makePassthroughEngine(fixtures);
  const result = await runEval(fixtures, engine, scorer, {
    fixtureSetName: `${engineType}-seed`,
    promptVersion,
  });
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanReport(result);
  }
  // Exit 1 if any fixture failed - CI gate
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exit(2);
});
