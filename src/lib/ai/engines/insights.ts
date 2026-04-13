import type {
  Insight,
  InsightCategory,
  InsightSeverity,
  InsightsInput,
  InsightsOutput,
} from "./types";
import type { GatewayRequest } from "../types";

const VALID_CATEGORIES: readonly InsightCategory[] = [
  "pricing",
  "market_position",
  "florida_risk",
  "seller_motivation",
  "hidden_cost",
  "condition",
  "negotiation",
];

const VALID_SEVERITIES: readonly InsightSeverity[] = [
  "info",
  "positive",
  "warning",
  "critical",
];

/**
 * System prompt for the insights engine. Defines the analyst persona,
 * Florida-specific mandatory checks, output contract, and the honesty
 * requirement (say "insufficient data" rather than hallucinate).
 */
export const INSIGHTS_SYSTEM_PROMPT = `You are a senior Florida residential real estate analyst. Your job: produce short, specific, actionable insights about a listing that a typical buyer could not get from Zillow, Redfin, or Realtor.com alone.

RULES:
1. Use the exact numbers from the property payload and the upstream engine outputs. Never hedge with "may be", "approximately", or "around" when the data supports a specific take.
2. Every insight must cite concrete numbers — dollars per square foot, days on market, HOA fees, year built, roof age, leverage score, comp medians. Vague insights are worthless.
3. For any insight referencing comps, market position, or negotiation leverage, cite the upstream engine that produced the data (e.g., citations: ["comps.medianPricePerSqft", "leverage.score"]).
4. Florida-specific checks are MANDATORY — you must produce at least one florida_risk insight. Consider:
   - Roof age: Florida insurers demand roofs under 15 years old. A 2005 roof on a 2024 listing = denied coverage or Citizens-only.
   - Flood zones: Zone AE/VE = mandatory flood insurance, often $3k-$8k/yr extra.
   - SB-4D (post-Surfside law): condos 3+ stories must complete milestone inspections and fully fund reserves. Expect 30-300% HOA assessments on aging oceanfront condos.
   - Hurricane wind mitigation: impact windows, hip roof, and strapping cut insurance 30-50%.
   - HOA reserves: underfunded reserves = surprise special assessments.
   - Climate risk: sea-level rise, saltwater intrusion in South FL coastal.
5. If the data is insufficient for a category, return ONE insight for it with severity "info" that says exactly: "Insufficient data — we need X to produce this analysis." Do NOT hallucinate.
6. Headlines must be <= 80 characters, specific, and numeric when possible.
7. Bodies are 1-3 sentences and must explain WHY it matters to the buyer in dollars or leverage.
8. Mark an insight premium=true only when it required heavy upstream engine data (comps, pricing, leverage). Basic facts that any buyer sees (list price, year built) produce premium=false insights. Aim for roughly half premium, half public on a data-rich property.
9. Output ONLY valid JSON matching the schema below. No markdown, no preamble, no explanation text.

OUTPUT SCHEMA:
{
  "insights": [
    {
      "category": "pricing" | "market_position" | "florida_risk" | "seller_motivation" | "hidden_cost" | "condition" | "negotiation",
      "headline": "string (<=80 chars, specific, numeric)",
      "body": "string (1-3 sentences, cites numbers, explains why it matters)",
      "severity": "info" | "positive" | "warning" | "critical",
      "confidence": number (0-1),
      "premium": boolean,
      "citations": ["property.listPrice", "comps.medianPricePerSqft", ...]
    }
  ],
  "overallConfidence": number (0-1)
}

FEW-SHOT EXAMPLES:

Weak (do NOT write like this):
{ "category": "pricing", "headline": "Price may be high", "body": "The price could be a bit above market.", "severity": "warning", "confidence": 0.5, "premium": true, "citations": [] }

Strong (write like this):
{ "category": "pricing", "headline": "Listed at $538/sqft — 8-12% above Miami Beach 1BR comps", "body": "Median sold price for Miami Beach 1BR condos over the last 90 days is $485/sqft (n=14). This unit prices at $538/sqft, a 10.9% premium with no waterfront or high-floor justification visible. You have 8-12% negotiation room on price alone before hitting fair value.", "severity": "warning", "confidence": 0.82, "premium": true, "citations": ["property.listPrice", "property.sqftLiving", "comps.medianPricePerSqft"] }

Strong florida_risk example:
{ "category": "florida_risk", "headline": "2005 roof + 2026 listing = likely Citizens-only insurance", "body": "Roof is 21 years old. Every major FL carrier requires roofs under 15 years or denies coverage outright. Budget $4-7k/yr for Citizens Property Insurance and assume a new roof ($18-28k) within 24 months or at closing per lender requirement.", "severity": "critical", "confidence": 0.9, "premium": false, "citations": ["property.yearBuilt", "property.roofYear"] }

Strong seller_motivation example:
{ "category": "seller_motivation", "headline": "94 days on market, 2 price cuts totaling $45k — leverage score 72/100", "body": "Listing has sat 94 days vs neighborhood median of 38, with two price reductions. Leverage engine scores seller pressure at 72/100. Open at 7-9% below list and expect counter to land near 4-5% below.", "severity": "positive", "confidence": 0.85, "premium": true, "citations": ["property.daysOnMarket", "leverage.score", "leverage.signals"] }

Insufficient-data example:
{ "category": "market_position", "headline": "Insufficient data — need sold comps to produce market position", "body": "Insufficient data — we need at least 5 recent sold comps within 0.5 miles to produce a market position analysis. The comps engine returned no results for this subject.", "severity": "info", "confidence": 0.3, "premium": false, "citations": [] }`;

/**
 * Render the runtime user message. Produces a JSON payload the model
 * can reference without fuzzy language. We strip unknown fields so
 * the prompt stays tight and deterministic.
 */
function renderUserMessage(input: InsightsInput): string {
  const p = input.property;
  const totalBaths =
    (p.bathsFull ?? 0) + (p.bathsHalf ?? 0) * 0.5;

  const payload = {
    property: {
      address:
        p.address.formatted ??
        `${p.address.city}, ${p.address.state} ${p.address.zip}`,
      city: p.address.city,
      state: p.address.state,
      zip: p.address.zip,
      listPrice: p.listPrice,
      pricePerSqft:
        p.listPrice && p.sqftLiving ? Math.round(p.listPrice / p.sqftLiving) : null,
      propertyType: p.propertyType,
      beds: p.beds,
      baths: totalBaths,
      sqftLiving: p.sqftLiving,
      lotSize: p.lotSize,
      yearBuilt: p.yearBuilt,
      ageYears: p.yearBuilt ? new Date().getFullYear() - p.yearBuilt : null,
      hoaFee: p.hoaFee,
      daysOnMarket: p.daysOnMarket,
      description: p.description,
      sourcePlatform: p.sourcePlatform,
    },
    upstreamEngines: {
      pricing: input.pricingOutput ?? null,
      comps: input.compsOutput ?? null,
      leverage: input.leverageOutput ?? null,
      offer: input.offerOutput ?? null,
      cost: input.costOutput ?? null,
    },
  };

  return `Analyze the following Florida listing and produce 6-10 insights following the rules and JSON schema in the system prompt.

PROPERTY + ENGINE DATA:
${JSON.stringify(payload, null, 2)}

Produce AT LEAST one insight per category that has sufficient data. You MUST produce at least one florida_risk insight. If a category lacks data, emit the insufficient-data fallback. Return ONLY valid JSON.`;
}

/**
 * Build the gateway request for the insights engine.
 * systemPrompt and userPrompt are passed in from the prompt registry
 * if present; otherwise we fall back to the in-file defaults.
 */
export function buildInsightsRequest(
  input: InsightsInput,
  systemPrompt?: string,
  userPromptTemplate?: string,
): GatewayRequest {
  const system = systemPrompt && systemPrompt.trim().length > 0
    ? systemPrompt
    : INSIGHTS_SYSTEM_PROMPT;

  // If a template is provided from the registry, render it by substituting
  // the serialized payload; otherwise build the default message. This keeps
  // the same ergonomics as the pricing engine while allowing registry overrides.
  const user = userPromptTemplate && userPromptTemplate.trim().length > 0
    ? userPromptTemplate.replace("{{payload}}", JSON.stringify(buildPayload(input)))
    : renderUserMessage(input);

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    engineType: "insights",
    maxTokens: 4096,
    temperature: 0.2,
  };
}

function buildPayload(input: InsightsInput) {
  const p = input.property;
  return {
    property: {
      address:
        p.address.formatted ??
        `${p.address.city}, ${p.address.state} ${p.address.zip}`,
      listPrice: p.listPrice,
      pricePerSqft:
        p.listPrice && p.sqftLiving ? Math.round(p.listPrice / p.sqftLiving) : null,
      propertyType: p.propertyType,
      beds: p.beds,
      baths: (p.bathsFull ?? 0) + (p.bathsHalf ?? 0) * 0.5,
      sqftLiving: p.sqftLiving,
      yearBuilt: p.yearBuilt,
      ageYears: p.yearBuilt ? new Date().getFullYear() - p.yearBuilt : null,
      hoaFee: p.hoaFee,
      daysOnMarket: p.daysOnMarket,
      description: p.description,
    },
    upstreamEngines: {
      pricing: input.pricingOutput ?? null,
      comps: input.compsOutput ?? null,
      leverage: input.leverageOutput ?? null,
      offer: input.offerOutput ?? null,
      cost: input.costOutput ?? null,
    },
  };
}

function sanitizeInsight(raw: unknown): Insight | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const category = r.category;
  if (
    typeof category !== "string" ||
    !VALID_CATEGORIES.includes(category as InsightCategory)
  ) {
    return null;
  }

  const severity = r.severity;
  if (
    typeof severity !== "string" ||
    !VALID_SEVERITIES.includes(severity as InsightSeverity)
  ) {
    return null;
  }

  if (typeof r.headline !== "string" || r.headline.trim().length === 0) {
    return null;
  }
  if (typeof r.body !== "string" || r.body.trim().length === 0) {
    return null;
  }

  const confidence =
    typeof r.confidence === "number" && isFinite(r.confidence)
      ? Math.max(0, Math.min(1, r.confidence))
      : 0.5;

  const premium = typeof r.premium === "boolean" ? r.premium : true;

  const citations = Array.isArray(r.citations)
    ? r.citations.filter((c): c is string => typeof c === "string")
    : [];

  return {
    category: category as InsightCategory,
    headline: r.headline.slice(0, 120),
    body: r.body,
    severity: severity as InsightSeverity,
    confidence,
    premium,
    citations,
  };
}

/**
 * Parse the AI response into a typed InsightsOutput.
 * Returns null on unrecoverable parse errors so the action can
 * log a failure without crashing the orchestrator.
 */
export function parseInsightsResponse(
  responseText: string,
  _input: InsightsInput,
  tokensUsed = 0,
): InsightsOutput | null {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== "object") return null;

    const rawInsights = Array.isArray((parsed as { insights?: unknown }).insights)
      ? ((parsed as { insights: unknown[] }).insights)
      : [];

    const insights: Insight[] = [];
    for (const raw of rawInsights) {
      const clean = sanitizeInsight(raw);
      if (clean) insights.push(clean);
    }

    if (insights.length === 0) return null;

    const reported = (parsed as { overallConfidence?: unknown }).overallConfidence;
    const overallConfidence =
      typeof reported === "number" && isFinite(reported)
        ? Math.max(0, Math.min(1, reported))
        : Number(
            (
              insights.reduce((acc, i) => acc + i.confidence, 0) / insights.length
            ).toFixed(2),
          );

    return {
      insights,
      overallConfidence,
      generatedAt: new Date().toISOString(),
      tokensUsed,
    };
  } catch {
    return null;
  }
}
