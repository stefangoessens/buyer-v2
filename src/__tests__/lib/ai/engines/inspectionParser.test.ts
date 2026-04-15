import { describe, it, expect, vi, beforeEach } from "vitest";

const gatewayMock = vi.fn();

vi.mock("@/lib/ai/gateway", () => ({
  gateway: (...args: unknown[]) => gatewayMock(...args),
}));

import {
  parseInspectionText,
  InspectionParseError,
} from "@/lib/ai/engines/inspectionParser";

function ok(content: string, model = "claude-sonnet-4-20250514") {
  return {
    success: true as const,
    data: {
      content,
      usage: {
        inputTokens: 100,
        outputTokens: 200,
        model,
        provider: "anthropic" as const,
        latencyMs: 800,
        estimatedCost: 0.001,
        fallbackUsed: false,
      },
    },
  };
}

function err(message: string) {
  return {
    success: false as const,
    error: { code: "provider_error" as const, message, provider: "anthropic" },
  };
}

const INPUT = {
  redactedText: "HOME INSPECTION REPORT\nFederal Pacific Electric panel observed",
  perPageText: [
    { page: 1, text: "HOME INSPECTION REPORT" },
    { page: 14, text: "Main panel: Federal Pacific Electric Stab-Lok, 200A" },
  ],
  sourceFileName: "inspection.pdf",
};

beforeEach(() => {
  gatewayMock.mockReset();
});

describe("parseInspectionText — happy path", () => {
  it("returns structured output for a general inspection text blob", async () => {
    gatewayMock.mockResolvedValueOnce(
      ok(
        JSON.stringify({
          detectedReportType: "general_inspection",
          reportTypeConfidence: 0.92,
          inspector: {
            name: "Jane Doe",
            licenseNumber: "HI-1234",
            licenseVerificationStatus: "parsed",
            inspectionDate: "2026-03-15",
            propertyAddressFromReport: "123 Main St",
          },
          findings: [
            {
              system: "roof",
              title: "Roof at end of life",
              buyerSeverity: "major_repair",
              buyerFriendlyExplanation:
                "The roof is 18 years old and showing granule loss; insurers may decline coverage.",
              recommendedAction: "Get a roofer quote and request a 4-point inspection.",
              pageReference: "p. 8",
              evidenceQuote: "Asphalt shingles installed 2008, granule loss visible",
              confidence: 0.85,
              llmSuggestedCost: { low: 9000, high: 22000, confidence: 0.8 },
            },
          ],
          facts: {
            roofAgeYears: 18,
            fourPointRecommended: true,
          },
        }),
      ),
    );

    const out = await parseInspectionText(INPUT);
    expect(out.detectedReportType).toBe("general_inspection");
    expect(out.reportTypeConfidence).toBeCloseTo(0.92);
    expect(out.inspector.name).toBe("Jane Doe");
    expect(out.inspector.licenseVerificationStatus).toBe("parsed");
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].system).toBe("roof");
    expect(out.findings[0].buyerSeverity).toBe("major_repair");
    expect(out.findings[0].llmSuggestedCost).toEqual({
      low: 9000,
      high: 22000,
      confidence: 0.8,
    });
    expect(out.facts.roofAgeYears).toBe(18);
    expect(out.facts.fourPointRecommended).toBe(true);
    expect(out.modelId).toBe("claude-sonnet-4-20250514");
  });
});

describe("parseInspectionText — FL red flags", () => {
  it("preserves life_safety severity for FPE panel finding with high confidence", async () => {
    gatewayMock.mockResolvedValueOnce(
      ok(
        JSON.stringify({
          detectedReportType: "general_inspection",
          reportTypeConfidence: 0.9,
          inspector: {
            name: null,
            licenseNumber: null,
            licenseVerificationStatus: "missing",
            inspectionDate: null,
            propertyAddressFromReport: null,
          },
          findings: [
            {
              system: "electrical",
              title: "Federal Pacific Electric Stab-Lok panel installed",
              buyerSeverity: "life_safety",
              buyerFriendlyExplanation:
                "FPE Stab-Lok breakers are known to fail to trip and have caused fires.",
              recommendedAction: "Replace panel before closing.",
              pageReference: "p. 14",
              evidenceQuote: "Federal Pacific Electric Stab-Lok",
              confidence: 0.95,
            },
          ],
          facts: { electricalPanelType: "FPE" },
        }),
      ),
    );

    const out = await parseInspectionText(INPUT);
    expect(out.findings[0].buyerSeverity).toBe("life_safety");
    expect(out.findings[0].system).toBe("electrical");
    expect(out.facts.electricalPanelType).toBe("FPE");
  });
});

describe("parseInspectionText — confidence downgrade", () => {
  it("downgrades a low-confidence life_safety finding to major_repair and appends a broker-review suffix", async () => {
    gatewayMock.mockResolvedValueOnce(
      ok(
        JSON.stringify({
          detectedReportType: "general_inspection",
          reportTypeConfidence: 0.7,
          inspector: {
            name: null,
            licenseNumber: null,
            licenseVerificationStatus: "missing",
            inspectionDate: null,
            propertyAddressFromReport: null,
          },
          findings: [
            {
              system: "structural",
              title: "Possible foundation settlement near east wall",
              buyerSeverity: "life_safety",
              buyerFriendlyExplanation:
                "Hairline cracks observed near the east wall may indicate settlement.",
              recommendedAction: "Engage a structural engineer for review.",
              pageReference: "p. 22",
              evidenceQuote: "hairline cracks at east wall",
              confidence: 0.55,
            },
          ],
          facts: {},
        }),
      ),
    );

    const out = await parseInspectionText(INPUT);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].buyerSeverity).toBe("major_repair");
    expect(out.findings[0].buyerFriendlyExplanation).toContain("low-confidence");
    expect(out.findings[0].buyerFriendlyExplanation).toContain("broker should review");
  });
});

describe("parseInspectionText — error paths", () => {
  it("throws InspectionParseError when redactedText is empty", async () => {
    await expect(
      parseInspectionText({ ...INPUT, redactedText: "   ", perPageText: [] }),
    ).rejects.toBeInstanceOf(InspectionParseError);
  });

  it("throws InspectionParseError when gateway fails", async () => {
    gatewayMock.mockResolvedValueOnce(err("rate limited"));
    await expect(parseInspectionText(INPUT)).rejects.toBeInstanceOf(
      InspectionParseError,
    );
  });

  it("throws InspectionParseError on invalid JSON", async () => {
    gatewayMock.mockResolvedValueOnce(ok("not json at all"));
    await expect(parseInspectionText(INPUT)).rejects.toBeInstanceOf(
      InspectionParseError,
    );
  });

  it("throws InspectionParseError on malformed JSON", async () => {
    gatewayMock.mockResolvedValueOnce(ok("{ invalid: json, "));
    await expect(parseInspectionText(INPUT)).rejects.toBeInstanceOf(
      InspectionParseError,
    );
  });
});

describe("parseInspectionText — broker override", () => {
  it("respects reportTypeHint as the detected type", async () => {
    gatewayMock.mockResolvedValueOnce(
      ok(
        JSON.stringify({
          detectedReportType: "general_inspection",
          reportTypeConfidence: 0.88,
          inspector: {
            name: null,
            licenseNumber: null,
            licenseVerificationStatus: "missing",
            inspectionDate: null,
            propertyAddressFromReport: null,
          },
          findings: [],
          facts: {},
        }),
      ),
    );

    const out = await parseInspectionText({
      ...INPUT,
      reportTypeHint: "four_point",
    });
    expect(out.detectedReportType).toBe("four_point");
  });
});
