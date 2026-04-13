import { describe, it, expect } from "vitest";
import {
  projectBuyerSummary,
  projectInternalSummary,
  computeSummaryStatus,
  filterForBuyer,
  sortByPriority,
  type RawFileAnalysis,
  type BuyerDocumentSummary,
} from "@/lib/dealroom/document-summary";

const mkAnalysis = (overrides: Partial<RawFileAnalysis> = {}): RawFileAnalysis => ({
  _id: "analysis_1",
  documentId: "doc_1",
  dealRoomId: "deal_1",
  documentType: "inspection_report",
  fileName: "inspection.pdf",
  status: "succeeded",
  reviewState: "approved",
  factsPayload: JSON.stringify({
    buyerFacts: [
      "Roof in good condition",
      "No major electrical issues",
      "HVAC serviced within past year",
    ],
    internalFacts: {
      rawExtractionGraph: "SECRET internal fact graph",
      perFactConfidence: { roof: 0.95, electrical: 0.88 },
    },
  }),
  reviewNotes: "Broker reviewed 2026-04-10",
  confidence: 0.91,
  severity: "low",
  uploadedAt: "2026-04-10T00:00:00.000Z",
  analyzedAt: "2026-04-10T01:00:00.000Z",
  reviewedAt: "2026-04-10T02:00:00.000Z",
  extractedPageCount: 15,
  totalPageCount: 15,
  ...overrides,
});

describe("computeSummaryStatus", () => {
  it("returns pending for queued analysis with no extracted pages", () => {
    expect(
      computeSummaryStatus(
        mkAnalysis({
          status: "queued",
          extractedPageCount: 0,
          totalPageCount: 0,
        }),
      ),
    ).toBe("pending");
  });

  it("returns pending for running analysis with no progress yet", () => {
    expect(
      computeSummaryStatus(
        mkAnalysis({
          status: "running",
          extractedPageCount: 0,
          totalPageCount: 15,
        }),
      ),
    ).toBe("pending");
  });

  it("returns partial for running analysis with some pages extracted", () => {
    expect(
      computeSummaryStatus(
        mkAnalysis({
          status: "running",
          extractedPageCount: 5,
          totalPageCount: 15,
        }),
      ),
    ).toBe("partial");
  });

  it("returns unavailable for failed analysis", () => {
    expect(
      computeSummaryStatus(mkAnalysis({ status: "failed" })),
    ).toBe("unavailable");
  });

  it("returns review_required for status=review_required", () => {
    expect(
      computeSummaryStatus(mkAnalysis({ status: "review_required" })),
    ).toBe("review_required");
  });

  it("returns review_required for succeeded+pending review", () => {
    expect(
      computeSummaryStatus(
        mkAnalysis({ status: "succeeded", reviewState: "pending" }),
      ),
    ).toBe("review_required");
  });

  it("returns unavailable for succeeded+rejected review", () => {
    expect(
      computeSummaryStatus(
        mkAnalysis({ status: "succeeded", reviewState: "rejected" }),
      ),
    ).toBe("unavailable");
  });

  it("returns available for succeeded+approved review", () => {
    expect(
      computeSummaryStatus(
        mkAnalysis({ status: "succeeded", reviewState: "approved" }),
      ),
    ).toBe("available");
  });
});

describe("projectBuyerSummary — buyer-safe projection", () => {
  it("includes buyer-safe facts only", () => {
    const summary = projectBuyerSummary(mkAnalysis());
    expect(summary.keyFacts).toEqual([
      "Roof in good condition",
      "No major electrical issues",
      "HVAC serviced within past year",
    ]);
    // @ts-expect-error - intentionally checking shape
    expect(summary.reviewNotes).toBeUndefined();
    // @ts-expect-error
    expect(summary.confidence).toBeUndefined();
    // @ts-expect-error
    expect(summary.rawFactsPayload).toBeUndefined();
  });

  it("caps key facts at 3", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({
        factsPayload: JSON.stringify({
          buyerFacts: ["a", "b", "c", "d", "e", "f"],
        }),
      }),
    );
    expect(summary.keyFacts.length).toBe(3);
    expect(summary.keyFacts).toEqual(["a", "b", "c"]);
  });

  it("returns empty facts when payload is missing buyerFacts", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({
        factsPayload: JSON.stringify({ internalFacts: "only" }),
      }),
    );
    expect(summary.keyFacts).toEqual([]);
  });

  it("returns empty facts on malformed JSON payload", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({ factsPayload: "not valid json" }),
    );
    expect(summary.keyFacts).toEqual([]);
  });

  it("returns empty facts on empty payload", () => {
    const summary = projectBuyerSummary(mkAnalysis({ factsPayload: "" }));
    expect(summary.keyFacts).toEqual([]);
  });

  it("filters non-string entries from buyerFacts", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({
        factsPayload: JSON.stringify({
          buyerFacts: ["valid", 123, null, { key: "value" }, "also valid"],
        }),
      }),
    );
    expect(summary.keyFacts).toEqual(["valid", "also valid"]);
  });

  it("downgrades severity to info for non-visible statuses", () => {
    const pending = projectBuyerSummary(
      mkAnalysis({
        status: "queued",
        severity: "critical",
        extractedPageCount: 0,
        totalPageCount: 0,
      }),
    );
    expect(pending.severity).toBe("info");

    const reviewReq = projectBuyerSummary(
      mkAnalysis({
        status: "review_required",
        severity: "high",
      }),
    );
    expect(reviewReq.severity).toBe("info");
  });

  it("preserves severity for available and partial statuses", () => {
    const available = projectBuyerSummary(
      mkAnalysis({ severity: "high" }),
    );
    expect(available.severity).toBe("high");

    const partial = projectBuyerSummary(
      mkAnalysis({
        status: "running",
        severity: "critical",
        extractedPageCount: 5,
        totalPageCount: 15,
      }),
    );
    expect(partial.severity).toBe("critical");
  });

  it("computes progress for partial status", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({
        status: "running",
        extractedPageCount: 5,
        totalPageCount: 15,
      }),
    );
    expect(summary.progress).toBeCloseTo(1 / 3, 2);
  });

  it("returns null progress for non-partial statuses", () => {
    // Available status (succeeded + approved) → no progress.
    expect(projectBuyerSummary(mkAnalysis()).progress).toBe(null);
    // Queued status with no extracted pages → pending, not partial.
    expect(
      projectBuyerSummary(
        mkAnalysis({
          status: "queued",
          extractedPageCount: 0,
          totalPageCount: 0,
        }),
      ).progress,
    ).toBe(null);
    // Failed analysis → unavailable, not partial.
    expect(
      projectBuyerSummary(mkAnalysis({ status: "failed" })).progress,
    ).toBe(null);
  });

  it("clamps progress to 0-1 range", () => {
    const over = projectBuyerSummary(
      mkAnalysis({
        status: "running",
        extractedPageCount: 20,
        totalPageCount: 10,
      }),
    );
    expect(over.progress).toBe(1);
  });
});

describe("projectBuyerSummary — headlines + reasons", () => {
  it("builds document-type-specific headlines when available", () => {
    expect(
      projectBuyerSummary(mkAnalysis({ documentType: "inspection_report" }))
        .headline,
    ).toBe("Inspection report analyzed");
    expect(
      projectBuyerSummary(mkAnalysis({ documentType: "hoa_doc" })).headline,
    ).toBe("HOA document analyzed");
    expect(
      projectBuyerSummary(mkAnalysis({ documentType: "title_commitment" }))
        .headline,
    ).toBe("Title commitment analyzed");
  });

  it("has no reason when status is available", () => {
    expect(projectBuyerSummary(mkAnalysis()).reason).toBe(null);
  });

  it("has a reason when status is pending", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({
        status: "queued",
        extractedPageCount: 0,
        totalPageCount: 0,
      }),
    );
    expect(summary.reason).toContain("analyzing");
  });

  it("has a page count in the partial reason", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({
        status: "running",
        extractedPageCount: 5,
        totalPageCount: 15,
      }),
    );
    expect(summary.reason).toContain("5 of 15");
  });

  it("tells buyer broker is reviewing for review_required", () => {
    const summary = projectBuyerSummary(
      mkAnalysis({ status: "review_required" }),
    );
    expect(summary.reason).toContain("broker");
  });

  it("tells buyer analysis failed for unavailable", () => {
    const summary = projectBuyerSummary(mkAnalysis({ status: "failed" }));
    expect(summary.reason).toContain("couldn't");
  });
});

describe("projectInternalSummary", () => {
  it("includes all internal fields", () => {
    const summary = projectInternalSummary(mkAnalysis());
    expect(summary.reviewState).toBe("approved");
    expect(summary.reviewNotes).toBe("Broker reviewed 2026-04-10");
    expect(summary.confidence).toBe(0.91);
    expect(summary.rawFactsPayload).toBeTruthy();
    expect(summary.analysisStatus).toBe("succeeded");
  });

  it("passes null through for missing optional fields", () => {
    const summary = projectInternalSummary(
      mkAnalysis({
        reviewNotes: undefined,
        analyzedAt: undefined,
        reviewedAt: undefined,
      }),
    );
    expect(summary.reviewNotes).toBe(null);
    expect(summary.analyzedAt).toBe(null);
    expect(summary.reviewedAt).toBe(null);
  });

  it("preserves buyer-facing fields alongside internal ones", () => {
    const summary = projectInternalSummary(mkAnalysis());
    expect(summary.fileName).toBe("inspection.pdf");
    expect(summary.status).toBe("available");
    expect(summary.keyFacts.length).toBe(3);
  });

  it("preserves raw severity on non-visible statuses (codex P2 fix)", () => {
    // Codex flagged that projectInternalSummary was calling through
    // projectBuyerSummary, which downgrades severity to "info" on
    // pending/review_required/unavailable statuses. Broker/admin need
    // the true severity for ops ordering, so the internal projection
    // must preserve it.
    const pending = projectInternalSummary(
      mkAnalysis({
        status: "queued",
        severity: "critical",
        extractedPageCount: 0,
        totalPageCount: 0,
      }),
    );
    expect(pending.status).toBe("pending");
    expect(pending.severity).toBe("critical");

    const reviewReq = projectInternalSummary(
      mkAnalysis({ status: "review_required", severity: "high" }),
    );
    expect(reviewReq.status).toBe("review_required");
    expect(reviewReq.severity).toBe("high");

    const failed = projectInternalSummary(
      mkAnalysis({ status: "failed", severity: "critical" }),
    );
    expect(failed.status).toBe("unavailable");
    expect(failed.severity).toBe("critical");
  });
});

describe("filterForBuyer", () => {
  it("excludes rejected analyses", () => {
    const rejected = mkAnalysis({
      _id: "r1",
      reviewState: "rejected",
    });
    const approved = mkAnalysis({ _id: "a1" });
    const filtered = filterForBuyer([rejected, approved]);
    expect(filtered.length).toBe(1);
    expect(filtered[0]._id).toBe("a1");
  });

  it("includes pending review analyses", () => {
    // These render as review_required, not hidden.
    const pending = mkAnalysis({
      _id: "p1",
      reviewState: "pending",
    });
    const filtered = filterForBuyer([pending]);
    expect(filtered.length).toBe(1);
  });

  it("returns a new array (non-mutating)", () => {
    const input = [mkAnalysis()];
    const filtered = filterForBuyer(input);
    expect(filtered).not.toBe(input);
  });
});

describe("sortByPriority", () => {
  const mkSummary = (
    overrides: Partial<BuyerDocumentSummary> = {},
  ): BuyerDocumentSummary => ({
    documentId: "doc_1",
    fileName: "f.pdf",
    documentType: "inspection_report",
    status: "available",
    severity: "info",
    headline: "h",
    keyFacts: [],
    progress: null,
    reason: null,
    uploadedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  });

  it("sorts critical first, info last", () => {
    const summaries = [
      mkSummary({ documentId: "d1", severity: "low" }),
      mkSummary({ documentId: "d2", severity: "critical" }),
      mkSummary({ documentId: "d3", severity: "info" }),
      mkSummary({ documentId: "d4", severity: "high" }),
    ];
    const sorted = sortByPriority(summaries);
    expect(sorted.map((s) => s.documentId)).toEqual([
      "d2",
      "d4",
      "d1",
      "d3",
    ]);
  });

  it("ties break by most recent uploadedAt desc", () => {
    const summaries = [
      mkSummary({
        documentId: "older",
        severity: "high",
        uploadedAt: "2026-04-01T00:00:00.000Z",
      }),
      mkSummary({
        documentId: "newer",
        severity: "high",
        uploadedAt: "2026-04-10T00:00:00.000Z",
      }),
    ];
    const sorted = sortByPriority(summaries);
    expect(sorted[0].documentId).toBe("newer");
  });

  it("does not mutate input", () => {
    const summaries = [mkSummary()];
    const copy = [...summaries];
    sortByPriority(summaries);
    expect(summaries).toEqual(copy);
  });
});
