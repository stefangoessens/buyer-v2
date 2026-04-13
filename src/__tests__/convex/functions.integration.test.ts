import { describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test/convex";
import { runCostEngine } from "../../../convex/engines/cost";
import { check } from "../../../convex/health";
import { submitUrl } from "../../../convex/intake";

type RegisteredFunction<TCtx, TArgs, TResult> = {
  _handler: (ctx: TCtx, args: TArgs) => Promise<TResult> | TResult;
};

describe("Convex function integration harness", () => {
  it("executes a public query through the registered handler", async () => {
    const before = Date.now();
    const result = await (
      check as unknown as RegisteredFunction<
        Record<string, never>,
        Record<string, never>,
        {
          status: "ok";
          timestamp: number;
        }
      >
    )._handler({}, {});
    const after = Date.now();

    expect(result.status).toBe("ok");
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  it("executes a public mutation against a mocked Convex db", async () => {
    const existingId = "sourceListings:1";
    const { db, getTable } = createMockDb({
      sourceListings: [
        {
          _id: existingId,
          sourcePlatform: "zillow",
          sourceUrl:
            "https://www.zillow.com/homedetails/100-Las-Olas-Blvd-1001-Fort-Lauderdale-FL-33301/12345678_zpid/",
          extractedAt: "2026-04-12T00:00:00Z",
          status: "pending",
        },
      ],
    });

    const existing = await (
      submitUrl as unknown as RegisteredFunction<
        { db: typeof db },
        { url: string },
        { success: boolean; sourceListingId?: string; platform?: string }
      >
    )._handler(
      { db },
      {
        url: "https://www.zillow.com/homedetails/100-Las-Olas-Blvd-1001-Fort-Lauderdale-FL-33301/12345678_zpid/",
      },
    );

    expect(existing).toEqual({
      success: true,
      sourceListingId: existingId,
      platform: "zillow",
    });
    expect(getTable("sourceListings")).toHaveLength(1);

    const inserted = await (
      submitUrl as unknown as RegisteredFunction<
        { db: typeof db },
        { url: string },
        { success: boolean; sourceListingId?: string; platform?: string }
      >
    )._handler(
      { db },
      {
        url: "https://www.redfin.com/FL/Weston/2885-Lakeside-Pl-33326/home/20000002",
      },
    );

    expect(inserted).toMatchObject({
      success: true,
      platform: "redfin",
    });
    expect(getTable("sourceListings")).toHaveLength(2);
    expect(getTable("sourceListings")[1]).toMatchObject({
      _id: "sourceListings:2",
      sourcePlatform: "redfin",
      status: "pending",
    });
  });

  it("executes a deterministic internal action with mocked query + mutation calls", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      listPrice: 875000,
      taxAnnual: 16500,
      hoaFee: 850,
      hoaFrequency: "monthly",
      roofYear: 2021,
      yearBuilt: 2018,
      impactWindows: true,
      stormShutters: false,
      constructionType: "CBS",
      floodZone: "X",
    });
    const runMutation = vi.fn().mockResolvedValue("aiEngineOutputs:1");

    const result = await (
      runCostEngine as unknown as RegisteredFunction<
        {
          runQuery: typeof runQuery;
          runMutation: typeof runMutation;
        },
        { propertyId: string },
        string | null
      >
    )._handler(
      {
        runQuery,
        runMutation,
      },
      { propertyId: "properties:1" },
    );

    expect(result).toBe("aiEngineOutputs:1");
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({
      propertyId: "properties:1",
      engineType: "cost",
      confidence: 0.75,
      modelId: "deterministic-v1",
    });

    const payload = runMutation.mock.calls[0]?.[1] as { output: string };
    expect(JSON.parse(payload.output)).toMatchObject({
      lineItems: expect.any(Array),
      totalMonthlyMid: expect.any(Number),
      upfrontCosts: expect.objectContaining({
        downPayment: expect.any(Number),
      }),
    });
  });
});
