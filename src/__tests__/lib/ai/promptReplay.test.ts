import { describe, expect, it, vi } from "vitest";
import {
  compareReplaySnapshots,
  replayPromptExecution,
  type GatewayInvoker,
} from "@/lib/ai/promptReplay";

describe("replayPromptExecution", () => {
  it("replays deterministic offer outputs from a stored input snapshot", async () => {
    const invokeGateway: GatewayInvoker = vi
      .fn()
      .mockRejectedValue(new Error("gateway should not be called"));

    const result = await replayPromptExecution({
      prompt: {
        engineType: "offer",
        promptKey: "default",
        version: "v-offer",
        prompt: "unused deterministic prompt",
        model: "deterministic-v1",
      },
      inputSnapshot: JSON.stringify({
        listPrice: 500_000,
        fairValue: 485_000,
        leverageScore: 62,
        competingOffers: 2,
      }),
      invokeGateway,
    });

    expect(result.promptVersion).toBe("v-offer");
    expect(result.modelId).toBe("deterministic-v1");
    expect(JSON.parse(result.outputSnapshot).scenarios).toHaveLength(3);
    expect(invokeGateway).not.toHaveBeenCalled();
  });

  it("replays pricing outputs against an explicitly versioned prompt", async () => {
    const invokeGateway: GatewayInvoker = vi.fn().mockResolvedValue({
      success: true,
      data: {
        content: JSON.stringify({
          fairValue: 480_000,
          likelyAccepted: 490_000,
          strongOpener: 470_000,
          walkAway: 460_000,
        }),
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          model: "claude-sonnet-4-20250514",
          provider: "anthropic",
          latencyMs: 100,
          estimatedCost: 0.01,
          fallbackUsed: false,
        },
      },
    });

    const result = await replayPromptExecution({
      prompt: {
        engineType: "pricing",
        promptKey: "default",
        version: "v-pricing",
        prompt: "Fair value for {{address}} is ...",
        systemPrompt: "Return JSON only.",
        model: "claude-sonnet-4-20250514",
      },
      inputSnapshot: JSON.stringify({
        propertyId: "property-1",
        listPrice: 500_000,
        address: "123 Main St",
        beds: 3,
        baths: 2,
        sqft: 1_800,
        yearBuilt: 2015,
        propertyType: "Condo",
        zestimate: 490_000,
        redfinEstimate: 500_000,
      }),
      invokeGateway,
    });

    const parsed = JSON.parse(result.outputSnapshot);
    expect(result.promptVersion).toBe("v-pricing");
    expect(result.modelId).toBe("claude-sonnet-4-20250514");
    expect(parsed.fairValue.value).toBe(480_000);
    expect(result.citations).toEqual(["zillow", "redfin"]);
  });
});

describe("compareReplaySnapshots", () => {
  it("reports changed, added, and removed paths for structured output", () => {
    const comparison = compareReplaySnapshots(
      JSON.stringify({
        summary: { score: 62, confidence: 0.7 },
        signals: [{ name: "dom", delta: 15 }, { name: "cuts", delta: 2 }],
      }),
      JSON.stringify({
        summary: { score: 68, confidence: 0.7, label: "stronger" },
        signals: [{ name: "dom", delta: 10 }],
      }),
    );

    expect(comparison.identical).toBe(false);
    expect(comparison.changedPaths).toContain("summary.score");
    expect(comparison.addedPaths).toContain("summary.label");
    expect(comparison.removedPaths).toContain("signals[1]");
  });

  it("treats byte-identical snapshots as unchanged", () => {
    const snapshot = JSON.stringify({
      scenarios: [{ name: "Balanced", price: 500_000 }],
    });

    expect(compareReplaySnapshots(snapshot, snapshot)).toEqual({
      identical: true,
      changedPaths: [],
      addedPaths: [],
      removedPaths: [],
      changedPathCount: 0,
      addedPathCount: 0,
      removedPathCount: 0,
    });
  });
});
