import { describe, expect, it } from "vitest";
import {
  passesTarget,
  runIntentEval,
  TARGET_ACCURACY,
} from "@/lib/copilot/eval";
import { INTENT_FIXTURES, countByExpected } from "@/lib/copilot/fixtures";
import { classifyIntentRuleBased } from "@/lib/copilot/intents";

describe("runIntentEval", () => {
  it("passes the 90% target with the default rule-based classifier", async () => {
    const report = await runIntentEval();
    expect(report.total).toBe(INTENT_FIXTURES.length);
    expect(report.accuracy).toBeGreaterThanOrEqual(TARGET_ACCURACY);
    expect(passesTarget(report)).toBe(true);
  });

  it("reports every expected fixture count", async () => {
    const report = await runIntentEval();
    const counts = countByExpected();
    for (const intent of Object.keys(counts) as Array<keyof typeof counts>) {
      expect(report.byIntent[intent].expected).toBe(counts[intent]);
    }
  });

  it("accepts a custom classifier callable", async () => {
    const report = await runIntentEval(
      (question: string) => classifyIntentRuleBased(question),
      INTENT_FIXTURES,
    );
    expect(report.total).toBe(INTENT_FIXTURES.length);
  });

  it("flags fixtures where classification is incorrect", async () => {
    const report = await runIntentEval(() => ({
      intent: "pricing" as const,
      confidence: 1,
      method: "rule" as const,
    }));
    expect(report.accuracy).toBeLessThan(TARGET_ACCURACY);
    expect(report.failures.length).toBeGreaterThan(0);
  });

  it("throws on empty fixture set", async () => {
    await expect(runIntentEval(classifyIntentRuleBased, [])).rejects.toThrow(
      /no fixtures/i,
    );
  });
});
