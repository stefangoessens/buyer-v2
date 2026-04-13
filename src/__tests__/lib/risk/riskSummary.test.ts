import { describe, it, expect } from "vitest";
import {
  composeRiskSummary,
  toBuyerView,
  RISK_CATEGORIES,
  RISK_SEVERITIES,
  RISK_SUMMARY_VERSION,
  type ComposeRiskSummaryInput,
  type FileAnalysisFindingInput,
  type PropertyFactsInput,
  type ManualRiskInput,
} from "@/lib/risk/riskSummary";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

const CURRENT_YEAR = 2028;

function propertyFacts(
  overrides: Partial<PropertyFactsInput> = {},
): PropertyFactsInput {
  return {
    propertyId: "prop_1",
    yearBuilt: 2005,
    roofYear: 2020,
    floodZone: "X",
    ...overrides,
  };
}

function finding(
  overrides: Partial<FileAnalysisFindingInput> = {},
): FileAnalysisFindingInput {
  return {
    id: "f_1",
    rule: "roof_age_insurability",
    severity: "medium",
    label: "Roof age medium",
    summary: "Summary text",
    confidence: 0.85,
    requiresReview: false,
    resolved: false,
    ...overrides,
  };
}

function manualRisk(
  overrides: Partial<ManualRiskInput> = {},
): ManualRiskInput {
  return {
    id: "m_1",
    category: "financial",
    severity: "low",
    title: "Manual risk",
    buyerSummary: "Buyer summary",
    internalDetail: "Internal note",
    source: "manual_broker",
    confidence: 0.9,
    ...overrides,
  };
}

function input(overrides: Partial<ComposeRiskSummaryInput> = {}): ComposeRiskSummaryInput {
  return {
    propertyFacts: propertyFacts(),
    fileFindings: [],
    manualRisks: [],
    currentYear: CURRENT_YEAR,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Empty / no-risk path
// ───────────────────────────────────────────────────────────────────────────

describe("composeRiskSummary — no-risk path", () => {
  it("returns empty summary with no inputs", () => {
    const summary = composeRiskSummary({
      fileFindings: [],
      currentYear: CURRENT_YEAR,
    });
    expect(summary.risks).toEqual([]);
    expect(summary.worstSeverity).toBe("info");
    expect(summary.reviewRequiredCount).toBe(0);
    expect(summary.overallConfidence).toBe(1.0);
    expect(summary.composerVersion).toBe(RISK_SUMMARY_VERSION);
  });

  it("returns zero totals when no risks", () => {
    const summary = composeRiskSummary({
      fileFindings: [],
      currentYear: CURRENT_YEAR,
    });
    expect(summary.totals).toEqual({
      info: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    });
  });

  it("benign property facts produce minimal risks", () => {
    // New roof, X zone, modern construction
    const summary = composeRiskSummary(
      input({
        propertyFacts: propertyFacts({
          roofYear: 2025,
          floodZone: "X",
          yearBuilt: 2015,
          impactWindows: true,
        }),
      }),
    );
    // Should only have the X-zone low risk, no critical/high risks
    expect(summary.worstSeverity).not.toBe("critical");
    expect(summary.worstSeverity).not.toBe("high");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Property facts → risks
// ───────────────────────────────────────────────────────────────────────────

describe("composeRiskSummary — property facts", () => {
  it("flags old roof as critical", () => {
    const summary = composeRiskSummary(
      input({ propertyFacts: propertyFacts({ roofYear: 2005 }) }),
    );
    const roof = summary.risks.find((r) =>
      r.id.startsWith("property_roof_age"),
    );
    expect(roof?.severity).toBe("critical");
    expect(roof?.reviewState).toBe("review_required");
    expect(roof?.category).toBe("insurance");
  });

  it("flags 15-19yo roof as high", () => {
    const summary = composeRiskSummary(
      input({ propertyFacts: propertyFacts({ roofYear: 2011 }) }),
    );
    const roof = summary.risks.find((r) =>
      r.id.startsWith("property_roof_age"),
    );
    expect(roof?.severity).toBe("high");
  });

  it("flags AE flood zone as high", () => {
    const summary = composeRiskSummary(
      input({ propertyFacts: propertyFacts({ floodZone: "AE" }) }),
    );
    const flood = summary.risks.find((r) =>
      r.id.startsWith("property_flood_zone"),
    );
    expect(flood?.severity).toBe("high");
    expect(flood?.category).toBe("flood");
  });

  it("flags pre-1994 construction without wind mitigation as medium", () => {
    const summary = composeRiskSummary(
      input({
        propertyFacts: propertyFacts({
          yearBuilt: 1985,
          impactWindows: false,
          stormShutters: false,
        }),
      }),
    );
    const wind = summary.risks.find((r) =>
      r.id.startsWith("property_wind_mitigation"),
    );
    expect(wind?.severity).toBe("medium");
    expect(wind?.category).toBe("structural");
  });

  it("does NOT flag pre-1994 construction WITH impact windows", () => {
    const summary = composeRiskSummary(
      input({
        propertyFacts: propertyFacts({
          yearBuilt: 1985,
          impactWindows: true,
        }),
      }),
    );
    const wind = summary.risks.find((r) =>
      r.id.startsWith("property_wind_mitigation"),
    );
    expect(wind).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// File findings → risks
// ───────────────────────────────────────────────────────────────────────────

describe("composeRiskSummary — file findings", () => {
  it("maps file finding to correct category", () => {
    const summary = composeRiskSummary({
      fileFindings: [
        finding({ id: "f1", rule: "lien_or_encumbrance", severity: "critical" }),
        finding({ id: "f2", rule: "hoa_reserves_adequate", severity: "high" }),
      ],
      currentYear: CURRENT_YEAR,
    });
    const lien = summary.risks.find((r) => r.id === "file_lien_or_encumbrance_f1");
    const hoa = summary.risks.find((r) => r.id === "file_hoa_reserves_adequate_f2");
    expect(lien?.category).toBe("title");
    expect(hoa?.category).toBe("hoa");
  });

  it("marks unresolved review-required findings as review_required", () => {
    const summary = composeRiskSummary({
      fileFindings: [
        finding({
          id: "f1",
          requiresReview: true,
          resolved: false,
        }),
      ],
      currentYear: CURRENT_YEAR,
    });
    expect(summary.risks[0].reviewState).toBe("review_required");
  });

  it("marks resolved findings as resolved regardless of requiresReview", () => {
    const summary = composeRiskSummary({
      fileFindings: [
        finding({
          id: "f1",
          requiresReview: true,
          resolved: true,
          resolutionNotes: "Broker confirmed",
        }),
      ],
      currentYear: CURRENT_YEAR,
    });
    expect(summary.risks[0].reviewState).toBe("resolved");
    expect(summary.risks[0].internalDetail).toBe("Broker confirmed");
  });

  it("marks non-review findings as final", () => {
    const summary = composeRiskSummary({
      fileFindings: [
        finding({ id: "f1", requiresReview: false, resolved: false }),
      ],
      currentYear: CURRENT_YEAR,
    });
    expect(summary.risks[0].reviewState).toBe("final");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Mixed risks from multiple sources
// ───────────────────────────────────────────────────────────────────────────

describe("composeRiskSummary — mixed risks", () => {
  const mixedInput: ComposeRiskSummaryInput = {
    propertyFacts: propertyFacts({ roofYear: 2005, floodZone: "AE" }),
    fileFindings: [
      finding({
        id: "f1",
        rule: "lien_or_encumbrance",
        severity: "critical",
        requiresReview: true,
        resolved: false,
      }),
      finding({
        id: "f2",
        rule: "permit_irregularity",
        severity: "medium",
      }),
    ],
    manualRisks: [manualRisk({ severity: "low" })],
    currentYear: CURRENT_YEAR,
  };

  it("aggregates risks from property, file, and manual sources", () => {
    const summary = composeRiskSummary(mixedInput);
    const sources = new Set(summary.risks.map((r) => r.source));
    expect(sources.has("property_facts")).toBe(true);
    expect(sources.has("file_analysis")).toBe(true);
    expect(sources.has("manual_broker")).toBe(true);
  });

  it("computes worst severity across all sources", () => {
    const summary = composeRiskSummary(mixedInput);
    expect(summary.worstSeverity).toBe("critical");
  });

  it("counts review_required correctly", () => {
    const summary = composeRiskSummary(mixedInput);
    // roof (critical→review_required) + flood AE (high→review_required) + lien (critical→review_required)
    expect(summary.reviewRequiredCount).toBeGreaterThanOrEqual(3);
  });

  it("computes totals per severity", () => {
    const summary = composeRiskSummary(mixedInput);
    expect(summary.totals.critical).toBeGreaterThanOrEqual(2); // roof + lien
    expect(summary.totals.high).toBeGreaterThanOrEqual(1); // flood
    expect(summary.totals.medium).toBeGreaterThanOrEqual(1); // permit
    expect(summary.totals.low).toBeGreaterThanOrEqual(1); // manual
  });

  it("is deterministic — same inputs yield identical output", () => {
    const a = composeRiskSummary(mixedInput);
    const b = composeRiskSummary(mixedInput);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Buyer view filtering
// ───────────────────────────────────────────────────────────────────────────

describe("toBuyerView", () => {
  it("strips internal detail from risks", () => {
    const summary = composeRiskSummary({
      fileFindings: [
        finding({
          id: "f1",
          resolutionNotes: "SECRET BROKER NOTE",
          resolved: true,
        }),
      ],
      currentYear: CURRENT_YEAR,
    });
    const buyerView = toBuyerView(summary);
    expect(buyerView).toHaveLength(1);
    // Internal detail should not appear anywhere in the buyer view
    const serialized = JSON.stringify(buyerView);
    expect(serialized).not.toContain("SECRET BROKER NOTE");
  });

  it("preserves severity, category, and review state", () => {
    const summary = composeRiskSummary({
      fileFindings: [
        finding({
          id: "f1",
          rule: "lien_or_encumbrance",
          severity: "critical",
          requiresReview: true,
        }),
      ],
      currentYear: CURRENT_YEAR,
    });
    const buyerView = toBuyerView(summary);
    expect(buyerView[0].severity).toBe("critical");
    expect(buyerView[0].category).toBe("title");
    expect(buyerView[0].reviewState).toBe("review_required");
  });

  it("returns empty buyer view for empty summary", () => {
    const summary = composeRiskSummary({
      fileFindings: [],
      currentYear: CURRENT_YEAR,
    });
    expect(toBuyerView(summary)).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Confidence aggregation
// ───────────────────────────────────────────────────────────────────────────

describe("confidence aggregation", () => {
  it("uses min confidence across all risks", () => {
    const summary = composeRiskSummary({
      fileFindings: [
        finding({ id: "f1", confidence: 0.9 }),
        finding({ id: "f2", confidence: 0.6 }),
        finding({ id: "f3", confidence: 0.8 }),
      ],
      currentYear: CURRENT_YEAR,
    });
    expect(summary.overallConfidence).toBe(0.6);
  });

  it("returns 1.0 when no risks", () => {
    const summary = composeRiskSummary({
      fileFindings: [],
      currentYear: CURRENT_YEAR,
    });
    expect(summary.overallConfidence).toBe(1.0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("RISK_CATEGORIES has 8 entries", () => {
    expect(RISK_CATEGORIES).toHaveLength(8);
    expect(RISK_CATEGORIES).toContain("insurance");
    expect(RISK_CATEGORIES).toContain("flood");
    expect(RISK_CATEGORIES).toContain("hoa");
    expect(RISK_CATEGORIES).toContain("title");
  });

  it("RISK_SEVERITIES has 5 entries", () => {
    expect(RISK_SEVERITIES).toHaveLength(5);
  });
});
