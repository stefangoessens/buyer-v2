/**
 * Contract milestone extraction (KIN-806).
 *
 * Pure, deterministic parser that pulls standard milestones out of FL FAR/BAR
 * contract text. Every extracted milestone carries a confidence score, a
 * workstream label (inspection, financing, title, insurance, closing, etc.),
 * and optionally a snippet of the clause it came from so reviewers can audit
 * the extraction.
 *
 * This module is regex + date-math only — no LLM calls. Clauses that don't
 * match a known pattern, or that match ambiguously, get emitted with
 * `flaggedForReview: true` and a structured reviewReason so the ops queue
 * can pick them up.
 *
 * Downstream consumers:
 *   - buyer-facing close dashboard (KIN-793)
 *   - internal brokerage ops view
 *   - buyer copilot for "what's next" questions
 */

// ───────────────────────────────────────────────────────────────────────────
// Types — shared by parser and Convex layer
// ───────────────────────────────────────────────────────────────────────────

/** Workstream buckets for milestones. Matches the buyer close-dashboard rows. */
export const WORKSTREAMS = [
  "inspection",
  "financing",
  "appraisal",
  "title",
  "insurance",
  "escrow",
  "hoa",
  "walkthrough",
  "closing",
  "other",
] as const;

export type Workstream = (typeof WORKSTREAMS)[number];

/** Milestone status lifecycle. Mirrors the Convex schema. */
export type MilestoneStatus =
  | "pending"
  | "completed"
  | "overdue"
  | "needs_review";

/** Reasons a milestone can be flagged for human review. */
export type ReviewReason =
  | "low_confidence"
  | "ambiguous_date"
  | "missing_required"
  | "date_in_past"
  | "manual_flag";

/** One extracted milestone ready to be persisted. */
export interface ExtractedMilestone {
  name: string;
  workstream: Workstream;
  dueDate: string; // ISO date (YYYY-MM-DD) — not a datetime
  confidence: number; // 0..1
  flaggedForReview: boolean;
  reviewReason?: ReviewReason;
  /** Raw snippet from the contract that produced this milestone. */
  linkedClauseText?: string;
}

/** Input to the extractor. */
export interface ExtractMilestonesInput {
  /** Plain text of the contract. */
  contractText: string;
  /** Effective date of the contract (when inspection-period-start is anchored). ISO YYYY-MM-DD. */
  effectiveDate: string;
  /** Closing date if explicitly set elsewhere. ISO YYYY-MM-DD. */
  closingDate?: string;
}

/** Output of the extractor. */
export interface ExtractMilestonesOutput {
  milestones: ExtractedMilestone[];
  overallConfidence: number;
  warnings: string[];
}

// ───────────────────────────────────────────────────────────────────────────
// The extractor — a handful of regex patterns + date math
// ───────────────────────────────────────────────────────────────────────────

/** Confidence threshold below which a milestone is flagged for review. */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Deterministic extraction of standard milestones from FL FAR/BAR contract
 * text. Returns what it can; flags what it can't. Never throws.
 */
export function extractMilestones(
  input: ExtractMilestonesInput,
): ExtractMilestonesOutput {
  const warnings: string[] = [];
  const milestones: ExtractedMilestone[] = [];

  const effectiveDate = parseIsoDate(input.effectiveDate);
  if (!effectiveDate) {
    warnings.push("effectiveDate is not a valid ISO date; downstream math skipped");
    return { milestones: [], overallConfidence: 0, warnings };
  }

  const text = input.contractText;

  // ─── Inspection period
  const inspection = extractInspectionPeriod(text, effectiveDate);
  if (inspection) milestones.push(inspection);

  // ─── Financing contingency
  const financing = extractFinancingContingency(text, effectiveDate);
  if (financing) milestones.push(financing);

  // ─── Appraisal (usually explicit, but sometimes embedded in financing)
  const appraisal = extractAppraisal(text, effectiveDate);
  if (appraisal) milestones.push(appraisal);

  // ─── Title commitment
  const title = extractTitleCommitment(text, effectiveDate);
  if (title) milestones.push(title);

  // ─── Insurance binding
  const insurance = extractInsuranceBinding(text, effectiveDate);
  if (insurance) milestones.push(insurance);

  // ─── HOA documents (condo/townhouse)
  const hoa = extractHoaDocs(text, effectiveDate);
  if (hoa) milestones.push(hoa);

  // ─── Final walkthrough (7 days before closing — standard)
  const closing =
    input.closingDate && parseIsoDate(input.closingDate)
      ? input.closingDate
      : extractClosingDate(text);

  if (closing && parseIsoDate(closing)) {
    const walkthrough = buildDerivedMilestone({
      name: "Final walkthrough",
      workstream: "walkthrough",
      dueDate: addDays(closing, -1),
      confidence: 0.9,
    });
    milestones.push(walkthrough);

    const closingMilestone = buildDerivedMilestone({
      name: "Closing",
      workstream: "closing",
      dueDate: closing,
      confidence: 1.0,
    });
    milestones.push(closingMilestone);
  } else {
    warnings.push("No closing date found; walkthrough/closing milestones omitted");
  }

  // ─── Overall confidence = average, degraded if any milestone flagged
  const overallConfidence =
    milestones.length === 0
      ? 0
      : Number(
          (
            milestones.reduce((sum, m) => sum + m.confidence, 0) /
            milestones.length
          ).toFixed(2),
        );

  // ─── Check for past-due dates and re-flag
  const now = new Date().toISOString().slice(0, 10);
  for (const m of milestones) {
    if (m.dueDate < now && !m.flaggedForReview) {
      m.flaggedForReview = true;
      m.reviewReason = "date_in_past";
    }
  }

  return { milestones, overallConfidence, warnings };
}

// ───────────────────────────────────────────────────────────────────────────
// Per-milestone extractors — each returns a milestone or undefined
// ───────────────────────────────────────────────────────────────────────────

function extractInspectionPeriod(
  text: string,
  effectiveDate: string,
): ExtractedMilestone | undefined {
  // "Inspection Period: 15 days" or "inspection period of 15 calendar days"
  const m =
    /inspection period[^0-9]{0,40}?(\d{1,3})\s*(?:calendar\s*)?days?/i.exec(text);
  if (!m) return undefined;
  const days = parseInt(m[1], 10);
  if (!Number.isFinite(days) || days <= 0 || days > 60) {
    return {
      name: "Inspection period end",
      workstream: "inspection",
      dueDate: addDays(effectiveDate, 0),
      confidence: 0.3,
      flaggedForReview: true,
      reviewReason: "ambiguous_date",
      linkedClauseText: snippet(text, m.index, 120),
    };
  }
  return {
    name: "Inspection period end",
    workstream: "inspection",
    dueDate: addDays(effectiveDate, days),
    confidence: 0.9,
    flaggedForReview: false,
    linkedClauseText: snippet(text, m.index, 120),
  };
}

function extractFinancingContingency(
  text: string,
  effectiveDate: string,
): ExtractedMilestone | undefined {
  // "Financing contingency: 30 days" or "loan approval within 30 days"
  const patterns = [
    /financing\s+contingency[^0-9]{0,40}?(\d{1,3})\s*(?:calendar\s*)?days?/i,
    /loan\s+approval[^0-9]{0,40}?(\d{1,3})\s*(?:calendar\s*)?days?/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const days = parseInt(m[1], 10);
      if (!Number.isFinite(days) || days <= 0 || days > 90) continue;
      return {
        name: "Financing contingency",
        workstream: "financing",
        dueDate: addDays(effectiveDate, days),
        confidence: 0.85,
        flaggedForReview: false,
        linkedClauseText: snippet(text, m.index, 120),
      };
    }
  }
  return undefined;
}

function extractAppraisal(
  text: string,
  effectiveDate: string,
): ExtractedMilestone | undefined {
  const m = /appraisal[^0-9]{0,40}?(\d{1,3})\s*(?:calendar\s*)?days?/i.exec(text);
  if (!m) return undefined;
  const days = parseInt(m[1], 10);
  if (!Number.isFinite(days) || days <= 0 || days > 60) return undefined;
  return {
    name: "Appraisal completion",
    workstream: "appraisal",
    dueDate: addDays(effectiveDate, days),
    confidence: 0.85,
    flaggedForReview: false,
    linkedClauseText: snippet(text, m.index, 120),
  };
}

function extractTitleCommitment(
  text: string,
  effectiveDate: string,
): ExtractedMilestone | undefined {
  const m =
    /title\s+commitment[^0-9]{0,40}?(\d{1,3})\s*(?:calendar\s*)?days?/i.exec(text);
  if (!m) return undefined;
  const days = parseInt(m[1], 10);
  if (!Number.isFinite(days) || days <= 0 || days > 60) return undefined;
  return {
    name: "Title commitment review",
    workstream: "title",
    dueDate: addDays(effectiveDate, days),
    confidence: 0.85,
    flaggedForReview: false,
    linkedClauseText: snippet(text, m.index, 120),
  };
}

function extractInsuranceBinding(
  text: string,
  effectiveDate: string,
): ExtractedMilestone | undefined {
  const m =
    /insurance\s+(?:binding|binder)[^0-9]{0,40}?(\d{1,3})\s*(?:calendar\s*)?days?/i.exec(
      text,
    );
  if (!m) return undefined;
  const days = parseInt(m[1], 10);
  if (!Number.isFinite(days) || days <= 0 || days > 60) return undefined;
  return {
    name: "Insurance binder",
    workstream: "insurance",
    dueDate: addDays(effectiveDate, days),
    confidence: 0.8,
    flaggedForReview: false,
    linkedClauseText: snippet(text, m.index, 120),
  };
}

function extractHoaDocs(
  text: string,
  effectiveDate: string,
): ExtractedMilestone | undefined {
  const m =
    /(?:HOA|condo(?:minium)?|association)\s+documents?[^0-9]{0,40}?(\d{1,3})\s*(?:calendar\s*)?days?/i.exec(
      text,
    );
  if (!m) return undefined;
  const days = parseInt(m[1], 10);
  if (!Number.isFinite(days) || days <= 0 || days > 60) return undefined;
  return {
    name: "HOA/condo document review",
    workstream: "hoa",
    dueDate: addDays(effectiveDate, days),
    confidence: 0.8,
    flaggedForReview: false,
    linkedClauseText: snippet(text, m.index, 120),
  };
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

function extractClosingDate(text: string): string | undefined {
  // Try ISO format first: "Closing date: 2026-05-15"
  const iso = /closing\s*(?:date)?[^0-9]{0,20}?(\d{4}-\d{2}-\d{2})/i.exec(text);
  if (iso) return iso[1];

  // Try month-name formats: "Closing: May 15, 2028" or "close on May 15 2028"
  const monthName =
    /closing\s*(?:date)?[^a-z0-9]{0,20}?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(
      text,
    );
  if (monthName) {
    const month = MONTH_NAMES[monthName[1].toLowerCase()];
    const day = parseInt(monthName[2], 10);
    const year = parseInt(monthName[3], 10);
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // Round-trip through parseIsoDate to reject invalid dates like Feb 30
      const parsed = parseIsoDate(iso);
      if (parsed) return parsed;
    }
  }

  // Try M/D/YYYY format: "Closing: 5/15/2028"
  const slash = /closing\s*(?:date)?[^0-9]{0,20}?(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(
    text,
  );
  if (slash) {
    const month = parseInt(slash[1], 10);
    const day = parseInt(slash[2], 10);
    const year = parseInt(slash[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const parsed = parseIsoDate(iso);
      if (parsed) return parsed;
    }
  }

  return undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function buildDerivedMilestone(args: {
  name: string;
  workstream: Workstream;
  dueDate: string;
  confidence: number;
}): ExtractedMilestone {
  return {
    name: args.name,
    workstream: args.workstream,
    dueDate: args.dueDate,
    confidence: args.confidence,
    flaggedForReview: args.confidence < LOW_CONFIDENCE_THRESHOLD,
    reviewReason: args.confidence < LOW_CONFIDENCE_THRESHOLD ? "low_confidence" : undefined,
  };
}

/** Parse a YYYY-MM-DD string; returns the same string if valid, undefined otherwise. */
function parseIsoDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  // Reject dates that normalize differently (invalid day like 2026-02-30)
  if (d.toISOString().slice(0, 10) !== s) return undefined;
  return s;
}

/** Add days (can be negative) to an ISO date string. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Extract a clean snippet of up to `maxLen` chars around `index`. */
function snippet(text: string, index: number, maxLen: number): string {
  const start = Math.max(0, index - 10);
  const end = Math.min(text.length, index + maxLen);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

// ───────────────────────────────────────────────────────────────────────────
// Public helper for consumers: is a milestone past due?
// ───────────────────────────────────────────────────────────────────────────

/**
 * Return true if `dueDate` is strictly before `today` (both ISO dates).
 * Used by consumers that need to render overdue status without re-running
 * the extractor.
 */
export function isOverdue(dueDate: string, today: string): boolean {
  return dueDate < today;
}
