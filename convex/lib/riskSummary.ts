/**
 * Deal-room risk summary read model (KIN-875).
 *
 * Convex-side mirror of `src/lib/dealroom/risk-summary.ts`. Keep in sync.
 */

export const RISK_NAMES = [
  "flood_zone_exposure",
  "hoa_constraints",
  "insurance_bindability",
  "inspection_document_review",
  "financing_document_review",
  "appraisal_document_review",
  "title_document_review",
  "insurance_document_review",
  "hoa_document_review",
  "walkthrough_document_review",
  "closing_document_review",
  "other_document_review",
] as const;

export type RiskName = (typeof RISK_NAMES)[number];

export const RISK_SOURCES = [
  "canonical_property",
  "file_analysis",
] as const;

export type RiskSource = (typeof RISK_SOURCES)[number];

export const RISK_SEVERITIES = ["low", "medium", "high"] as const;

export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_REVIEW_STATES = ["ready", "review_required"] as const;

export type RiskReviewState = (typeof RISK_REVIEW_STATES)[number];

export const RISK_VISIBILITIES = ["shared", "internal"] as const;

export type RiskVisibility = (typeof RISK_VISIBILITIES)[number];

export type RiskSummaryStatus = "clear" | "attention" | "review_required";

export type RiskRole = "buyer" | "broker" | "admin";

export type RiskMilestoneWorkstream =
  | "inspection"
  | "financing"
  | "appraisal"
  | "title"
  | "insurance"
  | "escrow"
  | "hoa"
  | "walkthrough"
  | "closing"
  | "other";

export type RiskMilestoneStatus =
  | "pending"
  | "completed"
  | "overdue"
  | "needs_review";

export type RiskMilestoneReviewReason =
  | "low_confidence"
  | "ambiguous_date"
  | "missing_required"
  | "date_in_past"
  | "manual_flag";

export interface RiskPropertySnapshot {
  floodZone?: string;
  hoaFee?: number;
  roofYear?: number;
  yearBuilt?: number;
  impactWindows?: boolean;
  stormShutters?: boolean;
}

export interface RiskMilestoneSnapshot {
  id: string;
  name: string;
  workstream: RiskMilestoneWorkstream;
  dueDate: string;
  status: RiskMilestoneStatus;
  flaggedForReview: boolean;
  reviewReason?: RiskMilestoneReviewReason;
  confidence?: number;
}

export interface RiskSummaryInputs {
  dealRoomId: string;
  propertyId: string;
  updatedAt: string;
  property?: RiskPropertySnapshot;
  milestones: RiskMilestoneSnapshot[];
}

export interface RiskSummaryItemInternal {
  sourceRecordType: "contract_milestone";
  sourceRecordId: string;
  reviewReason?: RiskMilestoneReviewReason;
  confidence?: number;
}

export interface RiskSummaryItem {
  id: string;
  name: RiskName;
  title: string;
  summary: string;
  severity: RiskSeverity;
  source: RiskSource;
  reviewState: RiskReviewState;
  visibility: RiskVisibility;
  dueDate?: string;
  internal?: RiskSummaryItemInternal;
}

export interface RiskSummaryCounts {
  total: number;
  low: number;
  medium: number;
  high: number;
  reviewRequired: number;
}

export interface DealRoomRiskSummary {
  dealRoomId: string;
  propertyId: string;
  updatedAt: string;
  status: RiskSummaryStatus;
  highestSeverity: RiskSeverity | null;
  counts: RiskSummaryCounts;
  items: RiskSummaryItem[];
  internal?: {
    hiddenFromBuyer: number;
    totalBeforeFiltering: number;
    sourceCounts: {
      canonical_property: number;
      file_analysis: number;
    };
  };
}

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function composeRiskSummary(
  inputs: RiskSummaryInputs,
  options: { forRole: RiskRole } = { forRole: "buyer" },
): DealRoomRiskSummary {
  const summaryYear = parseSummaryYear(inputs.updatedAt);
  const allItems = [
    ...derivePropertyRisks(inputs.property, summaryYear),
    ...deriveFileAnalysisRisks(inputs.milestones),
  ].sort(compareRiskItems);

  const visibleItems =
    options.forRole === "buyer"
      ? allItems
          .filter((item) => item.visibility === "shared")
          .map(stripInternalFields)
      : allItems;

  return {
    dealRoomId: inputs.dealRoomId,
    propertyId: inputs.propertyId,
    updatedAt: inputs.updatedAt,
    status: summarizeStatus(visibleItems),
    highestSeverity: summarizeHighestSeverity(visibleItems),
    counts: buildCounts(visibleItems),
    items: visibleItems,
    internal:
      options.forRole === "buyer"
        ? undefined
        : {
            hiddenFromBuyer: allItems.filter((item) => item.visibility === "internal")
              .length,
            totalBeforeFiltering: allItems.length,
            sourceCounts: {
              canonical_property: allItems.filter(
                (item) => item.source === "canonical_property",
              ).length,
              file_analysis: allItems.filter(
                (item) => item.source === "file_analysis",
              ).length,
            },
          },
  };
}

function derivePropertyRisks(
  property: RiskPropertySnapshot | undefined,
  summaryYear: number,
): Array<RiskSummaryItem> {
  if (!property) return [];

  const items: Array<RiskSummaryItem> = [];

  const floodZone = property.floodZone?.trim().toUpperCase();
  if (floodZone && floodZone !== "X") {
    const highExposure = floodZone.startsWith("V");
    items.push({
      id: "property:flood_zone_exposure",
      name: "flood_zone_exposure",
      title: "Flood-zone exposure",
      summary: highExposure
        ? `Flood zone ${floodZone} can materially increase insurance cost and underwriting scrutiny.`
        : `Flood zone ${floodZone} may require extra insurance review before closing.`,
      severity: highExposure ? "high" : "medium",
      source: "canonical_property",
      reviewState: "ready",
      visibility: "shared",
    });
  }

  if ((property.hoaFee ?? 0) > 0) {
    items.push({
      id: "property:hoa_constraints",
      name: "hoa_constraints",
      title: "HOA and condo constraints",
      summary:
        "Recurring HOA dues and association rules should be reviewed alongside the total monthly payment.",
      severity: "low",
      source: "canonical_property",
      reviewState: "ready",
      visibility: "shared",
    });
  }

  const referenceYear = property.roofYear ?? property.yearBuilt;
  if (referenceYear) {
    const roofAge = summaryYear - referenceYear;
    if (roofAge >= 20) {
      const hardened =
        property.impactWindows === true || property.stormShutters === true;
      items.push({
        id: "property:insurance_bindability",
        name: "insurance_bindability",
        title: "Insurance bindability",
        summary: hardened
          ? `Older roof profile (${roofAge}+ years) may still need extra insurer review despite wind-hardening features.`
          : `Older roof profile (${roofAge}+ years) without clear wind-hardening can increase insurance and bindability risk.`,
        severity: hardened ? "medium" : "high",
        source: "canonical_property",
        reviewState: "ready",
        visibility: "shared",
      });
    }
  }

  return items;
}

function deriveFileAnalysisRisks(
  milestones: Array<RiskMilestoneSnapshot>,
): Array<RiskSummaryItem> {
  return milestones
    .filter((milestone) => milestone.flaggedForReview || milestone.status === "needs_review")
    .map((milestone) => {
      const severity = severityForReviewReason(milestone.reviewReason);
      return {
        id: `milestone:${milestone.id}`,
        name: riskNameForWorkstream(milestone.workstream),
        title: `${workstreamLabel(milestone.workstream)} review required`,
        summary: `${milestone.name} needs manual review before it drives buyer-facing guidance.`,
        severity,
        source: "file_analysis",
        reviewState: "review_required",
        visibility: "internal",
        dueDate: milestone.dueDate,
        internal: {
          sourceRecordType: "contract_milestone",
          sourceRecordId: milestone.id,
          reviewReason: milestone.reviewReason,
          confidence: milestone.confidence,
        },
      };
    });
}

function severityForReviewReason(
  reason: RiskMilestoneReviewReason | undefined,
): RiskSeverity {
  if (reason === "missing_required" || reason === "date_in_past") {
    return "high";
  }
  return "medium";
}

function riskNameForWorkstream(
  workstream: RiskMilestoneWorkstream,
): RiskName {
  switch (workstream) {
    case "inspection":
      return "inspection_document_review";
    case "financing":
      return "financing_document_review";
    case "appraisal":
      return "appraisal_document_review";
    case "title":
      return "title_document_review";
    case "insurance":
      return "insurance_document_review";
    case "hoa":
      return "hoa_document_review";
    case "walkthrough":
      return "walkthrough_document_review";
    case "closing":
      return "closing_document_review";
    case "escrow":
    case "other":
      return "other_document_review";
  }
}

function workstreamLabel(workstream: RiskMilestoneWorkstream): string {
  switch (workstream) {
    case "inspection":
      return "Inspection";
    case "financing":
      return "Financing";
    case "appraisal":
      return "Appraisal";
    case "title":
      return "Title";
    case "insurance":
      return "Insurance";
    case "escrow":
      return "Escrow";
    case "hoa":
      return "HOA";
    case "walkthrough":
      return "Walkthrough";
    case "closing":
      return "Closing";
    case "other":
      return "Document";
  }
}

function stripInternalFields(item: RiskSummaryItem): RiskSummaryItem {
  const { internal: _internal, ...buyerSafe } = item;
  return buyerSafe;
}

function summarizeStatus(
  items: Array<RiskSummaryItem>,
): RiskSummaryStatus {
  if (items.some((item) => item.reviewState === "review_required")) {
    return "review_required";
  }
  if (items.length > 0) return "attention";
  return "clear";
}

function summarizeHighestSeverity(
  items: Array<RiskSummaryItem>,
): RiskSeverity | null {
  if (items.length === 0) return null;

  return items.reduce<RiskSeverity>(
    (highest, item) =>
      SEVERITY_ORDER[item.severity] > SEVERITY_ORDER[highest]
        ? item.severity
        : highest,
    "low",
  );
}

function buildCounts(items: Array<RiskSummaryItem>): RiskSummaryCounts {
  return {
    total: items.length,
    low: items.filter((item) => item.severity === "low").length,
    medium: items.filter((item) => item.severity === "medium").length,
    high: items.filter((item) => item.severity === "high").length,
    reviewRequired: items.filter(
      (item) => item.reviewState === "review_required",
    ).length,
  };
}

function compareRiskItems(a: RiskSummaryItem, b: RiskSummaryItem): number {
  if (a.reviewState !== b.reviewState) {
    return a.reviewState === "review_required" ? -1 : 1;
  }
  return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
}

function parseSummaryYear(updatedAt: string): number {
  const parsed = Number.parseInt(updatedAt.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : new Date().getUTCFullYear();
}
