import { describe, expect, it } from "vitest";
import {
  formatMatchConfidence,
  formatMatchScore,
  resolveAddressIntakeView,
  type AddressIntakeSnapshot,
} from "@/lib/intake/addressIntake";

function makeSnapshot(
  overrides: Partial<AddressIntakeSnapshot> = {},
): AddressIntakeSnapshot {
  return {
    intakeId: "slg_123",
    sourcePlatform: "manual",
    status: "pending",
    extractedAt: "2026-04-13T12:00:00.000Z",
    canonical: {
      street: "123 Main St",
      city: "Miami",
      state: "FL",
      zip: "33131",
      formatted: "123 Main St, Miami, FL 33131",
    },
    match: {
      confidence: "medium",
      score: 0.82,
      bestMatchId: "prop_1",
      ambiguous: true,
    },
    candidates: [
      {
        propertyId: "prop_1",
        canonical: {
          street: "123 Main St",
          city: "Miami",
          state: "FL",
          zip: "33131",
          formatted: "123 Main St, Miami, FL 33131",
        },
        score: 0.82,
      },
    ],
    ...overrides,
  };
}

describe("resolveAddressIntakeView", () => {
  it("returns loading when the query has not resolved yet", () => {
    expect(resolveAddressIntakeView(undefined)).toEqual({ kind: "loading" });
  });

  it("returns missing when the intake row does not exist", () => {
    expect(resolveAddressIntakeView(null)).toEqual({ kind: "missing" });
  });

  it("returns missing for non-manual intake snapshots", () => {
    expect(
      resolveAddressIntakeView(makeSnapshot({ sourcePlatform: "zillow" })),
    ).toEqual({ kind: "missing" });
  });

  it("returns matched for exact/high-confidence auto-merged results", () => {
    const result = resolveAddressIntakeView(
      makeSnapshot({
        status: "merged",
        propertyId: "prop_9",
        match: {
          confidence: "high",
          score: 0.95,
          bestMatchId: "prop_9",
          ambiguous: false,
        },
      }),
    );

    expect(result).toMatchObject({
      kind: "matched",
      propertyId: "prop_9",
      canonicalFormatted: "123 Main St, Miami, FL 33131",
      confidence: "high",
      score: 0.95,
    });
  });

  it("returns ambiguous when candidates need human review", () => {
    const result = resolveAddressIntakeView(makeSnapshot());

    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toHaveLength(1);
      expect(result.ambiguous).toBe(true);
      expect(result.canonicalFormatted).toBe("123 Main St, Miami, FL 33131");
    }
  });

  it("keeps medium-confidence single-candidate results in the review state", () => {
    const result = resolveAddressIntakeView(
      makeSnapshot({
        match: {
          confidence: "medium",
          score: 0.74,
          bestMatchId: "prop_2",
          ambiguous: false,
        },
      }),
    );

    expect(result.kind).toBe("ambiguous");
  });

  it("returns no_match for failed/manual fallback snapshots", () => {
    const result = resolveAddressIntakeView(
      makeSnapshot({
        status: "failed",
        candidates: [],
        match: {
          confidence: "none",
          score: 0.18,
          bestMatchId: null,
          ambiguous: false,
        },
      }),
    );

    expect(result).toMatchObject({
      kind: "no_match",
      confidence: "none",
      score: 0.18,
      bestMatchId: null,
    });
  });
});

describe("formatMatchConfidence", () => {
  it("maps confidence buckets to UI labels", () => {
    expect(formatMatchConfidence("exact")).toBe("Exact match");
    expect(formatMatchConfidence("high")).toBe("High confidence");
    expect(formatMatchConfidence("medium")).toBe("Needs review");
    expect(formatMatchConfidence("low")).toBe("Low confidence");
    expect(formatMatchConfidence("none")).toBe("No reliable match");
  });
});

describe("formatMatchScore", () => {
  it("renders a rounded percentage", () => {
    expect(formatMatchScore(0.823)).toBe("82%");
    expect(formatMatchScore(1)).toBe("100%");
  });
});
