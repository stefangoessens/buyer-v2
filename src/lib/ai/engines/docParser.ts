/**
 * Document intelligence engine (KIN-821).
 *
 * Pure, deterministic classifier + fact extractor + Florida risk rule
 * engine for uploaded buyer/seller files. This module handles the
 * structured analysis half of the document intelligence pipeline;
 * LLM-driven free-text extraction is a future layer on top.
 *
 * Supported document types (MVP):
 *   - seller_disclosure — Florida seller property disclosure
 *   - hoa_document      — HOA/COA rules, financials, meeting minutes
 *   - inspection_report — home inspector report
 *   - title_commitment  — title insurance commitment
 *   - survey            — boundary/elevation survey
 *   - other             — anything we don't recognize
 *
 * Florida risk rules implemented here:
 *   - roof_age_insurability: Florida insurance cut-off at ~15 years for
 *     most carriers; 20+ years typically uninsurable without replacement
 *   - hoa_reserves_adequate: checks stated reserve balance against
 *     practical thresholds
 *   - sirs_inspection_status: condo structural integrity reserve study
 *     (FL Statutes 718.112(2)(g)); buildings ≥3 stories + ≥30 years old
 *     must have a SIRS and milestone inspection report
 *   - flood_zone_risk: AE/VE zones require flood insurance; X zones don't
 *   - permit_irregularity: unpermitted work flag
 *   - lien_or_encumbrance: title commitment exceptions
 *
 * Every rule emits a Finding with severity (info/low/medium/high/critical),
 * citation (page/line), confidence (0-1), and plain-English summary.
 * High-severity findings MUST be reviewed by a broker before being
 * presented to the buyer as final.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export const DOC_TYPES = [
  "seller_disclosure",
  "hoa_document",
  "inspection_report",
  "title_commitment",
  "survey",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const FINDING_SEVERITIES = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FL_RISK_RULES = [
  "roof_age_insurability",
  "hoa_reserves_adequate",
  "sirs_inspection_status",
  "flood_zone_risk",
  "permit_irregularity",
  "lien_or_encumbrance",
] as const;

export type FlRiskRule = (typeof FL_RISK_RULES)[number];

/** Location in the source document for a finding. */
export interface DocCitation {
  pageNumber?: number;
  lineStart?: number;
  lineEnd?: number;
  /** Raw snippet the finding was extracted from. */
  snippet?: string;
}

/** One structured finding emitted by a risk rule. */
export interface DocFinding {
  rule: FlRiskRule;
  severity: FindingSeverity;
  /** Short human label (e.g., "Roof age 22 years — likely uninsurable"). */
  label: string;
  /** Plain-English summary for the buyer-facing view. */
  summary: string;
  /** 0-1 confidence — propagates into KIN-817 review state. */
  confidence: number;
  citation?: DocCitation;
  /** Whether this finding blocks auto-resolution (broker must review). */
  requiresReview: boolean;
  /** Raw structured data the rule observed. */
  observedData: Record<string, unknown>;
}

/** Typed facts extracted from a classified document. Shape varies per DocType. */
export interface ExtractedFacts {
  // Common
  docType: DocType;
  classifierConfidence: number;
  /** Document creation/effective date if present in the text. */
  effectiveDate?: string;

  // Seller disclosure
  roofAgeYears?: number;
  roofReplacementYear?: number;
  floodZone?: string;
  knownLeaks?: boolean;
  priorClaimsCount?: number;
  permitsDisclosed?: "yes" | "no" | "unknown";
  unpermittedWorkMentioned?: boolean;

  // HOA document
  hoaReserveBalance?: number;
  hoaAnnualBudget?: number;
  hoaSpecialAssessments?: Array<{ amount: number; purpose: string }>;
  hoaReserveStudyDate?: string;

  // Condo-specific (SIRS / milestone inspection)
  buildingYearBuilt?: number;
  buildingStories?: number;
  milestoneInspectionDate?: string;
  sirsCompletedDate?: string;

  // Title commitment
  titleExceptions?: string[];
  lienCount?: number;

  // Inspection report
  majorDefectCount?: number;
  recommendedRepairsCount?: number;
}

/** Full output of the document intelligence engine for one file. */
export interface DocAnalysisResult {
  docType: DocType;
  facts: ExtractedFacts;
  findings: DocFinding[];
  overallSeverity: FindingSeverity;
  overallConfidence: number;
  requiresBrokerReview: boolean;
  plainEnglishSummary: string;
  engineVersion: string;
}

/** Builder version — bump on any rule/output-shape change. */
export const DOC_PARSER_VERSION = "1.0.0";

// ───────────────────────────────────────────────────────────────────────────
// Page-level classifier
// ───────────────────────────────────────────────────────────────────────────

/**
 * Classify a document's type from its text content. Uses distinctive
 * keyword patterns per document type. Returns the best match with a
 * confidence score. Falls back to "other" when no type scores high
 * enough.
 */
export function classifyDocument(text: string): {
  docType: DocType;
  confidence: number;
} {
  const lower = text.toLowerCase();

  const scores: Record<DocType, number> = {
    seller_disclosure: 0,
    hoa_document: 0,
    inspection_report: 0,
    title_commitment: 0,
    survey: 0,
    other: 0,
  };

  // Seller disclosure markers
  if (lower.includes("seller's property disclosure")) scores.seller_disclosure += 3;
  if (lower.includes("sellers property disclosure")) scores.seller_disclosure += 3;
  if (lower.includes("property disclosure statement")) scores.seller_disclosure += 2;
  if (/known.{0,20}defects/.test(lower)) scores.seller_disclosure += 1;
  if (lower.includes("lead-based paint")) scores.seller_disclosure += 1;

  // HOA document markers
  if (lower.includes("homeowners association")) scores.hoa_document += 2;
  if (lower.includes("condominium association")) scores.hoa_document += 2;
  if (lower.includes("reserve study")) scores.hoa_document += 2;
  if (lower.includes("reserve balance")) scores.hoa_document += 2;
  if (lower.includes("annual budget")) scores.hoa_document += 1;
  if (lower.includes("special assessment")) scores.hoa_document += 1;
  if (/(milestone inspection|structural integrity reserve study|sirs)/i.test(text)) {
    scores.hoa_document += 2;
  }

  // Inspection report markers
  if (lower.includes("home inspection report")) scores.inspection_report += 3;
  if (lower.includes("inspector license")) scores.inspection_report += 2;
  if (lower.includes("defects noted")) scores.inspection_report += 1;
  if (lower.includes("recommended repairs")) scores.inspection_report += 1;
  if (lower.includes("wind mitigation")) scores.inspection_report += 1;
  if (lower.includes("four-point inspection")) scores.inspection_report += 1;

  // Title commitment markers
  if (lower.includes("title commitment")) scores.title_commitment += 3;
  if (lower.includes("schedule b")) scores.title_commitment += 2;
  if (lower.includes("exceptions from coverage")) scores.title_commitment += 2;
  if (lower.includes("title insurance")) scores.title_commitment += 1;

  // Survey markers
  if (lower.includes("boundary survey")) scores.survey += 3;
  if (lower.includes("elevation certificate")) scores.survey += 2;
  if (lower.includes("legal description")) scores.survey += 1;

  // Pick best
  let bestType: DocType = "other";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores) as Array<[DocType, number]>) {
    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }

  // Normalize score to a confidence (soft cap at 5)
  const confidence = bestScore >= 3 ? Math.min(bestScore / 5, 0.95) : 0;
  return {
    docType: bestScore >= 3 ? bestType : "other",
    confidence: bestScore >= 3 ? confidence : 0.3,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Florida risk rules
// ───────────────────────────────────────────────────────────────────────────

/** Florida insurance roof age threshold in years. */
const ROOF_AGE_WARNING_YEARS = 15;
const ROOF_AGE_CRITICAL_YEARS = 20;

/** Minimum HOA reserves-to-budget ratio considered adequate. */
const HOA_RESERVE_ADEQUATE_RATIO = 0.1;

/** FL SIRS threshold: buildings 3+ stories and 30+ years old. */
const SIRS_STORY_THRESHOLD = 3;
const SIRS_AGE_THRESHOLD_YEARS = 30;

/**
 * Apply all Florida risk rules to a set of extracted facts. Returns
 * every finding the rules emit. Findings aggregate per-rule confidence
 * with per-fact availability.
 */
export function applyFlRiskRules(
  facts: ExtractedFacts,
  today: string,
): DocFinding[] {
  const findings: DocFinding[] = [];

  // ─── Roof age
  const roofFinding = checkRoofAge(facts, today);
  if (roofFinding) findings.push(roofFinding);

  // ─── HOA reserves
  const reservesFinding = checkHoaReserves(facts);
  if (reservesFinding) findings.push(reservesFinding);

  // ─── SIRS / milestone inspection
  const sirsFinding = checkSirsStatus(facts, today);
  if (sirsFinding) findings.push(sirsFinding);

  // ─── Flood zone
  const floodFinding = checkFloodZone(facts);
  if (floodFinding) findings.push(floodFinding);

  // ─── Permit irregularities
  const permitFinding = checkPermits(facts);
  if (permitFinding) findings.push(permitFinding);

  // ─── Title liens / encumbrances
  const lienFinding = checkLiens(facts);
  if (lienFinding) findings.push(lienFinding);

  return findings;
}

function checkRoofAge(facts: ExtractedFacts, today: string): DocFinding | null {
  let ageYears = facts.roofAgeYears;

  // Derive from replacement year if not stated directly
  if (
    ageYears === undefined &&
    typeof facts.roofReplacementYear === "number"
  ) {
    const currentYear = Number(today.slice(0, 4));
    if (Number.isFinite(currentYear)) {
      ageYears = currentYear - facts.roofReplacementYear;
    }
  }

  if (typeof ageYears !== "number" || ageYears < 0) return null;

  let severity: FindingSeverity = "info";
  let label = "Roof age acceptable";
  let summary = `Roof is ${ageYears} years old — within typical Florida insurability window.`;
  let requiresReview = false;

  if (ageYears >= ROOF_AGE_CRITICAL_YEARS) {
    severity = "critical";
    label = `Roof age ${ageYears} years — likely uninsurable`;
    summary = `Roof is ${ageYears} years old. Most Florida insurers decline coverage at 20+ years without replacement. Budget for immediate replacement and confirm binder availability before closing.`;
    requiresReview = true;
  } else if (ageYears >= ROOF_AGE_WARNING_YEARS) {
    severity = "high";
    label = `Roof age ${ageYears} years — insurance may be limited`;
    summary = `Roof is ${ageYears} years old. At 15+ years, many Florida carriers require a wind mitigation inspection, charge higher premiums, or decline coverage. Confirm available carriers during the inspection period.`;
    requiresReview = true;
  }

  return {
    rule: "roof_age_insurability",
    severity,
    label,
    summary,
    confidence: 0.9,
    requiresReview,
    observedData: { roofAgeYears: ageYears },
  };
}

function checkHoaReserves(facts: ExtractedFacts): DocFinding | null {
  if (
    typeof facts.hoaReserveBalance !== "number" ||
    typeof facts.hoaAnnualBudget !== "number" ||
    facts.hoaAnnualBudget <= 0
  ) {
    return null;
  }

  const ratio = facts.hoaReserveBalance / facts.hoaAnnualBudget;
  const inadequate = ratio < HOA_RESERVE_ADEQUATE_RATIO;

  return {
    rule: "hoa_reserves_adequate",
    severity: inadequate ? "high" : "low",
    label: inadequate
      ? `HOA reserves ${Math.round(ratio * 100)}% of annual budget`
      : `HOA reserves ${Math.round(ratio * 100)}% of annual budget`,
    summary: inadequate
      ? `HOA reserves of $${facts.hoaReserveBalance.toLocaleString()} are only ${Math.round(ratio * 100)}% of the $${facts.hoaAnnualBudget.toLocaleString()} annual budget. Under-funded reserves are a leading cause of future special assessments.`
      : `HOA reserves of $${facts.hoaReserveBalance.toLocaleString()} cover ${Math.round(ratio * 100)}% of the annual budget — above the ${Math.round(HOA_RESERVE_ADEQUATE_RATIO * 100)}% minimum benchmark.`,
    confidence: 0.85,
    requiresReview: inadequate,
    observedData: {
      hoaReserveBalance: facts.hoaReserveBalance,
      hoaAnnualBudget: facts.hoaAnnualBudget,
      ratio: Number(ratio.toFixed(3)),
    },
  };
}

function checkSirsStatus(
  facts: ExtractedFacts,
  today: string,
): DocFinding | null {
  const stories = facts.buildingStories;
  const built = facts.buildingYearBuilt;

  if (typeof stories !== "number" || typeof built !== "number") return null;

  const currentYear = Number(today.slice(0, 4));
  if (!Number.isFinite(currentYear)) return null;

  const ageYears = currentYear - built;
  if (stories < SIRS_STORY_THRESHOLD || ageYears < SIRS_AGE_THRESHOLD_YEARS) {
    // SIRS requirement doesn't apply — emit info only
    return {
      rule: "sirs_inspection_status",
      severity: "info",
      label: "SIRS requirement not applicable",
      summary: `Building is ${stories} stories, ${ageYears} years old — below Florida SIRS requirement thresholds.`,
      confidence: 0.95,
      requiresReview: false,
      observedData: { stories, buildingYearBuilt: built, ageYears },
    };
  }

  // SIRS/milestone inspection IS required
  const hasMilestone = Boolean(facts.milestoneInspectionDate);
  const hasSirs = Boolean(facts.sirsCompletedDate);

  if (hasMilestone && hasSirs) {
    return {
      rule: "sirs_inspection_status",
      severity: "info",
      label: "SIRS and milestone inspection completed",
      summary: `Building meets Florida SIRS thresholds (${stories} stories, ${ageYears} years old) and has completed both milestone inspection and SIRS.`,
      confidence: 0.9,
      requiresReview: false,
      observedData: {
        stories,
        ageYears,
        milestoneInspectionDate: facts.milestoneInspectionDate,
        sirsCompletedDate: facts.sirsCompletedDate,
      },
    };
  }

  return {
    rule: "sirs_inspection_status",
    severity: "critical",
    label: "Missing SIRS / milestone inspection on a qualifying building",
    summary: `Building is ${stories} stories and ${ageYears} years old — Florida law (FS 718.112) requires a milestone inspection and structural integrity reserve study. ${!hasMilestone ? "Milestone inspection is missing. " : ""}${!hasSirs ? "SIRS is missing. " : ""}These findings can trigger immediate special assessments.`,
    confidence: 0.9,
    requiresReview: true,
    observedData: {
      stories,
      buildingYearBuilt: built,
      ageYears,
      hasMilestone,
      hasSirs,
    },
  };
}

function checkFloodZone(facts: ExtractedFacts): DocFinding | null {
  if (!facts.floodZone) return null;

  const zone = facts.floodZone.toUpperCase().trim();
  const highRiskZones = ["AE", "VE", "A", "V", "AO", "AH"];
  const moderateRiskZones = ["X", "X500", "B"];

  if (highRiskZones.some((z) => zone.startsWith(z) && !moderateRiskZones.includes(zone))) {
    return {
      rule: "flood_zone_risk",
      severity: "high",
      label: `Flood zone ${zone} — flood insurance required`,
      summary: `Property is in FEMA flood zone ${zone}, which requires flood insurance for federally-backed mortgages. Verify binding quotes before closing and budget for annual premiums.`,
      confidence: 0.95,
      requiresReview: true,
      observedData: { floodZone: zone },
    };
  }

  if (moderateRiskZones.includes(zone)) {
    return {
      rule: "flood_zone_risk",
      severity: "low",
      label: `Flood zone ${zone} — moderate/minimal risk`,
      summary: `Property is in FEMA flood zone ${zone}, which is considered moderate-to-minimal flood risk. Flood insurance is optional but recommended for Florida coastal properties.`,
      confidence: 0.9,
      requiresReview: false,
      observedData: { floodZone: zone },
    };
  }

  return {
    rule: "flood_zone_risk",
    severity: "medium",
    label: `Flood zone ${zone} — verification needed`,
    summary: `Property is in FEMA flood zone ${zone}. Confirm flood insurance requirements with your lender.`,
    confidence: 0.5,
    requiresReview: true,
    observedData: { floodZone: zone },
  };
}

function checkPermits(facts: ExtractedFacts): DocFinding | null {
  if (!facts.unpermittedWorkMentioned && facts.permitsDisclosed !== "no") {
    return null;
  }

  return {
    rule: "permit_irregularity",
    severity: "high",
    label: "Unpermitted work disclosed",
    summary: `Seller disclosure or inspection report mentions unpermitted work. Unpermitted additions can void insurance claims, trigger code enforcement, and require retroactive permits at the buyer's cost. Verify with the county building department before closing.`,
    confidence: 0.8,
    requiresReview: true,
    observedData: {
      unpermittedWorkMentioned: facts.unpermittedWorkMentioned ?? false,
      permitsDisclosed: facts.permitsDisclosed,
    },
  };
}

function checkLiens(facts: ExtractedFacts): DocFinding | null {
  if (typeof facts.lienCount !== "number" || facts.lienCount <= 0) {
    return null;
  }

  return {
    rule: "lien_or_encumbrance",
    severity: facts.lienCount >= 2 ? "critical" : "high",
    label: `${facts.lienCount} lien(s) on title`,
    summary: `Title commitment shows ${facts.lienCount} lien(s) or encumbrance(s). These must be cleared before closing. Request the Schedule B exceptions from the title company and confirm the clearance plan.`,
    confidence: 0.95,
    requiresReview: true,
    observedData: {
      lienCount: facts.lienCount,
      titleExceptions: facts.titleExceptions,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Top-level analysis
// ───────────────────────────────────────────────────────────────────────────

/**
 * Analyze a single document: classify, apply risk rules, aggregate
 * severity, and decide whether a broker must review before buyer sees
 * the final result.
 *
 * Extracted facts are passed in (the caller is responsible for the
 * type-specific extraction step). This layer is the deterministic
 * aggregation that maps facts → findings → severity → review state.
 */
export function analyzeDocument(args: {
  text: string;
  extractedFacts: Partial<ExtractedFacts>;
  today: string;
}): DocAnalysisResult {
  const { docType, confidence: classifierConfidence } = classifyDocument(args.text);

  const facts: ExtractedFacts = {
    ...args.extractedFacts,
    docType,
    classifierConfidence,
  };

  const findings = applyFlRiskRules(facts, args.today);

  // Overall severity = worst individual finding
  const severityRank: Record<FindingSeverity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  let worstSeverity: FindingSeverity = "info";
  for (const f of findings) {
    if (severityRank[f.severity] > severityRank[worstSeverity]) {
      worstSeverity = f.severity;
    }
  }

  const requiresBrokerReview = findings.some((f) => f.requiresReview);

  // Overall confidence = min of classifier + finding confidences
  const overallConfidence =
    findings.length === 0
      ? classifierConfidence
      : Math.min(classifierConfidence, ...findings.map((f) => f.confidence));

  const plainEnglishSummary = buildSummary(docType, findings, worstSeverity);

  return {
    docType,
    facts,
    findings,
    overallSeverity: worstSeverity,
    overallConfidence: Number(overallConfidence.toFixed(2)),
    requiresBrokerReview,
    plainEnglishSummary,
    engineVersion: DOC_PARSER_VERSION,
  };
}

function buildSummary(
  docType: DocType,
  findings: DocFinding[],
  worst: FindingSeverity,
): string {
  const typeLabel = docType.replaceAll("_", " ");
  if (findings.length === 0) {
    return `Analyzed ${typeLabel}. No risk flags detected from the rules engine.`;
  }
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;

  const parts: string[] = [`Analyzed ${typeLabel}. Overall severity: ${worst}.`];
  if (critical > 0) parts.push(`${critical} critical finding${critical === 1 ? "" : "s"}`);
  if (high > 0) parts.push(`${high} high-severity finding${high === 1 ? "" : "s"}`);
  if (medium > 0) parts.push(`${medium} medium-severity finding${medium === 1 ? "" : "s"}`);
  return parts.join("; ");
}
