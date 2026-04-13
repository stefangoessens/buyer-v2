import { describe, it, expect } from "vitest";
import {
  classifyDocument,
  applyFlRiskRules,
  analyzeDocument,
  DOC_TYPES,
  FL_RISK_RULES,
  FINDING_SEVERITIES,
  DOC_PARSER_VERSION,
  type ExtractedFacts,
} from "@/lib/ai/engines/docParser";

const TODAY = "2028-04-12";

// ───────────────────────────────────────────────────────────────────────────
// Classifier
// ───────────────────────────────────────────────────────────────────────────

describe("classifyDocument", () => {
  it("identifies a seller disclosure", () => {
    const text = "SELLER'S PROPERTY DISCLOSURE STATEMENT\nKnown defects: none\nLead-based paint: no";
    const result = classifyDocument(text);
    expect(result.docType).toBe("seller_disclosure");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("identifies an HOA document", () => {
    const text =
      "ORANGE PARK HOMEOWNERS ASSOCIATION\nAnnual Budget: $120,000\nReserve Balance: $45,000\nReserve Study completed 2026";
    const result = classifyDocument(text);
    expect(result.docType).toBe("hoa_document");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("identifies an inspection report", () => {
    const text =
      "HOME INSPECTION REPORT\nInspector License: HI-12345\nDefects noted: 14\nRecommended repairs: roof, HVAC";
    const result = classifyDocument(text);
    expect(result.docType).toBe("inspection_report");
  });

  it("identifies a title commitment", () => {
    const text =
      "TITLE COMMITMENT\nSchedule B — Exceptions from coverage:\n1. Utility easement\n2. HOA lien";
    const result = classifyDocument(text);
    expect(result.docType).toBe("title_commitment");
  });

  it("identifies a survey", () => {
    const text = "BOUNDARY SURVEY\nLegal description: Lot 15, Block 7...";
    const result = classifyDocument(text);
    expect(result.docType).toBe("survey");
  });

  it("falls back to 'other' when no keywords match", () => {
    const text = "This is just a random piece of text without any real estate markers";
    const result = classifyDocument(text);
    expect(result.docType).toBe("other");
  });

  it("prefers the highest-scoring type on ambiguous input", () => {
    const text =
      "SELLER'S PROPERTY DISCLOSURE STATEMENT\nHOA annual budget mentioned here\nKnown defects: yes";
    const result = classifyDocument(text);
    expect(result.docType).toBe("seller_disclosure");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Roof age rule
// ───────────────────────────────────────────────────────────────────────────

describe("applyFlRiskRules — roof age", () => {
  it("emits info for a new roof", () => {
    const findings = applyFlRiskRules(
      { docType: "seller_disclosure", classifierConfidence: 0.9, roofAgeYears: 3 },
      TODAY,
    );
    const roof = findings.find((f) => f.rule === "roof_age_insurability");
    expect(roof?.severity).toBe("info");
    expect(roof?.requiresReview).toBe(false);
  });

  it("emits high severity at 15-19 years", () => {
    const findings = applyFlRiskRules(
      { docType: "seller_disclosure", classifierConfidence: 0.9, roofAgeYears: 17 },
      TODAY,
    );
    const roof = findings.find((f) => f.rule === "roof_age_insurability");
    expect(roof?.severity).toBe("high");
    expect(roof?.requiresReview).toBe(true);
  });

  it("emits critical at 20+ years", () => {
    const findings = applyFlRiskRules(
      { docType: "seller_disclosure", classifierConfidence: 0.9, roofAgeYears: 22 },
      TODAY,
    );
    const roof = findings.find((f) => f.rule === "roof_age_insurability");
    expect(roof?.severity).toBe("critical");
    expect(roof?.requiresReview).toBe(true);
  });

  it("derives age from replacement year if age not stated", () => {
    const findings = applyFlRiskRules(
      {
        docType: "seller_disclosure",
        classifierConfidence: 0.9,
        roofReplacementYear: 2008,
      },
      TODAY,
    );
    const roof = findings.find((f) => f.rule === "roof_age_insurability");
    expect(roof?.severity).toBe("critical"); // 2028 - 2008 = 20 years
  });

  it("skips rule when roof age unknown", () => {
    const findings = applyFlRiskRules(
      { docType: "seller_disclosure", classifierConfidence: 0.9 },
      TODAY,
    );
    const roof = findings.find((f) => f.rule === "roof_age_insurability");
    expect(roof).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HOA reserves rule
// ───────────────────────────────────────────────────────────────────────────

describe("applyFlRiskRules — HOA reserves", () => {
  it("flags inadequate reserves", () => {
    const findings = applyFlRiskRules(
      {
        docType: "hoa_document",
        classifierConfidence: 0.9,
        hoaReserveBalance: 5_000,
        hoaAnnualBudget: 100_000,
      },
      TODAY,
    );
    const hoa = findings.find((f) => f.rule === "hoa_reserves_adequate");
    expect(hoa?.severity).toBe("high");
    expect(hoa?.requiresReview).toBe(true);
  });

  it("passes adequate reserves", () => {
    const findings = applyFlRiskRules(
      {
        docType: "hoa_document",
        classifierConfidence: 0.9,
        hoaReserveBalance: 50_000,
        hoaAnnualBudget: 100_000,
      },
      TODAY,
    );
    const hoa = findings.find((f) => f.rule === "hoa_reserves_adequate");
    expect(hoa?.severity).toBe("low");
    expect(hoa?.requiresReview).toBe(false);
  });

  it("skips rule when reserve data missing", () => {
    const findings = applyFlRiskRules(
      { docType: "hoa_document", classifierConfidence: 0.9 },
      TODAY,
    );
    const hoa = findings.find((f) => f.rule === "hoa_reserves_adequate");
    expect(hoa).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SIRS rule (condo)
// ───────────────────────────────────────────────────────────────────────────

describe("applyFlRiskRules — SIRS", () => {
  it("flags critical when a qualifying building is missing SIRS and milestone", () => {
    const findings = applyFlRiskRules(
      {
        docType: "hoa_document",
        classifierConfidence: 0.9,
        buildingStories: 4,
        buildingYearBuilt: 1985,
      },
      TODAY,
    );
    const sirs = findings.find((f) => f.rule === "sirs_inspection_status");
    expect(sirs?.severity).toBe("critical");
    expect(sirs?.requiresReview).toBe(true);
  });

  it("passes when qualifying building has both inspections completed", () => {
    const findings = applyFlRiskRules(
      {
        docType: "hoa_document",
        classifierConfidence: 0.9,
        buildingStories: 4,
        buildingYearBuilt: 1985,
        milestoneInspectionDate: "2027-10-01",
        sirsCompletedDate: "2027-11-15",
      },
      TODAY,
    );
    const sirs = findings.find((f) => f.rule === "sirs_inspection_status");
    expect(sirs?.severity).toBe("info");
    expect(sirs?.requiresReview).toBe(false);
  });

  it("emits info when building is below SIRS thresholds (too small or too new)", () => {
    const findings = applyFlRiskRules(
      {
        docType: "hoa_document",
        classifierConfidence: 0.9,
        buildingStories: 2,
        buildingYearBuilt: 2015,
      },
      TODAY,
    );
    const sirs = findings.find((f) => f.rule === "sirs_inspection_status");
    expect(sirs?.severity).toBe("info");
    expect(sirs?.requiresReview).toBe(false);
  });

  it("skips rule when building data missing", () => {
    const findings = applyFlRiskRules(
      { docType: "hoa_document", classifierConfidence: 0.9 },
      TODAY,
    );
    const sirs = findings.find((f) => f.rule === "sirs_inspection_status");
    expect(sirs).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Flood zone rule
// ───────────────────────────────────────────────────────────────────────────

describe("applyFlRiskRules — flood zone", () => {
  it("flags AE zone as high risk", () => {
    const findings = applyFlRiskRules(
      { docType: "seller_disclosure", classifierConfidence: 0.9, floodZone: "AE" },
      TODAY,
    );
    const flood = findings.find((f) => f.rule === "flood_zone_risk");
    expect(flood?.severity).toBe("high");
    expect(flood?.requiresReview).toBe(true);
  });

  it("flags VE zone as high risk", () => {
    const findings = applyFlRiskRules(
      { docType: "seller_disclosure", classifierConfidence: 0.9, floodZone: "VE" },
      TODAY,
    );
    const flood = findings.find((f) => f.rule === "flood_zone_risk");
    expect(flood?.severity).toBe("high");
  });

  it("flags X zone as low risk", () => {
    const findings = applyFlRiskRules(
      { docType: "seller_disclosure", classifierConfidence: 0.9, floodZone: "X" },
      TODAY,
    );
    const flood = findings.find((f) => f.rule === "flood_zone_risk");
    expect(flood?.severity).toBe("low");
    expect(flood?.requiresReview).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Permit + lien rules
// ───────────────────────────────────────────────────────────────────────────

describe("applyFlRiskRules — permits", () => {
  it("flags disclosed unpermitted work", () => {
    const findings = applyFlRiskRules(
      {
        docType: "seller_disclosure",
        classifierConfidence: 0.9,
        unpermittedWorkMentioned: true,
      },
      TODAY,
    );
    const permit = findings.find((f) => f.rule === "permit_irregularity");
    expect(permit?.severity).toBe("high");
    expect(permit?.requiresReview).toBe(true);
  });

  it("does not flag when permits are clean", () => {
    const findings = applyFlRiskRules(
      {
        docType: "seller_disclosure",
        classifierConfidence: 0.9,
        permitsDisclosed: "yes",
      },
      TODAY,
    );
    const permit = findings.find((f) => f.rule === "permit_irregularity");
    expect(permit).toBeUndefined();
  });
});

describe("applyFlRiskRules — liens", () => {
  it("flags single lien as high", () => {
    const findings = applyFlRiskRules(
      { docType: "title_commitment", classifierConfidence: 0.9, lienCount: 1 },
      TODAY,
    );
    const lien = findings.find((f) => f.rule === "lien_or_encumbrance");
    expect(lien?.severity).toBe("high");
  });

  it("flags multiple liens as critical", () => {
    const findings = applyFlRiskRules(
      { docType: "title_commitment", classifierConfidence: 0.9, lienCount: 3 },
      TODAY,
    );
    const lien = findings.find((f) => f.rule === "lien_or_encumbrance");
    expect(lien?.severity).toBe("critical");
  });

  it("skips rule when no liens", () => {
    const findings = applyFlRiskRules(
      { docType: "title_commitment", classifierConfidence: 0.9, lienCount: 0 },
      TODAY,
    );
    const lien = findings.find((f) => f.rule === "lien_or_encumbrance");
    expect(lien).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Top-level analyzeDocument
// ───────────────────────────────────────────────────────────────────────────

describe("analyzeDocument", () => {
  it("produces a complete result from full fixtures", () => {
    const result = analyzeDocument({
      text: "SELLER'S PROPERTY DISCLOSURE STATEMENT\nKnown defects: ... lead-based paint",
      extractedFacts: {
        roofAgeYears: 22,
        floodZone: "AE",
      },
      today: TODAY,
    });
    expect(result.docType).toBe("seller_disclosure");
    expect(result.overallSeverity).toBe("critical"); // roof 22 years
    expect(result.requiresBrokerReview).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.engineVersion).toBe(DOC_PARSER_VERSION);
  });

  it("produces no findings when no facts trigger rules", () => {
    const result = analyzeDocument({
      text: "Random text without real estate markers",
      extractedFacts: {},
      today: TODAY,
    });
    expect(result.docType).toBe("other");
    expect(result.findings).toEqual([]);
    expect(result.overallSeverity).toBe("info");
    expect(result.requiresBrokerReview).toBe(false);
  });

  it("aggregates worst severity across findings", () => {
    const result = analyzeDocument({
      text: "HOA homeowners association reserve balance annual budget",
      extractedFacts: {
        hoaReserveBalance: 5_000,
        hoaAnnualBudget: 100_000,
        buildingStories: 4,
        buildingYearBuilt: 1985,
      },
      today: TODAY,
    });
    // SIRS missing = critical, reserves inadequate = high
    expect(result.overallSeverity).toBe("critical");
  });

  it("is deterministic — same inputs yield same outputs", () => {
    const facts: Partial<ExtractedFacts> = {
      roofAgeYears: 18,
      floodZone: "AE",
      lienCount: 1,
    };
    const a = analyzeDocument({
      text: "SELLER'S PROPERTY DISCLOSURE",
      extractedFacts: facts,
      today: TODAY,
    });
    const b = analyzeDocument({
      text: "SELLER'S PROPERTY DISCLOSURE",
      extractedFacts: facts,
      today: TODAY,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("DOC_TYPES has 6 entries", () => {
    expect(DOC_TYPES).toHaveLength(6);
  });
  it("FL_RISK_RULES has 6 rules", () => {
    expect(FL_RISK_RULES).toHaveLength(6);
  });
  it("FINDING_SEVERITIES has 5 levels", () => {
    expect(FINDING_SEVERITIES).toHaveLength(5);
  });
});
