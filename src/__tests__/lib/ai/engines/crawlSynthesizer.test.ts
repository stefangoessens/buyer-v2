import { describe, it, expect } from "vitest";
import {
  buildCrawlSynthesizerRequest,
  parseCrawlSynthesizerResponse,
  type CrawlSynthesizerInput,
} from "@/lib/ai/engines/crawlSynthesizer";

const baseInput: CrawlSynthesizerInput = {
  propertyId: "prop_123",
  property: {
    listPrice: 699000,
    address: {
      city: "Miami Beach",
      state: "FL",
      zip: "33139",
      formatted: "123 Ocean Dr, Miami Beach, FL 33139",
    },
    propertyType: "condo",
    beds: 2,
    bathsFull: 2,
    bathsHalf: 0,
    sqftLiving: 1200,
    yearBuilt: 1998,
    daysOnMarket: 62,
    zestimate: 510000,
    redfinEstimate: 525000,
    femaFloodZone: "AE",
    femaBaseFloodElevation: 8,
    femaFloodInsuranceRequired: true,
  },
  pricingOutput: { fairValue: 540000 },
  insightsOutput: { insights: [{ headline: "62 DOM vs 38 median" }] },
};

describe("buildCrawlSynthesizerRequest", () => {
  it("emits system + user messages with property JSON and engine outputs", () => {
    const req = buildCrawlSynthesizerRequest(baseInput);
    expect(req.engineType).toBe("crawl_synthesizer");
    expect(req.messages).toHaveLength(2);
    expect(req.messages[0].role).toBe("system");
    expect(req.messages[1].role).toBe("user");

    const user = req.messages[1].content;
    expect(user).toContain("699000");
    expect(user).toContain("AE");
    expect(user).toContain("510000");
    expect(user).toContain("fairValue");
    expect(user).toContain("62 DOM vs 38 median");
  });

  it("uses registry overrides when provided", () => {
    const req = buildCrawlSynthesizerRequest(
      baseInput,
      "custom system",
      "custom {{property}} template",
    );
    expect(req.messages[0].content).toBe("custom system");
    expect(req.messages[1].content).toContain("custom ");
    expect(req.messages[1].content).toContain("699000");
  });
});

describe("parseCrawlSynthesizerResponse", () => {
  const validInsight = {
    category: "valuation",
    severity: "warning",
    headline: "Listed 37% above Zestimate",
    body: "List $699k vs Zestimate $510k = 37% premium.",
    confidence: 0.82,
    citations: [
      { source: "zestimate", ref: "Zestimate $510k" },
      { source: "mls", ref: "List price $699k" },
    ],
  };

  it("returns null on malformed JSON", () => {
    expect(parseCrawlSynthesizerResponse("not json at all", baseInput)).toBeNull();
    expect(parseCrawlSynthesizerResponse("{ broken", baseInput)).toBeNull();
  });

  it("strips markdown fences around the JSON blob", () => {
    const wrapped = "```json\n" +
      JSON.stringify({ insights: [validInsight], overallConfidence: 0.8 }) +
      "\n```";
    const result = parseCrawlSynthesizerResponse(wrapped, baseInput);
    expect(result).not.toBeNull();
    expect(result!.insights).toHaveLength(1);
    expect(result!.insights[0].headline).toBe("Listed 37% above Zestimate");
  });

  it("drops insights without any valid citations", () => {
    const payload = {
      insights: [
        { ...validInsight, citations: [] },
        { ...validInsight, citations: [{ source: "made_up", ref: "x" }] },
        validInsight,
      ],
      overallConfidence: 0.7,
    };
    const result = parseCrawlSynthesizerResponse(JSON.stringify(payload), baseInput);
    expect(result).not.toBeNull();
    expect(result!.insights).toHaveLength(1);
    expect(result!.insights[0].citations).toHaveLength(2);
  });

  it("normalizes confidence values into [0,1]", () => {
    const payload = {
      insights: [
        { ...validInsight, confidence: 4.2 },
        { ...validInsight, confidence: -0.9, headline: "Second" },
      ],
      overallConfidence: 99,
    };
    const result = parseCrawlSynthesizerResponse(JSON.stringify(payload), baseInput);
    expect(result).not.toBeNull();
    expect(result!.insights[0].confidence).toBe(1);
    expect(result!.insights[1].confidence).toBe(0);
    expect(result!.overallConfidence).toBe(1);
  });

  it("returns null when no insight survives validation", () => {
    const payload = {
      insights: [
        { ...validInsight, category: "not_a_category" },
        { ...validInsight, severity: "nope" },
      ],
    };
    expect(parseCrawlSynthesizerResponse(JSON.stringify(payload), baseInput)).toBeNull();
  });
});
