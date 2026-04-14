import type { GatewayRequest } from "../types";

export interface CrawlSynthesizerInput {
  propertyId: string;
  property: {
    listPrice: number | null;
    address: { city: string; state: string; zip: string; formatted?: string };
    propertyType: string | null;
    beds: number | null;
    bathsFull: number | null;
    bathsHalf: number | null;
    sqftLiving: number | null;
    yearBuilt: number | null;
    daysOnMarket: number | null;
    zestimate: number | null;
    redfinEstimate: number | null;
    femaFloodZone: string | null;
    femaBaseFloodElevation: number | null;
    femaFloodInsuranceRequired: boolean | null;
  };
  pricingOutput?: unknown;
  insightsOutput?: unknown;
}

export type CrawlSynthesizerCategory =
  | "valuation"
  | "climate"
  | "negotiation"
  | "ownership"
  | "compliance";

export type CrawlSynthesizerSeverity =
  | "info"
  | "positive"
  | "warning"
  | "critical";

export type CrawlSynthesizerSource =
  | "zestimate"
  | "redfin_estimate"
  | "fema"
  | "mls"
  | "pricing_engine"
  | "insights_engine";

export interface CrawlSynthesizerCitation {
  source: CrawlSynthesizerSource;
  ref: string;
}

export interface SynthesizedInsight {
  category: CrawlSynthesizerCategory;
  severity: CrawlSynthesizerSeverity;
  headline: string;
  body: string;
  confidence: number;
  citations: CrawlSynthesizerCitation[];
}

export interface CrawlSynthesizerOutput {
  insights: SynthesizedInsight[];
  overallConfidence: number;
  generatedAt: string;
}

const ALLOWED_CATEGORIES: readonly CrawlSynthesizerCategory[] = [
  "valuation",
  "climate",
  "negotiation",
  "ownership",
  "compliance",
];

const ALLOWED_SEVERITIES: readonly CrawlSynthesizerSeverity[] = [
  "info",
  "positive",
  "warning",
  "critical",
];

const ALLOWED_SOURCES: ReadonlySet<CrawlSynthesizerSource> = new Set<
  CrawlSynthesizerSource
>([
  "zestimate",
  "redfin_estimate",
  "fema",
  "mls",
  "pricing_engine",
  "insights_engine",
]);

export const CRAWL_SYNTHESIZER_SYSTEM_PROMPT = `You are buyer-v2's crawl synthesizer. You receive structured property data (MLS facts, Zestimate, Redfin estimate, FEMA flood zone) plus the outputs of upstream AI engines (pricing, insights) and produce 3-5 cross-referenced synthesized insights for a Florida home buyer.

Each insight must:
- Cross-reference at least 2 sources (cite via the citations array)
- Be specific and numeric where possible (e.g. "list price $699k vs Zestimate $510k = 37% premium")
- Have an honest severity tag (info/positive/warning/critical)
- Have a confidence score 0.0-1.0 reflecting how strong the evidence is

Return ONLY a JSON object with this exact shape:
{
  "insights": [
    {
      "category": "valuation" | "climate" | "negotiation" | "ownership" | "compliance",
      "severity": "info" | "positive" | "warning" | "critical",
      "headline": "...",
      "body": "...",
      "confidence": 0.0-1.0,
      "citations": [{"source": "zestimate|redfin_estimate|fema|mls|pricing_engine|insights_engine", "ref": "..."}]
    }
  ],
  "overallConfidence": 0.0-1.0
}

Do not wrap in markdown fences. Do not add commentary. Just the JSON.`;

export const CRAWL_SYNTHESIZER_USER_TEMPLATE = `Property:
{{property}}

Pricing engine output:
{{pricing}}

Insights engine output:
{{insights}}

Synthesize 3-5 cross-referenced insights now.`;

export function buildCrawlSynthesizerRequest(
  input: CrawlSynthesizerInput,
  systemPromptOverride?: string,
  promptTemplateOverride?: string,
): GatewayRequest {
  const system =
    systemPromptOverride && systemPromptOverride.trim().length > 0
      ? systemPromptOverride
      : CRAWL_SYNTHESIZER_SYSTEM_PROMPT;

  const template =
    promptTemplateOverride && promptTemplateOverride.trim().length > 0
      ? promptTemplateOverride
      : CRAWL_SYNTHESIZER_USER_TEMPLATE;

  const userMessage = template
    .replace("{{property}}", JSON.stringify(input.property, null, 2))
    .replace("{{pricing}}", JSON.stringify(input.pricingOutput ?? null, null, 2))
    .replace(
      "{{insights}}",
      JSON.stringify(input.insightsOutput ?? null, null, 2),
    );

  return {
    engineType: "crawl_synthesizer",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
    maxTokens: 2048,
    temperature: 0.2,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function parseCrawlSynthesizerResponse(
  responseText: string,
  _input: CrawlSynthesizerInput,
): CrawlSynthesizerOutput | null {
  try {
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      insights?: Array<{
        category?: string;
        severity?: string;
        headline?: string;
        body?: string;
        confidence?: number;
        citations?: Array<{ source?: string; ref?: string }>;
      }>;
      overallConfidence?: number;
    };

    if (!parsed.insights || !Array.isArray(parsed.insights)) return null;

    const insights: SynthesizedInsight[] = [];
    for (const raw of parsed.insights) {
      if (typeof raw.headline !== "string" || raw.headline.trim().length === 0) {
        continue;
      }
      if (typeof raw.body !== "string" || raw.body.trim().length === 0) {
        continue;
      }
      if (
        typeof raw.category !== "string" ||
        !ALLOWED_CATEGORIES.includes(raw.category as CrawlSynthesizerCategory)
      ) {
        continue;
      }
      if (
        typeof raw.severity !== "string" ||
        !ALLOWED_SEVERITIES.includes(raw.severity as CrawlSynthesizerSeverity)
      ) {
        continue;
      }

      const confidence =
        typeof raw.confidence === "number" ? clamp01(raw.confidence) : 0.5;

      const citations: CrawlSynthesizerCitation[] = (raw.citations ?? [])
        .filter(
          (c): c is { source: string; ref: string } =>
            typeof c?.source === "string" &&
            typeof c?.ref === "string" &&
            ALLOWED_SOURCES.has(c.source as CrawlSynthesizerSource),
        )
        .map((c) => ({
          source: c.source as CrawlSynthesizerSource,
          ref: c.ref,
        }));

      if (citations.length === 0) continue;

      insights.push({
        category: raw.category as CrawlSynthesizerCategory,
        severity: raw.severity as CrawlSynthesizerSeverity,
        headline: raw.headline.slice(0, 120),
        body: raw.body,
        confidence,
        citations,
      });
    }

    if (insights.length === 0) return null;

    const reported = parsed.overallConfidence;
    const overallConfidence =
      typeof reported === "number"
        ? clamp01(reported)
        : insights.reduce((s, i) => s + i.confidence, 0) / insights.length;

    return {
      insights,
      overallConfidence,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
