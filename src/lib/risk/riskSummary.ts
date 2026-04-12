/**
 * Risk summary composer (KIN-850).
 *
 * Pure, deterministic composer that assembles a typed risk summary for
 * a deal room from:
 *   - Canonical property facts (floodZone, roofYear, yearBuilt, etc.)
 *   - File analysis findings (seller disclosures, HOA docs, title commitments,
 *     inspection reports) produced by the doc parser engine (KIN-821)
 *   - Broker annotations / manual risk entries
 *
 * Outputs a typed risk summary with:
 *   - Named risks (stable IDs so the UI can anchor links to specific findings)
 *   - Severity
 *   - Source provenance (where the risk came from)
 *   - Review state (final/pending/review-required)
 *   - Buyer-safe vs internal content split
 *
 * This layer is the single source of truth for "what risks does this
 * property carry?" — both buyer-facing and internal views consume it,
 * and both MUST NOT rebuild risk summaries from raw sources on the client.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/** Risk categories that map to specific rendering sections. */
export const RISK_CATEGORIES = [
  "insurance",
  "structural",
  "title",
  "hoa",
  "flood",
  "compliance",
  "financial",
  "other",
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** Severity levels match the doc parser (KIN-821). */
export const RISK_SEVERITIES = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

/** Where the risk originated. */
export type RiskSource =
  | "property_facts"
  | "file_analysis"
  | "manual_broker"
  | "manual_agent";

/** Review state of a single risk. */
export type RiskReviewState =
  | "final"
  | "pending"
  | "review_required"
  | "resolved";

/** A single named risk in the summary. */
export interface Risk {
  /** Stable ID: `{source}_{rule_or_field}_{subjectId}`. */
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  source: RiskSource;
  reviewState: RiskReviewState;
  /** Short human title for display. */
  title: string;
  /** Plain-English buyer-facing description. */
  buyerSummary: string;
  /** Internal-only detail — never shown to buyers. Empty string if none. */
  internalDetail: string;
  /** 0-1 confidence. */
  confidence: number;
  /** Stable reference back to the source row (file analysis finding ID, property field, etc.). */
  sourceRef?: string;
}

/** Aggregate risk summary for one property/deal room. */
export interface RiskSummary {
  risks: Risk[];
  totals: {
    info: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  /** Worst severity across all risks. */
  worstSeverity: RiskSeverity;
  /** Number of risks in review_required state. */
  reviewRequiredCount: number;
  /** Overall confidence — min across all risks, or 1.0 when empty. */
  overallConfidence: number;
  /** Builder version for cache invalidation. */
  composerVersion: string;
}

export const RISK_SUMMARY_VERSION = "1.0.0";

// ───────────────────────────────────────────────────────────────────────────
// Input shapes (decoupled from Convex Doc)
// ───────────────────────────────────────────────────────────────────────────

/** Canonical property facts the composer reads from. */
export interface PropertyFactsInput {
  propertyId: string;
  yearBuilt?: number;
  roofYear?: number;
  floodZone?: string;
  construction?: string;
  hoaFee?: number;
  hoaFrequency?: string;
  impactWindows?: boolean;
  stormShutters?: boolean;
}

/** File analysis finding shape the composer consumes. Must match docParser output. */
export interface FileAnalysisFindingInput {
  id: string;
  rule:
    | "roof_age_insurability"
    | "hoa_reserves_adequate"
    | "sirs_inspection_status"
    | "flood_zone_risk"
    | "permit_irregularity"
    | "lien_or_encumbrance";
  severity: RiskSeverity;
  label: string;
  summary: string;
  confidence: number;
  requiresReview: boolean;
  /** Broker-only resolution notes, if the finding was resolved. Empty = unresolved. */
  resolutionNotes?: string;
  resolved: boolean;
}

/** Manual risk entries added by a broker or agent. */
export interface ManualRiskInput {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  title: string;
  buyerSummary: string;
  internalDetail: string;
  source: "manual_broker" | "manual_agent";
  confidence: number;
}

export interface ComposeRiskSummaryInput {
  propertyFacts?: PropertyFactsInput;
  fileFindings: FileAnalysisFindingInput[];
  manualRisks?: ManualRiskInput[];
  /** Current year for age calculations. */
  currentYear: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Composer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compose a risk summary from structured inputs. Pure function — same
 * inputs produce byte-identical output.
 */
export function composeRiskSummary(
  input: ComposeRiskSummaryInput,
): RiskSummary {
  const risks: Risk[] = [];

  // ─── 1. Property facts → risks
  if (input.propertyFacts) {
    risks.push(...riskFromPropertyFacts(input.propertyFacts, input.currentYear));
  }

  // ─── 2. File analysis findings → risks
  for (const finding of input.fileFindings) {
    const risk = riskFromFileFinding(finding);
    if (risk) risks.push(risk);
  }

  // ─── 3. Manual risks pass through directly
  if (input.manualRisks) {
    for (const manual of input.manualRisks) {
      risks.push(riskFromManualEntry(manual));
    }
  }

  return aggregate(risks);
}

// ───────────────────────────────────────────────────────────────────────────
// Per-source risk construction
// ───────────────────────────────────────────────────────────────────────────

function riskFromPropertyFacts(
  facts: PropertyFactsInput,
  currentYear: number,
): Risk[] {
  const risks: Risk[] = [];

  // Roof age from property facts (distinct from disclosure-based roof age)
  if (typeof facts.roofYear === "number" && facts.roofYear > 0) {
    const age = currentYear - facts.roofYear;
    if (age >= 0 && age < 100) {
      const { severity, reviewState, title, buyerSummary } =
        classifyRoofAge(age);
      risks.push({
        id: `property_roof_age_${facts.propertyId}`,
        category: "insurance",
        severity,
        source: "property_facts",
        reviewState,
        title,
        buyerSummary,
        internalDetail: `Derived from property record roofYear=${facts.roofYear}`,
        confidence: 0.85,
        sourceRef: `property:${facts.propertyId}:roofYear`,
      });
    }
  }

  // Flood zone from property facts (distinct from disclosure)
  if (facts.floodZone) {
    const zone = facts.floodZone.toUpperCase().trim();
    const { severity, reviewState, buyerSummary } = classifyFloodZone(zone);
    if (severity !== "info" || zone !== "") {
      risks.push({
        id: `property_flood_zone_${facts.propertyId}`,
        category: "flood",
        severity,
        source: "property_facts",
        reviewState,
        title: `Flood zone ${zone}`,
        buyerSummary,
        internalDetail: `Property record flood zone: ${zone}`,
        confidence: 0.9,
        sourceRef: `property:${facts.propertyId}:floodZone`,
      });
    }
  }

  // Pre-1994 construction without impact windows/shutters = wind risk
  if (
    typeof facts.yearBuilt === "number" &&
    facts.yearBuilt < 1994 &&
    facts.impactWindows !== true &&
    facts.stormShutters !== true
  ) {
    risks.push({
      id: `property_wind_mitigation_${facts.propertyId}`,
      category: "structural",
      severity: "medium",
      source: "property_facts",
      reviewState: "final",
      title: "Pre-1994 construction without wind mitigation",
      buyerSummary: `Home built in ${facts.yearBuilt} lacks impact windows and storm shutters. Florida insurers charge higher premiums for pre-code homes without mitigation features. Consider a wind mitigation inspection during your inspection period.`,
      internalDetail: `yearBuilt=${facts.yearBuilt}, impactWindows=${facts.impactWindows}, stormShutters=${facts.stormShutters}`,
      confidence: 0.8,
      sourceRef: `property:${facts.propertyId}:wind_mitigation`,
    });
  }

  return risks;
}

function riskFromFileFinding(
  finding: FileAnalysisFindingInput,
): Risk | null {
  // Map finding rule → category
  const CATEGORY_MAP: Record<FileAnalysisFindingInput["rule"], RiskCategory> = {
    roof_age_insurability: "insurance",
    hoa_reserves_adequate: "hoa",
    sirs_inspection_status: "compliance",
    flood_zone_risk: "flood",
    permit_irregularity: "compliance",
    lien_or_encumbrance: "title",
  };

  const category = CATEGORY_MAP[finding.rule];

  // Review state comes from the finding's resolved flag + requiresReview
  let reviewState: RiskReviewState;
  if (finding.resolved) {
    reviewState = "resolved";
  } else if (finding.requiresReview) {
    reviewState = "review_required";
  } else {
    reviewState = "final";
  }

  return {
    id: `file_${finding.rule}_${finding.id}`,
    category,
    severity: finding.severity,
    source: "file_analysis",
    reviewState,
    title: finding.label,
    buyerSummary: finding.summary,
    internalDetail: finding.resolutionNotes ?? "",
    confidence: finding.confidence,
    sourceRef: `fileAnalysisFindings:${finding.id}`,
  };
}

function riskFromManualEntry(manual: ManualRiskInput): Risk {
  return {
    id: `manual_${manual.id}`,
    category: manual.category,
    severity: manual.severity,
    source: manual.source,
    reviewState: "final",
    title: manual.title,
    buyerSummary: manual.buyerSummary,
    internalDetail: manual.internalDetail,
    confidence: manual.confidence,
    sourceRef: `manualRisks:${manual.id}`,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Classification helpers
// ───────────────────────────────────────────────────────────────────────────

function classifyRoofAge(age: number): {
  severity: RiskSeverity;
  reviewState: RiskReviewState;
  title: string;
  buyerSummary: string;
} {
  if (age >= 20) {
    return {
      severity: "critical",
      reviewState: "review_required",
      title: `Roof age ${age} years — likely uninsurable`,
      buyerSummary: `Roof is ${age} years old. Most Florida insurers decline coverage at 20+ years without replacement. Budget for immediate replacement.`,
    };
  }
  if (age >= 15) {
    return {
      severity: "high",
      reviewState: "review_required",
      title: `Roof age ${age} years — insurance may be limited`,
      buyerSummary: `Roof is ${age} years old. At 15+ years, many Florida carriers require a wind mitigation inspection, charge higher premiums, or decline coverage.`,
    };
  }
  if (age >= 10) {
    return {
      severity: "medium",
      reviewState: "final",
      title: `Roof age ${age} years — monitor`,
      buyerSummary: `Roof is ${age} years old. Still insurable but nearing the Florida insurer threshold.`,
    };
  }
  return {
    severity: "info",
    reviewState: "final",
    title: `Roof age ${age} years`,
    buyerSummary: `Roof is ${age} years old — within typical Florida insurability window.`,
  };
}

function classifyFloodZone(zone: string): {
  severity: RiskSeverity;
  reviewState: RiskReviewState;
  buyerSummary: string;
} {
  const highRisk = ["AE", "VE", "A", "V", "AO", "AH"];
  const lowRisk = ["X", "X500", "B"];

  if (highRisk.some((z) => zone.startsWith(z) && !lowRisk.includes(zone))) {
    return {
      severity: "high",
      reviewState: "review_required",
      buyerSummary: `Property is in FEMA flood zone ${zone}, which requires flood insurance for federally-backed mortgages.`,
    };
  }
  if (lowRisk.includes(zone)) {
    return {
      severity: "low",
      reviewState: "final",
      buyerSummary: `Property is in FEMA flood zone ${zone} — moderate to minimal flood risk. Flood insurance optional.`,
    };
  }
  return {
    severity: "medium",
    reviewState: "review_required",
    buyerSummary: `Property is in FEMA flood zone ${zone}. Confirm insurance requirements with your lender.`,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Aggregation
// ───────────────────────────────────────────────────────────────────────────

function aggregate(risks: Risk[]): RiskSummary {
  const totals = {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const severityRank: Record<RiskSeverity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  let worstSeverity: RiskSeverity = "info";
  let reviewRequiredCount = 0;

  for (const risk of risks) {
    totals[risk.severity]++;
    if (severityRank[risk.severity] > severityRank[worstSeverity]) {
      worstSeverity = risk.severity;
    }
    if (risk.reviewState === "review_required") {
      reviewRequiredCount++;
    }
  }

  const overallConfidence =
    risks.length === 0
      ? 1.0
      : Number(Math.min(...risks.map((r) => r.confidence)).toFixed(2));

  return {
    risks,
    totals,
    worstSeverity,
    reviewRequiredCount,
    overallConfidence,
    composerVersion: RISK_SUMMARY_VERSION,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// View filtering — buyer vs internal
// ───────────────────────────────────────────────────────────────────────────

/** A buyer-safe view strips internal detail fields. */
export interface BuyerRiskView {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  reviewState: RiskReviewState;
  title: string;
  summary: string;
  confidence: number;
}

/**
 * Project a full risk summary into a buyer-safe view. Internal detail,
 * source provenance, and sourceRef are stripped. Review_required risks
 * are included (buyers should know when something is under review) but
 * pending risks may be filtered at the caller's discretion.
 */
export function toBuyerView(summary: RiskSummary): BuyerRiskView[] {
  return summary.risks.map((risk) => ({
    id: risk.id,
    category: risk.category,
    severity: risk.severity,
    reviewState: risk.reviewState,
    title: risk.title,
    summary: risk.buyerSummary,
    confidence: risk.confidence,
  }));
}

/** An internal view preserves all fields. */
export function toInternalView(summary: RiskSummary): RiskSummary {
  return summary;
}
