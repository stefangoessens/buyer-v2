import { describe, expect, it } from "vitest";

import { buildPricingRequest } from "@/lib/ai/engines/pricing";
import type { PricingInput, PricingOutput } from "@/lib/ai/engines/types";
import { loadFixtures } from "@/lib/ai/eval/fixtures";
import { runEval } from "@/lib/ai/eval/runner";
import { scorePricing } from "@/lib/ai/eval/scoring";
import type { EngineFunction, Fixture } from "@/lib/ai/eval";

describe("AI eval snapshots", () => {
  it("keeps the pricing eval seed request stable", () => {
    const [fixture] = loadFixtures("pricing") as Array<
      Fixture<PricingInput, PricingOutput>
    >;
    const request = buildPricingRequest(
      fixture.input,
      [
        "Address={{address}}",
        "List={{listPrice}}",
        "Consensus={{consensus}}",
        "Spread={{spread}}",
        "Sources={{sources}}",
      ].join("\n"),
      "system:pricing",
    );

    expect(request).toMatchInlineSnapshot(`
      {
        "engineType": "pricing",
        "maxTokens": 2048,
        "messages": [
          {
            "content": "system:pricing",
            "role": "system",
          },
          {
            "content": "Address=123 Brickell Ave, Miami, FL 33131
      List=650,000
      Consensus=647,500
      Spread=1.2
      Sources=zillow, redfin",
            "role": "user",
          },
        ],
        "temperature": 0,
      }
    `);
  });

  it("keeps the pricing eval seed score report stable", async () => {
    const [fixture] = loadFixtures("pricing") as Array<
      Fixture<PricingInput, PricingOutput>
    >;
    const passthroughEngine: EngineFunction<PricingInput, PricingOutput> =
      async () => fixture.expected;

    const result = await runEval(
      loadFixtures("pricing") as Array<Fixture<PricingInput, PricingOutput>>,
      passthroughEngine,
      scorePricing,
      {
        fixtureSetName: "pricing-seed",
        promptVersion: "snapshot",
      },
    );

    expect({
      ...result,
      durationMs: 0,
      runAt: "<normalized>",
      reports: result.reports.map((report) => ({
        ...report,
        runAt: "<normalized>",
      })),
    }).toMatchInlineSnapshot(`
      {
        "avgScore": 1,
        "durationMs": 0,
        "engineType": "pricing",
        "failed": 0,
        "fixtureSetName": "pricing-seed",
        "maxScore": 1,
        "medianScore": 1,
        "minScore": 1,
        "passed": 1,
        "promptVersion": "snapshot",
        "reports": [
          {
            "details": {
              "avgError": 0,
              "fairValueError": 0,
              "likelyAcceptedError": 0,
              "strongOpenerError": 0,
              "walkAwayError": 0,
            },
            "engineType": "pricing",
            "errors": undefined,
            "fixtureId": "miami-condo-001",
            "passed": true,
            "promptVersion": "snapshot",
            "runAt": "<normalized>",
            "score": 1,
            "threshold": 0.7,
          },
        ],
        "runAt": "<normalized>",
        "totalFixtures": 1,
      }
    `);
  });
});
