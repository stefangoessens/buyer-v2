import { describe, it, expect } from "vitest";
import {
  composeOverview,
  buildStatusBadge,
  type OverviewInputs,
  type RawEngineOutput,
  type DealStatus,
} from "@/lib/dealroom/overview";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const mkEngine = (overrides: Partial<RawEngineOutput> = {}): RawEngineOutput => ({
  engineType: "pricing",
  output: JSON.stringify({
    fairValue: { value: 650000 },
    likelyAccepted: { value: 625000 },
    strongOpener: { value: 595000 },
    walkAway: { value: 680000 },
    overallConfidence: 0.85,
    consensusEstimate: 647500,
  }),
  confidence: 0.85,
  reviewState: "approved",
  generatedAt: "2026-04-10T00:00:00.000Z",
  ...overrides,
});

const mkLeverageEngine = (
  overrides: Partial<RawEngineOutput> = {},
): RawEngineOutput => ({
  engineType: "leverage",
  output: JSON.stringify({
    score: 72,
    overallConfidence: 0.78,
    signals: [
      { name: "High DOM", direction: "bullish", delta: 45 },
      { name: "Price reduction", direction: "bullish", delta: 30 },
      { name: "Low DOM", direction: "bearish", delta: -10 },
      { name: "Low leverage", direction: "neutral", delta: 5 },
    ],
  }),
  confidence: 0.78,
  reviewState: "approved",
  generatedAt: "2026-04-10T00:00:00.000Z",
  ...overrides,
});

const mkCostEngine = (
  overrides: Partial<RawEngineOutput> = {},
): RawEngineOutput => ({
  engineType: "cost",
  output: JSON.stringify({
    totalMonthlyMid: 4500,
    totalMonthlyLow: 4200,
    totalMonthlyHigh: 4900,
    totalAnnual: 54000,
    upfrontCosts: { downPayment: 130000 },
  }),
  confidence: 0.9,
  reviewState: "approved",
  generatedAt: "2026-04-10T00:00:00.000Z",
  ...overrides,
});

const mkOfferEngine = (
  overrides: Partial<RawEngineOutput> = {},
): RawEngineOutput => ({
  engineType: "offer",
  output: JSON.stringify({
    scenarios: [
      { name: "Strong opener", price: 595000, competitivenessScore: 90 },
      { name: "Fair value", price: 650000, competitivenessScore: 65 },
    ],
    recommendedIndex: 0,
  }),
  confidence: 0.82,
  reviewState: "approved",
  generatedAt: "2026-04-10T00:00:00.000Z",
  ...overrides,
});

const mkInputs = (overrides: Partial<OverviewInputs> = {}): OverviewInputs => ({
  dealRoomId: "deal_1",
  propertyId: "prop_1",
  dealStatus: "analysis",
  updatedAt: "2026-04-10T00:00:00.000Z",
  engines: [],
  ...overrides,
});

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe("composeOverview — complete payload (happy path)", () => {
  it("returns all sections available when all engines approved", () => {
    const result = composeOverview(
      mkInputs({
        engines: [mkEngine(), mkLeverageEngine(), mkCostEngine(), mkOfferEngine()],
      }),
    );
    expect(result.pricing.status).toBe("available");
    expect(result.leverage.status).toBe("available");
    expect(result.cost.status).toBe("available");
    expect(result.offer.status).toBe("available");
    expect(result.isComplete).toBe(true);
  });

  it("exposes pricing data correctly", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkEngine()] }),
    );
    expect(result.pricing.data?.fairValue).toBe(650000);
    expect(result.pricing.data?.strongOpener).toBe(595000);
    expect(result.pricing.data?.overallConfidence).toBe(0.85);
  });

  it("picks the top 3 leverage signals by absolute delta", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkLeverageEngine()] }),
    );
    expect(result.leverage.data?.topSignals.length).toBe(3);
    expect(result.leverage.data?.topSignals[0].delta).toBe(45);
    expect(result.leverage.data?.topSignals[1].delta).toBe(30);
    expect(result.leverage.data?.topSignals[2].delta).toBe(-10);
  });

  it("projects cost summary into monthly + annual", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkCostEngine()] }),
    );
    expect(result.cost.data?.monthlyMid).toBe(4500);
    expect(result.cost.data?.monthlyRange.low).toBe(4200);
    expect(result.cost.data?.monthlyRange.high).toBe(4900);
    expect(result.cost.data?.annualTotal).toBe(54000);
    expect(result.cost.data?.downPayment).toBe(130000);
  });

  it("picks the recommended offer scenario", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkOfferEngine()] }),
    );
    expect(result.offer.data?.recommendedScenarioName).toBe("Strong opener");
    expect(result.offer.data?.recommendedPrice).toBe(595000);
    expect(result.offer.data?.scenarioCount).toBe(2);
  });
});

describe("composeOverview — partial / empty", () => {
  it("marks pricing unavailable when no pricing engine output", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkLeverageEngine()] }),
    );
    expect(result.pricing.status).toBe("unavailable");
    expect(result.pricing.data).toBe(null);
    expect(result.pricing.reason).toBeTruthy();
    expect(result.isComplete).toBe(false);
  });

  it("returns isComplete=false when any one section is missing", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkEngine(), mkLeverageEngine(), mkCostEngine()] }),
    );
    expect(result.isComplete).toBe(false);
  });

  it("returns all-unavailable overview when no engines provided", () => {
    const result = composeOverview(mkInputs({ engines: [] }));
    expect(result.pricing.status).toBe("unavailable");
    expect(result.leverage.status).toBe("unavailable");
    expect(result.cost.status).toBe("unavailable");
    expect(result.offer.status).toBe("unavailable");
    expect(result.isComplete).toBe(false);
  });
});

describe("composeOverview — pending / rejected review states", () => {
  it("marks a pending-review engine as pending", () => {
    const result = composeOverview(
      mkInputs({
        engines: [mkEngine({ reviewState: "pending" })],
      }),
    );
    expect(result.pricing.status).toBe("pending");
    expect(result.pricing.data).toBe(null);
    expect(result.pricing.confidence).toBe(0.85);
  });

  it("marks a rejected-review engine as unavailable with reason", () => {
    const result = composeOverview(
      mkInputs({
        engines: [mkEngine({ reviewState: "rejected" })],
      }),
    );
    expect(result.pricing.status).toBe("unavailable");
    expect(result.pricing.reason).toContain("rejected");
  });

  it("handles malformed engine output gracefully", () => {
    const result = composeOverview(
      mkInputs({
        engines: [mkEngine({ output: "not valid json" })],
      }),
    );
    expect(result.pricing.status).toBe("unavailable");
    expect(result.pricing.reason).toContain("parsed");
  });
});

describe("composeOverview — multi-version engine de-dup", () => {
  it("picks the most recent engine output per type", () => {
    const older = mkEngine({
      generatedAt: "2026-04-01T00:00:00.000Z",
      output: JSON.stringify({
        fairValue: { value: 600000 },
        likelyAccepted: { value: 580000 },
        strongOpener: { value: 550000 },
        walkAway: { value: 620000 },
        overallConfidence: 0.7,
        consensusEstimate: 598000,
      }),
    });
    const newer = mkEngine({
      generatedAt: "2026-04-10T00:00:00.000Z",
    });
    const result = composeOverview(
      mkInputs({ engines: [older, newer] }),
    );
    expect(result.pricing.data?.fairValue).toBe(650000); // newer value
  });
});

describe("composeOverview — offer override from submitted offer", () => {
  it("uses latestOffer snapshot over engine scenarios", () => {
    const result = composeOverview(
      mkInputs({
        engines: [mkOfferEngine()],
        latestOffer: {
          scenarioName: "Submitted offer",
          price: 610000,
          competitivenessScore: 75,
          scenarioCount: 1,
        },
      }),
    );
    expect(result.offer.data?.recommendedScenarioName).toBe("Submitted offer");
    expect(result.offer.data?.recommendedPrice).toBe(610000);
  });
});

describe("composeOverview — role-based filtering", () => {
  it("strips internal summary for buyers", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkEngine()] }),
      { forRole: "buyer" },
    );
    expect(result.internal).toBeUndefined();
  });

  it("includes internal summary for brokers", () => {
    const result = composeOverview(
      mkInputs({
        engines: [
          mkEngine(),
          mkLeverageEngine({ reviewState: "pending" }),
          mkCostEngine({ reviewState: "approved" }),
        ],
      }),
      { forRole: "broker" },
    );
    expect(result.internal).toBeDefined();
    expect(result.internal?.providedBy).toContain("pricing");
    expect(result.internal?.providedBy).toContain("leverage");
    expect(result.internal?.pendingEngines).toContain("leverage");
  });

  it("includes internal summary for admins", () => {
    const result = composeOverview(
      mkInputs({ engines: [mkEngine()] }),
      { forRole: "admin" },
    );
    expect(result.internal).toBeDefined();
  });

  it("reports lastFullRefreshAt from approved engines only", () => {
    const result = composeOverview(
      mkInputs({
        engines: [
          mkEngine({ generatedAt: "2026-04-10T00:00:00.000Z" }),
          mkLeverageEngine({
            reviewState: "pending",
            generatedAt: "2026-04-12T00:00:00.000Z",
          }),
        ],
      }),
      { forRole: "broker" },
    );
    expect(result.internal?.lastFullRefreshAt).toBe("2026-04-10T00:00:00.000Z");
  });
});

describe("buildStatusBadge", () => {
  const statusesThatNeedLabels: DealStatus[] = [
    "intake",
    "analysis",
    "tour_scheduled",
    "offer_prep",
    "offer_sent",
    "under_contract",
    "closing",
    "closed",
    "withdrawn",
  ];

  it("returns a non-empty label for every deal status", () => {
    for (const status of statusesThatNeedLabels) {
      const badge = buildStatusBadge(status);
      expect(badge.label.length).toBeGreaterThan(0);
      expect(badge.tone).toBeTruthy();
    }
  });

  it("has no nextAction for terminal statuses", () => {
    expect(buildStatusBadge("closed").nextAction).toBe(null);
    expect(buildStatusBadge("withdrawn").nextAction).toBe(null);
  });

  it("marks withdrawn as critical tone", () => {
    expect(buildStatusBadge("withdrawn").tone).toBe("critical");
  });

  it("marks offer_sent as warning (waiting on response)", () => {
    expect(buildStatusBadge("offer_sent").tone).toBe("warning");
  });

  it("marks under_contract as positive", () => {
    expect(buildStatusBadge("under_contract").tone).toBe("positive");
  });
});
