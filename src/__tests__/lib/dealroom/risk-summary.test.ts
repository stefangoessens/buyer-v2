import { describe, expect, it } from "vitest";
import {
  composeRiskSummary,
  type RiskMilestoneSnapshot,
  type RiskPropertySnapshot,
  type RiskSummaryInputs,
} from "@/lib/dealroom/risk-summary";

const baseProperty = (
  overrides: Partial<RiskPropertySnapshot> = {},
): RiskPropertySnapshot => ({
  floodZone: "X",
  hoaFee: 0,
  roofYear: 2022,
  yearBuilt: 2022,
  impactWindows: true,
  stormShutters: true,
  ...overrides,
});

const baseMilestone = (
  overrides: Partial<RiskMilestoneSnapshot> = {},
): RiskMilestoneSnapshot => ({
  id: "milestone_1",
  name: "HOA/condo document review",
  workstream: "hoa",
  dueDate: "2026-05-01",
  status: "needs_review",
  flaggedForReview: true,
  reviewReason: "missing_required",
  confidence: 0.42,
  ...overrides,
});

const buildInputs = (
  overrides: Partial<RiskSummaryInputs> = {},
): RiskSummaryInputs => ({
  dealRoomId: "deal_1",
  propertyId: "property_1",
  updatedAt: "2026-04-12T12:00:00.000Z",
  property: baseProperty(),
  milestones: [],
  ...overrides,
});

describe("composeRiskSummary", () => {
  it("returns a clear summary when no typed risks are present", () => {
    const result = composeRiskSummary(buildInputs(), { forRole: "buyer" });

    expect(result.status).toBe("clear");
    expect(result.highestSeverity).toBe(null);
    expect(result.counts).toEqual({
      total: 0,
      low: 0,
      medium: 0,
      high: 0,
      reviewRequired: 0,
    });
    expect(result.items).toEqual([]);
    expect(result.internal).toBeUndefined();
  });

  it("composes mixed canonical-property risks with explicit severity", () => {
    const result = composeRiskSummary(
      buildInputs({
        property: baseProperty({
          floodZone: "AE",
          hoaFee: 450,
          roofYear: 1998,
          impactWindows: false,
          stormShutters: false,
        }),
      }),
      { forRole: "buyer" },
    );

    expect(result.status).toBe("attention");
    expect(result.highestSeverity).toBe("high");
    expect(result.counts).toEqual({
      total: 3,
      low: 1,
      medium: 1,
      high: 1,
      reviewRequired: 0,
    });
    expect(result.items.map((item) => item.name)).toEqual([
      "insurance_bindability",
      "flood_zone_exposure",
      "hoa_constraints",
    ]);
    expect(result.items.every((item) => item.reviewState === "ready")).toBe(true);
  });

  it("marks review-required file-analysis risks for internal roles", () => {
    const result = composeRiskSummary(
      buildInputs({ milestones: [baseMilestone()] }),
      { forRole: "broker" },
    );

    expect(result.status).toBe("review_required");
    expect(result.highestSeverity).toBe("high");
    expect(result.counts).toEqual({
      total: 1,
      low: 0,
      medium: 0,
      high: 1,
      reviewRequired: 1,
    });
    expect(result.items[0]).toMatchObject({
      name: "hoa_document_review",
      source: "file_analysis",
      reviewState: "review_required",
      visibility: "internal",
    });
    expect(result.items[0].internal).toMatchObject({
      sourceRecordType: "contract_milestone",
      sourceRecordId: "milestone_1",
      reviewReason: "missing_required",
    });
    expect(result.internal).toEqual({
      hiddenFromBuyer: 1,
      totalBeforeFiltering: 1,
      sourceCounts: {
        canonical_property: 0,
        file_analysis: 1,
      },
    });
  });

  it("filters internal-only review items out of the buyer-safe variant", () => {
    const inputs = buildInputs({
      property: baseProperty({ floodZone: "AE" }),
      milestones: [baseMilestone()],
    });

    const buyer = composeRiskSummary(inputs, { forRole: "buyer" });
    const internal = composeRiskSummary(inputs, { forRole: "admin" });

    expect(buyer.status).toBe("attention");
    expect(buyer.counts.total).toBe(1);
    expect(buyer.items.map((item) => item.name)).toEqual([
      "flood_zone_exposure",
    ]);
    expect(buyer.items[0].internal).toBeUndefined();
    expect(buyer.internal).toBeUndefined();

    expect(internal.status).toBe("review_required");
    expect(internal.counts.total).toBe(2);
    expect(internal.items.map((item) => item.name)).toEqual([
      "hoa_document_review",
      "flood_zone_exposure",
    ]);
    expect(internal.internal?.hiddenFromBuyer).toBe(1);
  });
});
