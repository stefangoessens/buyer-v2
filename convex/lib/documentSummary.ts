/**
 * Buyer-safe document summary composer (KIN-852).
 *
 * Convex-side mirror of `src/lib/dealroom/document-summary.ts`.
 * Keep in sync.
 */

export type DocumentAnalysisStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "review_required";

export type DocumentReviewState = "pending" | "approved" | "rejected";

export type DocumentType =
  | "seller_disclosure"
  | "hoa_doc"
  | "inspection_report"
  | "title_commitment"
  | "survey"
  | "appraisal"
  | "loan_estimate"
  | "purchase_contract"
  | "other";

export type SummaryStatus =
  | "available"
  | "pending"
  | "partial"
  | "review_required"
  | "unavailable";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface RawFileAnalysis {
  _id: string;
  documentId: string;
  dealRoomId: string;
  documentType: DocumentType;
  fileName: string;
  status: DocumentAnalysisStatus;
  reviewState: DocumentReviewState;
  factsPayload: string;
  reviewNotes?: string;
  confidence: number;
  severity: Severity;
  uploadedAt: string;
  analyzedAt?: string;
  reviewedAt?: string;
  extractedPageCount: number;
  totalPageCount: number;
}

export interface BuyerDocumentSummary {
  documentId: string;
  fileName: string;
  documentType: DocumentType;
  status: SummaryStatus;
  severity: Severity;
  headline: string;
  keyFacts: string[];
  progress: number | null;
  reason: string | null;
  uploadedAt: string;
}

export interface InternalDocumentSummary extends BuyerDocumentSummary {
  reviewState: DocumentReviewState;
  reviewNotes: string | null;
  confidence: number;
  rawFactsPayload: string;
  analysisStatus: DocumentAnalysisStatus;
  analyzedAt: string | null;
  reviewedAt: string | null;
}

function buildBaseSummary(
  analysis: RawFileAnalysis,
  severityPolicy: "raw" | "buyer_downgrade",
): BuyerDocumentSummary {
  const status = computeSummaryStatus(analysis);
  const severity =
    severityPolicy === "raw"
      ? analysis.severity
      : status === "available" || status === "partial"
        ? analysis.severity
        : "info";
  return {
    documentId: analysis.documentId,
    fileName: analysis.fileName,
    documentType: analysis.documentType,
    status,
    severity,
    headline: buildHeadline(analysis, status),
    keyFacts: extractBuyerSafeFacts(analysis),
    progress: status === "partial" ? computeProgress(analysis) : null,
    reason: buildReason(analysis, status),
    uploadedAt: analysis.uploadedAt,
  };
}

export function projectBuyerSummary(
  analysis: RawFileAnalysis,
): BuyerDocumentSummary {
  return buildBaseSummary(analysis, "buyer_downgrade");
}

export function projectInternalSummary(
  analysis: RawFileAnalysis,
): InternalDocumentSummary {
  return {
    ...buildBaseSummary(analysis, "raw"),
    reviewState: analysis.reviewState,
    reviewNotes: analysis.reviewNotes ?? null,
    confidence: analysis.confidence,
    rawFactsPayload: analysis.factsPayload,
    analysisStatus: analysis.status,
    analyzedAt: analysis.analyzedAt ?? null,
    reviewedAt: analysis.reviewedAt ?? null,
  };
}

export function computeSummaryStatus(analysis: RawFileAnalysis): SummaryStatus {
  if (analysis.status === "queued" || analysis.status === "running") {
    if (analysis.extractedPageCount > 0 && analysis.totalPageCount > 0) {
      return "partial";
    }
    return "pending";
  }
  if (analysis.status === "failed") return "unavailable";
  if (analysis.status === "review_required") return "review_required";
  if (analysis.reviewState === "rejected") return "unavailable";
  if (analysis.reviewState === "pending") return "review_required";
  return "available";
}

function buildHeadline(
  analysis: RawFileAnalysis,
  status: SummaryStatus,
): string {
  if (status === "pending") return "Document analysis queued";
  if (status === "partial") return "Analysis in progress";
  if (status === "review_required") return "Awaiting broker review";
  if (status === "unavailable") return "Analysis unavailable";
  switch (analysis.documentType) {
    case "seller_disclosure": return "Seller disclosure analyzed";
    case "hoa_doc": return "HOA document analyzed";
    case "inspection_report": return "Inspection report analyzed";
    case "title_commitment": return "Title commitment analyzed";
    case "survey": return "Survey analyzed";
    case "appraisal": return "Appraisal analyzed";
    case "loan_estimate": return "Loan estimate analyzed";
    case "purchase_contract": return "Purchase contract analyzed";
    default: return "Document analyzed";
  }
}

function extractBuyerSafeFacts(analysis: RawFileAnalysis): string[] {
  if (!analysis.factsPayload) return [];
  try {
    const parsed = JSON.parse(analysis.factsPayload) as { buyerFacts?: unknown };
    if (!Array.isArray(parsed.buyerFacts)) return [];
    return parsed.buyerFacts
      .filter((f): f is string => typeof f === "string")
      .slice(0, 3);
  } catch {
    return [];
  }
}

function computeProgress(analysis: RawFileAnalysis): number {
  if (analysis.totalPageCount <= 0) return 0;
  return Math.min(
    1,
    Math.max(0, analysis.extractedPageCount / analysis.totalPageCount),
  );
}

function buildReason(
  analysis: RawFileAnalysis,
  status: SummaryStatus,
): string | null {
  if (status === "available") return null;
  if (status === "pending") {
    return "We're analyzing this document — check back shortly.";
  }
  if (status === "partial") {
    return `Analyzed ${analysis.extractedPageCount} of ${analysis.totalPageCount} pages so far.`;
  }
  if (status === "review_required") {
    return "Your broker is reviewing this document before we share findings.";
  }
  if (analysis.status === "failed") {
    return "We couldn't analyze this document. Your broker has been notified.";
  }
  return "Document analysis is not available.";
}

export function filterForBuyer(
  analyses: RawFileAnalysis[],
): RawFileAnalysis[] {
  return analyses.filter((a) => a.reviewState !== "rejected");
}

export function sortByPriority<T extends BuyerDocumentSummary>(
  summaries: T[],
): T[] {
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  return summaries.slice().sort((a, b) => {
    const aSev = severityOrder[a.severity];
    const bSev = severityOrder[b.severity];
    if (aSev !== bSev) return aSev - bSev;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });
}
