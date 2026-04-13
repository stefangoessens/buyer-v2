/**
 * Buyer-safe document summary composer (KIN-852).
 *
 * Pure TS — used by Convex backend and the deal-room document panel.
 * Takes raw file analysis records (from the upload + extraction
 * pipeline) and projects them into a buyer-safe summary shape.
 *
 * Internal-only fields (raw extracted fact graphs, broker review notes,
 * confidence per fact, model + prompt provenance) are stripped at the
 * boundary. The buyer sees a curated summary with severity, headline,
 * and a small set of structured key facts — never the raw extraction
 * payload.
 *
 * Status tags:
 *   - "available": analysis complete and approved, summary ready to show
 *   - "pending": analysis still running or queued
 *   - "partial": some facts extracted, but the document is still being
 *     processed (progressive render)
 *   - "review_required": flagged by an internal reviewer; buyer sees a
 *     placeholder until the broker signs off
 *   - "unavailable": no analysis exists or the extraction failed
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

/** Raw input shape from the file analysis pipeline. */
export interface RawFileAnalysis {
  _id: string;
  documentId: string;
  dealRoomId: string;
  documentType: DocumentType;
  fileName: string;
  status: DocumentAnalysisStatus;
  reviewState: DocumentReviewState;
  /** JSON-serialized fact extraction payload. */
  factsPayload: string;
  /** JSON-serialized internal review notes — never returned to buyer. */
  reviewNotes?: string;
  /** Confidence 0-1 from the extraction engine. */
  confidence: number;
  /** Severity tag assigned by the rule engine. */
  severity: Severity;
  uploadedAt: string;
  analyzedAt?: string;
  reviewedAt?: string;
  /** Pages or sections extracted so far (for partial state). */
  extractedPageCount: number;
  totalPageCount: number;
}

/** Buyer-facing summary row. */
export interface BuyerDocumentSummary {
  documentId: string;
  fileName: string;
  documentType: DocumentType;
  status: SummaryStatus;
  severity: Severity;
  /** Short headline rendered as the main label in the document panel. */
  headline: string;
  /** 1-3 buyer-safe key facts derived from the extraction payload. */
  keyFacts: string[];
  /** Progress fraction 0-1 when status is "partial". */
  progress: number | null;
  /** Reason text shown for non-available statuses. */
  reason: string | null;
  uploadedAt: string;
}

/** Internal summary keeps everything from the buyer view + internal extras. */
export interface InternalDocumentSummary extends BuyerDocumentSummary {
  reviewState: DocumentReviewState;
  reviewNotes: string | null;
  confidence: number;
  rawFactsPayload: string;
  analysisStatus: DocumentAnalysisStatus;
  analyzedAt: string | null;
  reviewedAt: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// Composer
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build the base summary row shared by buyer and internal projections.
 * `severityPolicy` controls whether the raw engine severity is passed
 * through ("raw" — used for broker/admin) or downgraded to "info" on
 * non-visible statuses ("buyer_downgrade" — avoids showing a buyer a
 * "critical" badge on a document that hasn't been approved yet).
 */
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

/**
 * Project a raw file analysis into the buyer-safe summary shape.
 * Internal fields are stripped here — callers can never accidentally
 * leak them to a buyer-facing surface. Severity is downgraded to
 * "info" on non-visible statuses so buyers don't see urgency badges
 * on unreviewed documents.
 */
export function projectBuyerSummary(
  analysis: RawFileAnalysis,
): BuyerDocumentSummary {
  return buildBaseSummary(analysis, "buyer_downgrade");
}

/**
 * Project into the full internal summary (broker/admin view).
 * Preserves the raw severity — broker/admin need the true urgency
 * level even on pending/review-required/unavailable analyses, or
 * severity-based ops ordering hides urgent items.
 */
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

// ───────────────────────────────────────────────────────────────────────────
// Status / projection helpers
// ───────────────────────────────────────────────────────────────────────────

/** Compute the buyer-facing summary status from raw analysis state. */
export function computeSummaryStatus(analysis: RawFileAnalysis): SummaryStatus {
  if (analysis.status === "queued" || analysis.status === "running") {
    // Still in flight — partial if we have some extracted pages, pending otherwise.
    if (analysis.extractedPageCount > 0 && analysis.totalPageCount > 0) {
      return "partial";
    }
    return "pending";
  }
  if (analysis.status === "failed") {
    return "unavailable";
  }
  if (analysis.status === "review_required") {
    return "review_required";
  }
  // Succeeded — gated on review state.
  if (analysis.reviewState === "rejected") {
    return "unavailable";
  }
  if (analysis.reviewState === "pending") {
    return "review_required";
  }
  return "available";
}

/** Build the buyer-facing headline based on document type + status. */
function buildHeadline(
  analysis: RawFileAnalysis,
  status: SummaryStatus,
): string {
  if (status === "pending") return "Document analysis queued";
  if (status === "partial") return "Analysis in progress";
  if (status === "review_required") return "Awaiting broker review";
  if (status === "unavailable") return "Analysis unavailable";

  // Available — pick a label per document type.
  switch (analysis.documentType) {
    case "seller_disclosure":
      return "Seller disclosure analyzed";
    case "hoa_doc":
      return "HOA document analyzed";
    case "inspection_report":
      return "Inspection report analyzed";
    case "title_commitment":
      return "Title commitment analyzed";
    case "survey":
      return "Survey analyzed";
    case "appraisal":
      return "Appraisal analyzed";
    case "loan_estimate":
      return "Loan estimate analyzed";
    case "purchase_contract":
      return "Purchase contract analyzed";
    default:
      return "Document analyzed";
  }
}

/**
 * Extract a small set of buyer-safe key facts from the JSON payload.
 * If the payload is malformed or missing the expected structure, return
 * an empty array — never crash the caller.
 *
 * The convention is that the extraction engine emits a JSON object with
 * a `buyerFacts: string[]` field for facts the buyer can see. Anything
 * else in the payload (raw extraction graphs, fact-level confidence,
 * model citations) stays internal.
 */
function extractBuyerSafeFacts(analysis: RawFileAnalysis): string[] {
  if (!analysis.factsPayload) return [];
  try {
    const parsed = JSON.parse(analysis.factsPayload) as {
      buyerFacts?: unknown;
    };
    if (!Array.isArray(parsed.buyerFacts)) return [];
    return parsed.buyerFacts
      .filter((f): f is string => typeof f === "string")
      .slice(0, 3);
  } catch {
    return [];
  }
}

/** Compute the partial-render progress fraction. */
function computeProgress(analysis: RawFileAnalysis): number {
  if (analysis.totalPageCount <= 0) return 0;
  return Math.min(
    1,
    Math.max(0, analysis.extractedPageCount / analysis.totalPageCount),
  );
}

/** Build the reason text shown for non-available statuses. */
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
  // unavailable
  if (analysis.status === "failed") {
    return "We couldn't analyze this document. Your broker has been notified.";
  }
  return "Document analysis is not available.";
}

// ───────────────────────────────────────────────────────────────────────────
// Filtering helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Filter analyses to only those a buyer is allowed to see. Returns a
 * copy. Internal-only document types (or rejected analyses) are
 * excluded — buyer never sees rejected or internal-only docs.
 */
export function filterForBuyer(
  analyses: RawFileAnalysis[],
): RawFileAnalysis[] {
  return analyses.filter((a) => {
    if (a.reviewState === "rejected") return false;
    return true;
  });
}

/**
 * Sort summaries for the deal-room document panel: critical severity
 * first, then high → low → info, then most recently uploaded.
 * Generic so InternalDocumentSummary passes through with its full
 * type preserved.
 */
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
