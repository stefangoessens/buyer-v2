/**
 * Copilot intent-classification eval harness.
 *
 * Runs a classifier callable (rule-based or LLM) over a fixture set and
 * returns per-fixture + aggregate accuracy. This is deliberately local to
 * the copilot module (not the global eval harness) so we stay in our lane
 * and keep the scoring rules specific to intent classification.
 */

import type { CopilotIntent, IntentClassification } from "./intents";
import { classifyIntentRuleBased } from "./intents";
import { INTENT_FIXTURES, type IntentFixture } from "./fixtures";

export interface FixtureResult {
  fixtureId: string;
  question: string;
  expected: CopilotIntent;
  actual: CopilotIntent;
  confidence: number;
  method: "rule" | "llm" | "fallback";
  passed: boolean;
}

export interface IntentEvalReport {
  total: number;
  correct: number;
  accuracy: number;
  byIntent: Record<CopilotIntent, { expected: number; correct: number }>;
  failures: FixtureResult[];
  results: FixtureResult[];
}

export type ClassifyFn = (
  question: string,
) => IntentClassification | Promise<IntentClassification>;

export const TARGET_ACCURACY = 0.9;

function emptyByIntent(): Record<
  CopilotIntent,
  { expected: number; correct: number }
> {
  return {
    pricing: { expected: 0, correct: 0 },
    comps: { expected: 0, correct: 0 },
    costs: { expected: 0, correct: 0 },
    leverage: { expected: 0, correct: 0 },
    risks: { expected: 0, correct: 0 },
    documents: { expected: 0, correct: 0 },
    offer: { expected: 0, correct: 0 },
    scheduling: { expected: 0, correct: 0 },
    agreement: { expected: 0, correct: 0 },
    other: { expected: 0, correct: 0 },
  };
}

export async function runIntentEval(
  classify: ClassifyFn = classifyIntentRuleBased,
  fixtures: ReadonlyArray<IntentFixture> = INTENT_FIXTURES,
): Promise<IntentEvalReport> {
  if (fixtures.length === 0) {
    throw new Error("runIntentEval: no fixtures provided");
  }
  const results: FixtureResult[] = [];
  const byIntent = emptyByIntent();
  for (const f of fixtures) {
    const classification = await classify(f.question);
    const passed = classification.intent === f.expectedIntent;
    byIntent[f.expectedIntent].expected++;
    if (passed) byIntent[f.expectedIntent].correct++;
    results.push({
      fixtureId: f.id,
      question: f.question,
      expected: f.expectedIntent,
      actual: classification.intent,
      confidence: classification.confidence,
      method: classification.method,
      passed,
    });
  }
  const correct = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    correct,
    accuracy: correct / results.length,
    byIntent,
    failures: results.filter((r) => !r.passed),
    results,
  };
}

export function passesTarget(
  report: IntentEvalReport,
  target: number = TARGET_ACCURACY,
): boolean {
  return report.accuracy >= target;
}
