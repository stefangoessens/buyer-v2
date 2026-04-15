/**
 * Disclosure parser (KIN-1078) — pure LLM helper.
 *
 * Takes redacted OCR text from a single disclosure file and asks
 * Claude to surface every material issue a Florida buyer should know
 * about, in plain English, with page citations and evidence quotes.
 *
 * Scope:
 *   - No Convex imports; keep the module testable in isolation.
 *   - All network I/O goes through src/lib/ai/gateway.ts.
 *   - Category taxonomy is buyer-friendly (structural/water/hoa/...),
 *     not the legacy rule taxonomy from the older docParser. The
 *     orchestrator action maps categories → rule enum before writing
 *     to fileAnalysisFindings so the existing review queue keeps
 *     working.
 */

import { gateway } from "../gateway";
import type { GatewayMessage } from "../types";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export const DISCLOSURE_CATEGORIES = [
  "structural",
  "water",
  "hoa",
  "legal",
  "insurance",
  "environmental",
  "title",
  "not_disclosed",
] as const;

export type DisclosureCategory = (typeof DISCLOSURE_CATEGORIES)[number];

export const DISCLOSURE_SEVERITIES = ["low", "medium", "high"] as const;
export type DisclosureSeverity = (typeof DISCLOSURE_SEVERITIES)[number];

export interface DisclosureParserInput {
  redactedText: string;
  perPageText: Array<{ page: number; text: string }>;
  sourceFileName: string;
  propertyState?: string;
  listPrice?: number;
  knownContext?: {
    propertyAddress?: string;
    yearBuilt?: number;
    propertyType?: string;
  };
}

export interface DisclosureFinding {
  findingKey: string;
  category: DisclosureCategory;
  severity: DisclosureSeverity;
  title: string;
  buyerFriendlyExplanation: string;
  recommendedAction: string;
  pageReference: string | null;
  evidenceQuote: string | null;
  confidence: number;
}

export interface DisclosureNotMentioned {
  findingKey: string;
  category: "not_disclosed";
  severity: "medium";
  title: string;
  buyerFriendlyExplanation: string;
  recommendedAction: string;
  confidence: 1.0;
}

export interface DisclosureParserOutput {
  findings: DisclosureFinding[];
  notMentioned: DisclosureNotMentioned[];
  summary: {
    totalFindings: number;
    severityCounts: { high: number; medium: number; low: number };
    detectedDocumentTypes: string[];
  };
  modelId: string;
  tokensUsed: { prompt: number; completion: number };
}

export class DisclosureParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisclosureParseError";
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Prompt
// ───────────────────────────────────────────────────────────────────────────

const FL_CHECKLIST = [
  "Flood history or prior flood damage",
  "Prior insurance claims (hurricane, water, wind, hail)",
  "Roof age and roof replacement date",
  "Sinkhole activity or subsidence",
  "Open or expired building permits",
  "Wood-destroying organism (termite) history",
  "Mold or moisture intrusion",
  "Lead-based paint (pre-1978 construction)",
  "HOA assessments, litigation, CDD obligations, reserve adequacy",
  "Hurricane damage or storm exposure",
] as const;

export const DISCLOSURE_PARSER_SYSTEM_PROMPT = `You are a buyer advocate reviewing a Florida seller disclosure packet for a home buyer. Your job is to surface EVERY material issue and EXPLAIN it in plain language.

Do NOT use legal jargon. Do NOT summarize the document — you flag issues.

For each issue you find, emit ONE finding with:
- category: one of structural | water | hoa | legal | insurance | environmental | title | not_disclosed
- severity: low | medium | high (be honest — a disclosed roof leak is high; a minor cosmetic issue is low)
- title: ≤80 characters, buyer-facing headline
- buyerFriendlyExplanation: ≤500 characters, plain English, consumer voice. Explain WHY this matters.
- recommendedAction: ≤200 characters, concrete next step for the buyer ("ask for a roof inspection", "request the HOA estoppel letter", etc.)
- pageReference: "p. 12" or "pp. 15-16" — the page the issue came from, or null if unclear
- evidenceQuote: ≤280 characters, EXACT phrase from the text that triggered the finding, or null
- confidence: 0.0–1.0

You MUST check each of these Florida red-flag topics and emit EITHER:
(a) a regular finding if the disclosure addresses it, OR
(b) a not-disclosed finding in the notMentioned array if the topic is NOT addressed and a buyer should ask.

Florida red-flag checklist (cover every item):
${FL_CHECKLIST.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Return ONLY a JSON object with this exact shape. Do NOT wrap in markdown fences. Do NOT add commentary.

{
  "findings": [
    {
      "category": "structural",
      "severity": "high",
      "title": "Roof leak disclosed in kitchen ceiling",
      "buyerFriendlyExplanation": "The seller disclosed an active roof leak above the kitchen. Active leaks can cause hidden framing and drywall damage and are a leading cause of insurance declines in Florida.",
      "recommendedAction": "Get a licensed roofer to quote repair cost and a 4-point inspection before your inspection period ends.",
      "pageReference": "p. 4",
      "evidenceQuote": "Roof leak in kitchen area, repair pending",
      "confidence": 0.95
    }
  ],
  "notMentioned": [
    {
      "category": "not_disclosed",
      "severity": "medium",
      "title": "Roof age not disclosed",
      "buyerFriendlyExplanation": "The packet does not state when the roof was last replaced. In Florida, roofs older than 15 years often cannot be insured without replacement.",
      "recommendedAction": "Ask the seller for the roof permit or replacement receipt, and request an insurance binder before closing.",
      "confidence": 1.0
    }
  ],
  "summary": {
    "totalFindings": 1,
    "severityCounts": { "high": 1, "medium": 0, "low": 0 },
    "detectedDocumentTypes": ["seller_disclosure"]
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
  category: string,
  title: string,
): Promise<string> {
  return sha256Hex(`${category}::${title.slice(0, 60)}`);
}

function buildUserPrompt(input: DisclosureParserInput): string {
  const parts: string[] = [];
  parts.push(`Source file: ${input.sourceFileName}`);
  parts.push(`Property state: ${input.propertyState ?? "FL"}`);
  if (typeof input.listPrice === "number") {
    parts.push(`List price: $${input.listPrice.toLocaleString()}`);
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
  parts.push("Disclosure text (PII already redacted):");
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

// ───────────────────────────────────────────────────────────────────────────
// Response parsing
// ───────────────────────────────────────────────────────────────────────────

interface RawFinding {
  category?: unknown;
  severity?: unknown;
  title?: unknown;
  buyerFriendlyExplanation?: unknown;
  recommendedAction?: unknown;
  pageReference?: unknown;
  evidenceQuote?: unknown;
  confidence?: unknown;
}

interface RawResponse {
  findings?: RawFinding[];
  notMentioned?: RawFinding[];
  summary?: {
    totalFindings?: number;
    severityCounts?: { high?: number; medium?: number; low?: number };
    detectedDocumentTypes?: string[];
  };
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isDisclosureCategory(v: unknown): v is DisclosureCategory {
  return typeof v === "string" && (DISCLOSURE_CATEGORIES as readonly string[]).includes(v);
}

function isDisclosureSeverity(v: unknown): v is DisclosureSeverity {
  return typeof v === "string" && (DISCLOSURE_SEVERITIES as readonly string[]).includes(v);
}

async function normalizeFinding(
  raw: RawFinding,
): Promise<DisclosureFinding | null> {
  if (!isDisclosureCategory(raw.category)) return null;
  if (!isDisclosureSeverity(raw.severity)) return null;
  if (!isString(raw.title)) return null;
  if (!isString(raw.buyerFriendlyExplanation)) return null;
  if (!isString(raw.recommendedAction)) return null;

  const title = clip(raw.title, 80);
  let explanation = clip(raw.buyerFriendlyExplanation, 500);
  const action = clip(raw.recommendedAction, 200);
  const confidence =
    typeof raw.confidence === "number" ? clamp01(raw.confidence) : 0.6;

  // Confidence thresholding: downgrade low-confidence high-severity findings.
  let severity: DisclosureSeverity = raw.severity;
  if (severity === "high" && confidence < 0.7) {
    severity = "medium";
    const suffix = " — low-confidence finding; your broker should review.";
    if (explanation.length + suffix.length <= 500) {
      explanation = explanation + suffix;
    } else {
      explanation = clip(explanation, 500 - suffix.length) + suffix;
    }
  }

  const pageReference =
    isString(raw.pageReference) ? clip(raw.pageReference, 40) : null;
  const evidenceQuote =
    isString(raw.evidenceQuote) ? clip(raw.evidenceQuote, 280) : null;

  const findingKey = await computeFindingKey(raw.category, title);

  return {
    findingKey,
    category: raw.category,
    severity,
    title,
    buyerFriendlyExplanation: explanation,
    recommendedAction: action,
    pageReference,
    evidenceQuote,
    confidence,
  };
}

async function normalizeNotMentioned(
  raw: RawFinding,
): Promise<DisclosureNotMentioned | null> {
  if (!isString(raw.title)) return null;
  if (!isString(raw.buyerFriendlyExplanation)) return null;
  if (!isString(raw.recommendedAction)) return null;

  const title = clip(raw.title, 80);
  const explanation = clip(raw.buyerFriendlyExplanation, 500);
  const action = clip(raw.recommendedAction, 200);

  const findingKey = await computeFindingKey("not_disclosed", title);

  return {
    findingKey,
    category: "not_disclosed",
    severity: "medium",
    title,
    buyerFriendlyExplanation: explanation,
    recommendedAction: action,
    confidence: 1.0,
  };
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
// Public entry point
// ───────────────────────────────────────────────────────────────────────────

export async function parseDisclosureText(
  input: DisclosureParserInput,
): Promise<DisclosureParserOutput> {
  if (input.redactedText.trim().length === 0) {
    throw new DisclosureParseError(
      "redactedText is empty — OCR produced no content",
    );
  }

  const messages: GatewayMessage[] = [
    { role: "system", content: DISCLOSURE_PARSER_SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];

  const result = await gateway({
    engineType: "doc_parser",
    messages,
    maxTokens: 4096,
    temperature: 0.1,
  });

  if (!result.success) {
    throw new DisclosureParseError(
      `gateway failed: ${result.error.code} ${result.error.message}`,
    );
  }

  const jsonText = extractJson(result.data.content);
  if (!jsonText) {
    throw new DisclosureParseError("model response did not contain JSON");
  }

  let parsed: RawResponse;
  try {
    parsed = JSON.parse(jsonText) as RawResponse;
  } catch (err) {
    throw new DisclosureParseError(
      `JSON parse failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const rawNotMentioned = Array.isArray(parsed.notMentioned)
    ? parsed.notMentioned
    : [];

  const findings: DisclosureFinding[] = [];
  for (const raw of rawFindings) {
    const normalized = await normalizeFinding(raw);
    if (normalized) findings.push(normalized);
  }

  const notMentioned: DisclosureNotMentioned[] = [];
  for (const raw of rawNotMentioned) {
    const normalized = await normalizeNotMentioned(raw);
    if (normalized) notMentioned.push(normalized);
  }

  const severityCounts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) severityCounts[f.severity] += 1;
  for (const _n of notMentioned) severityCounts.medium += 1;

  const detectedDocumentTypes = Array.isArray(parsed.summary?.detectedDocumentTypes)
    ? parsed.summary!.detectedDocumentTypes!.filter(
        (t): t is string => typeof t === "string" && t.length > 0,
      )
    : [];

  return {
    findings,
    notMentioned,
    summary: {
      totalFindings: findings.length + notMentioned.length,
      severityCounts,
      detectedDocumentTypes,
    },
    modelId: result.data.usage.model,
    tokensUsed: {
      prompt: result.data.usage.inputTokens,
      completion: result.data.usage.outputTokens,
    },
  };
}
