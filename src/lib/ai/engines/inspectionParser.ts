/**
 * Inspection parser (KIN-1081) — pure LLM helper.
 *
 * Takes redacted OCR text from a single inspection report and asks
 * Claude to surface every material issue a Florida buyer should know
 * about, with FL-specific red-flag heuristics, plain-English
 * explanations, page citations, and evidence quotes.
 *
 * Mirrors the structure of `disclosureParser.ts`:
 *   - No Convex imports; module is testable in isolation.
 *   - All network I/O goes through src/lib/ai/gateway.ts.
 *   - Buyer-facing severity / system taxonomy is inspection-specific,
 *     NOT the legacy disclosure taxonomy. The orchestrator action maps
 *     buyerSeverity → the shared `severity` enum so the existing
 *     review queue still indexes inspection findings.
 *
 * Cost estimation is OUT of this module — see inspectionCostCalibration.ts.
 * The parser may emit an optional cost hint that the calibration step
 * decides what to do with.
 */
import { gateway } from "../gateway";
import type { GatewayMessage } from "../types";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export const INSPECTION_REPORT_TYPES = [
  "general_inspection",
  "four_point",
  "wind_mitigation",
  "wdo",
  "pool",
  "seawall",
  "dock",
  "sprinkler",
  "septic",
  "other",
] as const;
export type InspectionReportType = (typeof INSPECTION_REPORT_TYPES)[number];

export const INSPECTION_SYSTEMS = [
  "roof",
  "hvac",
  "electrical",
  "plumbing",
  "structural",
  "exterior",
  "interior",
  "grounds",
  "appliances",
  "pest",
] as const;
export type InspectionSystem = (typeof INSPECTION_SYSTEMS)[number];

export const BUYER_SEVERITIES = [
  "life_safety",
  "major_repair",
  "monitor",
  "cosmetic",
] as const;
export type BuyerSeverity = (typeof BUYER_SEVERITIES)[number];

export interface InspectionParserInput {
  redactedText: string;
  perPageText: Array<{ page: number; text: string }>;
  sourceFileName: string;
  reportTypeHint?: InspectionReportType;
  knownContext?: {
    propertyAddress?: string;
    yearBuilt?: number;
    propertyType?: string;
  };
}

export interface InspectionFinding {
  findingKey: string;
  system: InspectionSystem;
  title: string;
  buyerSeverity: BuyerSeverity;
  buyerFriendlyExplanation: string;
  recommendedAction: string;
  pageReference: string | null;
  evidenceQuote: string | null;
  confidence: number;

  // LLM-supplied raw cost hint, kept around so the calibration step can
  // reason about it. Not persisted as-is — calibration decides what to
  // surface to the buyer.
  llmSuggestedCost?: { low: number; high: number; confidence: number };

  // Filled in by inspectionCostCalibration before persistence.
  estimatedCostLowUsd?: number;
  estimatedCostHighUsd?: number;
  costEstimateConfidence?: number;
  costEstimateBasis?: "llm_only" | "llm_plus_rule";
  costTier?: "significant" | "moderate" | "minor";
}

export interface InspectionInspectorMetadata {
  name: string | null;
  licenseNumber: string | null;
  licenseVerificationStatus: "parsed" | "missing" | "malformed";
  inspectionDate: string | null;
  propertyAddressFromReport: string | null;
}

export interface InspectionFacts {
  roofAgeYears?: number;
  hvacAgeYears?: number;
  electricalPanelType?: string;
  plumbingMaterial?: string;
  waterHeaterAgeYears?: number;
  structuralConcernFlag?: boolean;
  wdoDamageFlag?: boolean;
  fourPointRecommended?: boolean;
  windMitigationRecommended?: boolean;
}

export interface InspectionParserOutput {
  detectedReportType: InspectionReportType;
  reportTypeConfidence: number;
  inspector: InspectionInspectorMetadata;
  findings: InspectionFinding[];
  facts: InspectionFacts;
  modelId: string;
  tokensUsed: { prompt: number; completion: number };
}

export class InspectionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectionParseError";
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Prompt
// ───────────────────────────────────────────────────────────────────────────

const FL_RED_FLAGS = [
  "Federal Pacific Electric (FPE) or Zinsco panels — life_safety",
  "Polybutylene plumbing (gray plastic, often 1978-1995) — major_repair",
  "Roof age over 15 years OR signs of end-of-life — major_repair / monitor",
  "Active wood-destroying organism (WDO) damage — major_repair (life_safety if structural)",
  "Missing hurricane straps / clips — major_repair",
  "Recent water intrusion or active leaks — major_repair",
  "Open or expired permits visible in the report — monitor",
  "4-point inspection recommended — capture as a fact (fourPointRecommended)",
  "Wind mitigation inspection recommended — capture as a fact (windMitigationRecommended)",
  "Aluminum branch wiring — major_repair",
  "Knob-and-tube wiring — major_repair",
  "Ungrounded outlets in living spaces — monitor",
  "GFCI missing in wet locations — monitor",
  "Visible mold or moisture — major_repair",
  "Sinkhole / settlement signs — life_safety or major_repair",
] as const;

export const INSPECTION_PARSER_SYSTEM_PROMPT = `You are a Florida home-inspection analyst reviewing a buyer-facing inspection report. Your job is to surface EVERY material finding in plain English, with page citations and evidence quotes, so a buyer can decide what to negotiate.

Voice: consumer-friendly, direct, no jargon. Explain WHY each finding matters to a Florida buyer.

STEP 1 — DETECT REPORT TYPE
Look at the document header and content. Pick ONE detectedReportType from:
- general_inspection: full home inspection
- four_point: four-point insurance inspection (roof, HVAC, electrical, plumbing only)
- wind_mitigation: hurricane / wind mitigation inspection
- wdo: wood-destroying organism / termite report
- pool / seawall / dock / sprinkler / septic: specialty system reports
- other: anything that doesn't fit
Also emit reportTypeConfidence (0..1).

STEP 2 — INSPECTOR METADATA
Extract from the report header:
- inspector.name (full name only, NO email/phone — those are PII-redacted)
- inspector.licenseNumber (Florida home inspector licenses look like HI-#### or HOIN-####; report it verbatim)
- inspector.licenseVerificationStatus: "parsed" if a number is present and well-formed, "malformed" if a number is present but doesn't match known formats, "missing" otherwise
- inspector.inspectionDate (ISO YYYY-MM-DD if you can; null if unclear)
- inspector.propertyAddressFromReport (street address from the report, or null)

STEP 3 — FIND EVERY MATERIAL FINDING
For each issue, emit ONE finding with:
- system: roof | hvac | electrical | plumbing | structural | exterior | interior | grounds | appliances | pest
- title: ≤80 characters, buyer-facing headline
- buyerSeverity:
   * life_safety  — immediate safety hazard (FPE panel, active gas leak, hurricane-straps missing on a windward exposure)
   * major_repair — significant cost item that affects insurability or habitability (roof at end of life, polybutylene plumbing, structural settlement)
   * monitor      — should be watched / re-inspected, not urgent (minor leak, dated appliance)
   * cosmetic     — paint, drywall, surface finish only
- buyerFriendlyExplanation: ≤500 chars, plain English. Explain WHY this matters to a Florida buyer specifically (insurance, hurricanes, humidity).
- recommendedAction: ≤200 chars, concrete next step ("get a licensed roofer for a quote", "ask seller for a 4-point inspection")
- pageReference: "p. 12" or "pp. 15-16" — null if unclear
- evidenceQuote: ≤280 chars, EXACT phrase from the text that triggered this finding, or null
- confidence: 0.0–1.0

STEP 4 — FLORIDA RED-FLAG CHECKLIST
You MUST check every item below. If the report addresses it, emit a finding. If the report contradicts it (e.g. "panel is Square D, not FPE"), do NOT emit a finding. Do not invent issues that aren't in the report.

${FL_RED_FLAGS.map((f, i) => `${i + 1}. ${f}`).join("\n")}

STEP 5 — AGE REASONING
When the report gives an installation/manufacture year, COMPUTE the age relative to the inspection date (or the current date if inspection date is unclear). Example: "installed 2004" + inspection date 2026 = age 22 years. Do NOT echo "21 years" if the report says "installed 2004" and the inspection is 2026 — subtract.

STEP 6 — NORMALIZED FACTS
Populate the facts object with values you can pull from the report. All optional:
- roofAgeYears (number)
- hvacAgeYears (number)
- electricalPanelType (string — "FPE", "Zinsco", "Square D", "Siemens", etc.)
- plumbingMaterial (string — "polybutylene", "copper", "PEX", "galvanized", "CPVC")
- waterHeaterAgeYears (number)
- structuralConcernFlag (boolean — true if any structural concern is mentioned)
- wdoDamageFlag (boolean — true if active WDO damage is mentioned)
- fourPointRecommended (boolean)
- windMitigationRecommended (boolean)

STEP 7 — COST HINT (OPTIONAL)
You MAY add an llmSuggestedCost {low, high, confidence} to a finding when you have a defensible market-based estimate. Skip it if you don't. The buyer-facing system will decide whether to surface a dollar range or a qualitative tier.

OUTPUT FORMAT
Return ONLY a JSON object with the exact shape below. Do NOT wrap in markdown fences. Do NOT add commentary.

{
  "detectedReportType": "general_inspection",
  "reportTypeConfidence": 0.95,
  "inspector": {
    "name": "Jane Doe",
    "licenseNumber": "HI-1234",
    "licenseVerificationStatus": "parsed",
    "inspectionDate": "2026-03-12",
    "propertyAddressFromReport": "123 Main St, Tampa FL"
  },
  "findings": [
    {
      "system": "electrical",
      "title": "Federal Pacific Electric panel installed",
      "buyerSeverity": "life_safety",
      "buyerFriendlyExplanation": "The home has an FPE Stab-Lok panel. These breakers are known to fail to trip on overload and have caused fires nationwide. Florida insurers routinely refuse to bind coverage on FPE panels — replacing it is usually required before closing.",
      "recommendedAction": "Get a licensed electrician to quote a panel replacement and ask the seller to credit or replace before closing.",
      "pageReference": "p. 14",
      "evidenceQuote": "Main panel: Federal Pacific Electric Stab-Lok, 200A",
      "confidence": 0.95,
      "llmSuggestedCost": { "low": 3000, "high": 5000, "confidence": 0.85 }
    }
  ],
  "facts": {
    "electricalPanelType": "FPE",
    "fourPointRecommended": true,
    "windMitigationRecommended": false
  }
}`;

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max);
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeFindingKey(
  system: string,
  title: string,
): Promise<string> {
  return sha256Hex(`${system}::${title.slice(0, 60)}`);
}

function buildUserPrompt(input: InspectionParserInput): string {
  const parts: string[] = [];
  parts.push(`Source file: ${input.sourceFileName}`);
  if (input.reportTypeHint) {
    parts.push(
      `Broker override report type: ${input.reportTypeHint} — use this exact value as detectedReportType, but still emit your own reportTypeConfidence based on the document content.`,
    );
  }
  if (input.knownContext?.propertyAddress) {
    parts.push(`Address: ${input.knownContext.propertyAddress}`);
  }
  if (input.knownContext?.yearBuilt) {
    parts.push(`Year built: ${input.knownContext.yearBuilt}`);
  }
  if (input.knownContext?.propertyType) {
    parts.push(`Property type: ${input.knownContext.propertyType}`);
  }
  parts.push("");
  parts.push("Inspection report text (PII already redacted):");
  parts.push("---");
  if (input.perPageText.length > 0) {
    for (const p of input.perPageText) {
      parts.push(`[Page ${p.page}]`);
      parts.push(p.text);
      parts.push("");
    }
  } else {
    parts.push(input.redactedText);
  }
  parts.push("---");
  parts.push("");
  parts.push(
    "Return the JSON object now. Cover every red-flag topic. Use exact page numbers from the [Page N] markers above.",
  );
  return parts.join("\n");
}

function extractJson(raw: string): string | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

// ───────────────────────────────────────────────────────────────────────────
// Response normalization
// ───────────────────────────────────────────────────────────────────────────

interface RawCost {
  low?: unknown;
  high?: unknown;
  confidence?: unknown;
}

interface RawFinding {
  system?: unknown;
  title?: unknown;
  buyerSeverity?: unknown;
  buyerFriendlyExplanation?: unknown;
  recommendedAction?: unknown;
  pageReference?: unknown;
  evidenceQuote?: unknown;
  confidence?: unknown;
  llmSuggestedCost?: RawCost;
}

interface RawInspector {
  name?: unknown;
  licenseNumber?: unknown;
  licenseVerificationStatus?: unknown;
  inspectionDate?: unknown;
  propertyAddressFromReport?: unknown;
}

interface RawFacts {
  roofAgeYears?: unknown;
  hvacAgeYears?: unknown;
  electricalPanelType?: unknown;
  plumbingMaterial?: unknown;
  waterHeaterAgeYears?: unknown;
  structuralConcernFlag?: unknown;
  wdoDamageFlag?: unknown;
  fourPointRecommended?: unknown;
  windMitigationRecommended?: unknown;
}

interface RawResponse {
  detectedReportType?: unknown;
  reportTypeConfidence?: unknown;
  inspector?: RawInspector;
  findings?: RawFinding[];
  facts?: RawFacts;
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isInspectionSystem(v: unknown): v is InspectionSystem {
  return typeof v === "string" && (INSPECTION_SYSTEMS as readonly string[]).includes(v);
}

function isBuyerSeverity(v: unknown): v is BuyerSeverity {
  return typeof v === "string" && (BUYER_SEVERITIES as readonly string[]).includes(v);
}

function isReportType(v: unknown): v is InspectionReportType {
  return (
    typeof v === "string" && (INSPECTION_REPORT_TYPES as readonly string[]).includes(v)
  );
}

function normalizeNumber(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function normalizeBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function normalizeOptionalString(v: unknown): string | undefined {
  return isString(v) ? v.trim() : undefined;
}

function normalizeCostHint(raw: RawCost | undefined): InspectionFinding["llmSuggestedCost"] {
  if (!raw) return undefined;
  const low = normalizeNumber(raw.low);
  const high = normalizeNumber(raw.high);
  const conf = normalizeNumber(raw.confidence);
  if (low === undefined || high === undefined || conf === undefined) return undefined;
  if (high < low) return undefined;
  return { low, high, confidence: clamp01(conf) };
}

const LOW_CONFIDENCE_DOWNGRADE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_SUFFIX =
  " — low-confidence; your broker should review before you act on this.";

async function normalizeFinding(raw: RawFinding): Promise<InspectionFinding | null> {
  if (!isInspectionSystem(raw.system)) return null;
  if (!isBuyerSeverity(raw.buyerSeverity)) return null;
  if (!isString(raw.title)) return null;
  if (!isString(raw.buyerFriendlyExplanation)) return null;
  if (!isString(raw.recommendedAction)) return null;

  const title = clip(raw.title, 80);
  let explanation = clip(raw.buyerFriendlyExplanation, 500);
  const action = clip(raw.recommendedAction, 200);
  const confidence =
    typeof raw.confidence === "number" ? clamp01(raw.confidence) : 0.6;

  // Confidence downgrade — same rule as disclosure parser. Any
  // life_safety finding with confidence below the threshold is
  // demoted to major_repair and an explanatory suffix is appended
  // so the buyer surface tells them to talk to their broker.
  let buyerSeverity: BuyerSeverity = raw.buyerSeverity;
  if (
    buyerSeverity === "life_safety" &&
    confidence < LOW_CONFIDENCE_DOWNGRADE_THRESHOLD
  ) {
    buyerSeverity = "major_repair";
    if (explanation.length + LOW_CONFIDENCE_SUFFIX.length <= 500) {
      explanation = explanation + LOW_CONFIDENCE_SUFFIX;
    } else {
      explanation =
        clip(explanation, 500 - LOW_CONFIDENCE_SUFFIX.length) +
        LOW_CONFIDENCE_SUFFIX;
    }
  }

  const pageReference =
    isString(raw.pageReference) ? clip(raw.pageReference, 40) : null;
  const evidenceQuote =
    isString(raw.evidenceQuote) ? clip(raw.evidenceQuote, 280) : null;

  const findingKey = await computeFindingKey(raw.system, title);
  const llmSuggestedCost = normalizeCostHint(raw.llmSuggestedCost);

  return {
    findingKey,
    system: raw.system,
    title,
    buyerSeverity,
    buyerFriendlyExplanation: explanation,
    recommendedAction: action,
    pageReference,
    evidenceQuote,
    confidence,
    llmSuggestedCost,
  };
}

function normalizeInspector(
  raw: RawInspector | undefined,
): InspectionInspectorMetadata {
  if (!raw) {
    return {
      name: null,
      licenseNumber: null,
      licenseVerificationStatus: "missing",
      inspectionDate: null,
      propertyAddressFromReport: null,
    };
  }

  const name = isString(raw.name) ? clip(raw.name, 120) : null;
  const licenseNumber = isString(raw.licenseNumber)
    ? clip(raw.licenseNumber, 40)
    : null;
  const status: "parsed" | "missing" | "malformed" =
    raw.licenseVerificationStatus === "parsed" ||
    raw.licenseVerificationStatus === "malformed" ||
    raw.licenseVerificationStatus === "missing"
      ? raw.licenseVerificationStatus
      : licenseNumber
        ? "parsed"
        : "missing";
  const inspectionDate = isString(raw.inspectionDate)
    ? clip(raw.inspectionDate, 32)
    : null;
  const propertyAddressFromReport = isString(raw.propertyAddressFromReport)
    ? clip(raw.propertyAddressFromReport, 200)
    : null;

  return {
    name,
    licenseNumber,
    licenseVerificationStatus: status,
    inspectionDate,
    propertyAddressFromReport,
  };
}

function normalizeFacts(raw: RawFacts | undefined): InspectionFacts {
  if (!raw) return {};
  return {
    roofAgeYears: normalizeNumber(raw.roofAgeYears),
    hvacAgeYears: normalizeNumber(raw.hvacAgeYears),
    electricalPanelType: normalizeOptionalString(raw.electricalPanelType),
    plumbingMaterial: normalizeOptionalString(raw.plumbingMaterial),
    waterHeaterAgeYears: normalizeNumber(raw.waterHeaterAgeYears),
    structuralConcernFlag: normalizeBool(raw.structuralConcernFlag),
    wdoDamageFlag: normalizeBool(raw.wdoDamageFlag),
    fourPointRecommended: normalizeBool(raw.fourPointRecommended),
    windMitigationRecommended: normalizeBool(raw.windMitigationRecommended),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Public entry point
// ───────────────────────────────────────────────────────────────────────────

export async function parseInspectionText(
  input: InspectionParserInput,
): Promise<InspectionParserOutput> {
  if (input.redactedText.trim().length === 0) {
    throw new InspectionParseError(
      "redactedText is empty — OCR produced no content",
    );
  }

  const messages: GatewayMessage[] = [
    { role: "system", content: INSPECTION_PARSER_SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];

  const result = await gateway({
    engineType: "doc_parser",
    messages,
    maxTokens: 4096,
    temperature: 0.1,
  });

  if (!result.success) {
    throw new InspectionParseError(
      `gateway failed: ${result.error.code} ${result.error.message}`,
    );
  }

  const jsonText = extractJson(result.data.content);
  if (!jsonText) {
    throw new InspectionParseError("model response did not contain JSON");
  }

  let parsed: RawResponse;
  try {
    parsed = JSON.parse(jsonText) as RawResponse;
  } catch (err) {
    throw new InspectionParseError(
      `JSON parse failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  // Report type — broker override wins; otherwise trust the LLM.
  let detectedReportType: InspectionReportType;
  let reportTypeConfidence: number;
  if (input.reportTypeHint) {
    detectedReportType = input.reportTypeHint;
    reportTypeConfidence =
      typeof parsed.reportTypeConfidence === "number"
        ? clamp01(parsed.reportTypeConfidence)
        : 0.7;
  } else if (isReportType(parsed.detectedReportType)) {
    detectedReportType = parsed.detectedReportType;
    reportTypeConfidence =
      typeof parsed.reportTypeConfidence === "number"
        ? clamp01(parsed.reportTypeConfidence)
        : 0.5;
  } else {
    detectedReportType = "other";
    reportTypeConfidence = 0.3;
  }

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: InspectionFinding[] = [];
  for (const raw of rawFindings) {
    const normalized = await normalizeFinding(raw);
    if (normalized) findings.push(normalized);
  }

  const inspector = normalizeInspector(parsed.inspector);
  const facts = normalizeFacts(parsed.facts);

  return {
    detectedReportType,
    reportTypeConfidence,
    inspector,
    findings,
    facts,
    modelId: result.data.usage.model,
    tokensUsed: {
      prompt: result.data.usage.inputTokens,
      completion: result.data.usage.outputTokens,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Negotiation summary helper
// ───────────────────────────────────────────────────────────────────────────

export interface NegotiationSummaryInput {
  findings: InspectionFinding[];
  detectedReportTypes: InspectionReportType[];
  knownContext?: {
    propertyAddress?: string;
  };
}

export interface NegotiationSummaryOutput {
  buyerSummary: string;
  internalSummary: string;
  modelId: string;
}

export const NEGOTIATION_SUMMARY_SYSTEM_PROMPT = `You are a Florida buyer's broker writing a negotiation summary from the inspection findings below. Output TWO summaries:

1. buyerSummary — markdown text the buyer reads in their dashboard. Itemized asks. Phrasing like "You could consider asking the seller for…". Group by severity (life_safety first). Include cost ranges or qualitative tiers as given. End with a single disclaimer line: "These are market-based estimates, not contractor quotes — get 3 real quotes before negotiating."

2. internalSummary — candid broker prep notes. Plain text. Talks about leverage, what's negotiable, what isn't, expected seller pushback, what to escalate to a specialist. Not buyer-facing.

Output ONLY a JSON object with this exact shape. No markdown fences, no commentary:
{
  "buyerSummary": "…",
  "internalSummary": "…"
}`;

function buildNegotiationUserPrompt(input: NegotiationSummaryInput): string {
  const parts: string[] = [];
  parts.push(`Detected report types: ${input.detectedReportTypes.join(", ") || "unknown"}`);
  if (input.knownContext?.propertyAddress) {
    parts.push(`Property address: ${input.knownContext.propertyAddress}`);
  }
  parts.push("");
  parts.push("Findings:");
  for (const f of input.findings) {
    const cost = f.estimatedCostLowUsd && f.estimatedCostHighUsd
      ? `$${f.estimatedCostLowUsd.toLocaleString()}–$${f.estimatedCostHighUsd.toLocaleString()}`
      : f.costTier
        ? `${f.costTier} cost`
        : "cost unknown";
    parts.push(
      `- [${f.buyerSeverity}] (${f.system}) ${f.title} — ${cost}. ${f.buyerFriendlyExplanation} Recommended: ${f.recommendedAction}`,
    );
  }
  parts.push("");
  parts.push("Return the JSON object now.");
  return parts.join("\n");
}

export async function summarizeNegotiation(
  input: NegotiationSummaryInput,
): Promise<NegotiationSummaryOutput> {
  if (input.findings.length === 0) {
    return {
      buyerSummary:
        "No material findings were surfaced in this inspection. We'll still review the report manually before you respond to the seller.",
      internalSummary:
        "No findings to negotiate from. Confirm with the inspector that nothing was missed before publishing.",
      modelId: "n/a",
    };
  }

  const result = await gateway({
    engineType: "doc_parser",
    messages: [
      { role: "system", content: NEGOTIATION_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: buildNegotiationUserPrompt(input) },
    ],
    maxTokens: 2048,
    temperature: 0.2,
  });

  if (!result.success) {
    throw new InspectionParseError(
      `negotiation summary gateway failed: ${result.error.code} ${result.error.message}`,
    );
  }

  const jsonText = extractJson(result.data.content);
  if (!jsonText) {
    throw new InspectionParseError("negotiation summary missing JSON");
  }

  let parsed: { buyerSummary?: unknown; internalSummary?: unknown };
  try {
    parsed = JSON.parse(jsonText) as {
      buyerSummary?: unknown;
      internalSummary?: unknown;
    };
  } catch (err) {
    throw new InspectionParseError(
      `negotiation summary JSON parse failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  const buyerSummary = isString(parsed.buyerSummary)
    ? parsed.buyerSummary.trim()
    : "Negotiation summary unavailable — your broker will follow up.";
  const internalSummary = isString(parsed.internalSummary)
    ? parsed.internalSummary.trim()
    : "Internal summary unavailable; review findings manually.";

  return {
    buyerSummary,
    internalSummary,
    modelId: result.data.usage.model,
  };
}
