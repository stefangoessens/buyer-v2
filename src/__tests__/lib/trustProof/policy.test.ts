import { describe, it, expect } from "vitest";
import {
  DEFAULT_LABELING_POLICY,
  validateLiveTransactionCaseStudy,
  labelCase,
  labelBlock,
  publicCaseStudies,
  publicProofBlocks,
  detectSliceLabelingMode,
  summarizeTrustProof,
} from "@/lib/trustProof/policy";
import type {
  CaseStudy,
  ProofBlock,
} from "@/lib/trustProof/types";

// MARK: - Fixtures

function makeIllustrative(
  overrides: Partial<CaseStudy> = {}
): CaseStudy {
  return {
    id: "cs_demo",
    slug: "demo",
    source: "illustrative",
    headline: "Saved $18,000 on a first home",
    summary: "A first-time buyer used the platform end to end.",
    body: "Illustrative narrative body with enough text to render.",
    outcomes: {
      purchasePrice: 500_000,
      buyerSavings: 18_000,
      daysToClose: 25,
    },
    buyer: { displayName: "Maria G.", location: "Tampa" },
    visibility: "public",
    ...overrides,
  };
}

function makeLive(overrides: Partial<CaseStudy> = {}): CaseStudy {
  return {
    id: "cs_live",
    slug: "live",
    source: "liveTransaction",
    headline: "Live transaction — real savings",
    summary: "Live transaction case study.",
    body: "Verified live transaction narrative.",
    outcomes: {
      purchasePrice: 650_000,
      buyerSavings: 14_500,
    },
    buyer: { displayName: "Pilar S.", location: "Miami" },
    visibility: "public",
    verification: {
      // Past date — paired with TEST_NOW below so the validation
      // test doesn't depend on the system clock
      closingDate: "2026-03-15",
      transactionRef: "txn_abc123",
      buyerConsent: true,
    },
    ...overrides,
  };
}

// Pinned clock for deterministic validation tests — April 12, 2026
const TEST_NOW = new Date("2026-04-12T12:00:00.000Z");

function makeBlock(
  overrides: Partial<ProofBlock> = {}
): ProofBlock {
  return {
    id: "pb_demo",
    source: "illustrative",
    value: "$2.1M",
    label: "Total savings",
    visibility: "public",
    ...overrides,
  };
}

// MARK: - validateLiveTransactionCaseStudy

describe("validateLiveTransactionCaseStudy", () => {
  it("returns no errors for illustrative records", () => {
    expect(
      validateLiveTransactionCaseStudy(makeIllustrative(), TEST_NOW)
    ).toEqual([]);
  });

  it("returns no errors for fully-verified live record with past closing date", () => {
    expect(validateLiveTransactionCaseStudy(makeLive(), TEST_NOW)).toEqual(
      []
    );
  });

  it("reports missing verification block", () => {
    const errs = validateLiveTransactionCaseStudy(
      makeLive({ verification: undefined }),
      TEST_NOW
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].kind).toBe("missingVerification");
  });

  it("reports missing consent", () => {
    // TypeScript doesn't let us set buyerConsent to false on the type,
    // so we cast through a nullable shape for the test
    const study: CaseStudy = makeLive();
    // @ts-expect-error — test explicitly sets an invalid consent value
    study.verification = { ...study.verification, buyerConsent: false };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs.some((e) => e.kind === "missingConsent")).toBe(true);
  });

  it("reports missing closingDate", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      closingDate: "",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs.some((e) => e.kind === "missingClosingDate")).toBe(true);
  });

  it("reports missing transactionRef", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      transactionRef: "",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(
      errs.some((e) => e.kind === "missingTransactionRef")
    ).toBe(true);
  });

  // Regression tests — codex P1 on PR #58

  it("rejects a future closing date (2099-01-01 vs 2026-04-12)", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      closingDate: "2099-01-01",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs.some((e) => e.kind === "futureClosingDate")).toBe(true);
  });

  it("rejects a closing date one day in the future", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      closingDate: "2026-04-13",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs.some((e) => e.kind === "futureClosingDate")).toBe(true);
  });

  it("accepts a closing date equal to today", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      closingDate: "2026-04-12",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs).toEqual([]);
  });

  it("rejects a malformed closing date string", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      closingDate: "last tuesday",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs.some((e) => e.kind === "invalidClosingDate")).toBe(true);
  });

  it("rejects 2026-13-40 (parses but represents an invalid calendar date)", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      closingDate: "2026-13-40",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs.some((e) => e.kind === "invalidClosingDate")).toBe(true);
  });

  it("accepts a full ISO-8601 timestamp in the past", () => {
    const study: CaseStudy = makeLive();
    study.verification = {
      ...study.verification!,
      closingDate: "2026-03-15T10:00:00Z",
    };
    const errs = validateLiveTransactionCaseStudy(study, TEST_NOW);
    expect(errs).toEqual([]);
  });

  it("publicCaseStudies filters out future-closing live records", () => {
    const pastOk = makeLive({ id: "ok" });
    const futureBad = makeLive({ id: "future" });
    futureBad.verification = {
      ...futureBad.verification!,
      closingDate: "2099-01-01",
    };
    const malformed = makeLive({ id: "malformed" });
    malformed.verification = {
      ...malformed.verification!,
      closingDate: "nope",
    };

    const result = publicCaseStudies(
      [pastOk, futureBad, malformed],
      DEFAULT_LABELING_POLICY,
      TEST_NOW
    );
    expect(result.map((l) => l.case.id)).toEqual(["ok"]);
  });

  it("summarizeTrustProof excludes future-closing live records from the count", () => {
    const pastOk = makeLive({ id: "ok" });
    const futureBad = makeLive({ id: "future" });
    futureBad.verification = {
      ...futureBad.verification!,
      closingDate: "2099-01-01",
    };
    const summary = summarizeTrustProof([pastOk, futureBad], [], TEST_NOW);
    expect(summary.liveCaseStudies).toBe(1);
  });
});

// MARK: - labelCase

describe("labelCase", () => {
  it("labels illustrative records with the default label", () => {
    const labeled = labelCase(makeIllustrative());
    expect(labeled.isIllustrative).toBe(true);
    expect(labeled.label).toBe(DEFAULT_LABELING_POLICY.illustrativeLabel);
    expect(labeled.ariaLabel).toBe(
      DEFAULT_LABELING_POLICY.illustrativeAria
    );
  });

  it("leaves live records unlabeled", () => {
    const labeled = labelCase(makeLive());
    expect(labeled.isIllustrative).toBe(false);
    expect(labeled.label).toBeNull();
    expect(labeled.ariaLabel).toBeNull();
  });

  it("respects a custom labeling policy", () => {
    const custom = {
      illustrativeLabel: "Example",
      illustrativeAria: "Example — not live data",
      illustrativeDetailNote: "Example detail note",
    };
    const labeled = labelCase(makeIllustrative(), custom);
    expect(labeled.label).toBe("Example");
  });
});

// MARK: - labelBlock

describe("labelBlock", () => {
  it("labels illustrative blocks", () => {
    const labeled = labelBlock(makeBlock());
    expect(labeled.isIllustrative).toBe(true);
    expect(labeled.label).toBe(DEFAULT_LABELING_POLICY.illustrativeLabel);
  });

  it("leaves live blocks unlabeled", () => {
    const labeled = labelBlock(makeBlock({ source: "liveTransaction" }));
    expect(labeled.isIllustrative).toBe(false);
    expect(labeled.label).toBeNull();
  });
});

// MARK: - publicCaseStudies

describe("publicCaseStudies", () => {
  it("filters out internal drafts", () => {
    const catalog: CaseStudy[] = [
      makeIllustrative({ id: "a", visibility: "public" }),
      makeIllustrative({ id: "b", visibility: "internal" }),
    ];
    const public_ = publicCaseStudies(catalog);
    expect(public_.map((l) => l.case.id)).toEqual(["a"]);
  });

  it("labels every returned record", () => {
    const catalog: CaseStudy[] = [
      makeIllustrative(),
      makeLive(),
    ];
    const public_ = publicCaseStudies(catalog);
    const illustrative = public_.find((l) => l.case.source === "illustrative");
    const live = public_.find((l) => l.case.source === "liveTransaction");
    expect(illustrative?.isIllustrative).toBe(true);
    expect(illustrative?.label).not.toBeNull();
    expect(live?.isIllustrative).toBe(false);
    expect(live?.label).toBeNull();
  });

  it("drops live-source records missing consent", () => {
    const bad: CaseStudy = makeLive();
    // @ts-expect-error — test simulates an invalid record
    bad.verification = { ...bad.verification, buyerConsent: false };
    const catalog = [makeIllustrative(), bad];
    const public_ = publicCaseStudies(catalog);
    expect(public_.some((l) => l.case.id === bad.id)).toBe(false);
    // Illustrative still renders
    expect(public_.length).toBe(1);
  });

  it("drops live-source records missing verification entirely", () => {
    const bad = makeLive({ verification: undefined });
    const catalog = [bad];
    expect(publicCaseStudies(catalog)).toEqual([]);
  });

  it("keeps a valid live record", () => {
    const catalog = [makeLive()];
    const result = publicCaseStudies(catalog);
    expect(result).toHaveLength(1);
    expect(result[0].isIllustrative).toBe(false);
  });
});

// MARK: - publicProofBlocks

describe("publicProofBlocks", () => {
  it("filters internal blocks and labels illustrative ones", () => {
    const catalog: ProofBlock[] = [
      makeBlock({ id: "a", visibility: "public" }),
      makeBlock({ id: "b", visibility: "internal" }),
      makeBlock({ id: "c", source: "liveTransaction" }),
    ];
    const result = publicProofBlocks(catalog);
    expect(result).toHaveLength(2);
    const ids = result.map((l) => l.block.id);
    expect(ids).toContain("a");
    expect(ids).toContain("c");
    expect(ids).not.toContain("b");
    const liveBlock = result.find((l) => l.block.id === "c");
    expect(liveBlock?.isIllustrative).toBe(false);
  });
});

// MARK: - detectSliceLabelingMode

describe("detectSliceLabelingMode", () => {
  it("returns allIllustrative for a pure illustrative slice", () => {
    const slice = [labelCase(makeIllustrative()), labelCase(makeIllustrative({ id: "b" }))];
    const mode = detectSliceLabelingMode(slice);
    expect(mode.kind).toBe("allIllustrative");
    if (mode.kind === "allIllustrative") {
      expect(mode.label).toBe(DEFAULT_LABELING_POLICY.illustrativeLabel);
    }
  });

  it("returns allLive for a pure live slice", () => {
    const slice = [labelCase(makeLive())];
    const mode = detectSliceLabelingMode(slice);
    expect(mode.kind).toBe("allLive");
  });

  it("returns mixed when both sources are present", () => {
    const slice = [
      labelCase(makeIllustrative()),
      labelCase(makeLive()),
    ];
    const mode = detectSliceLabelingMode(slice);
    expect(mode.kind).toBe("mixed");
  });

  it("treats an empty slice as allLive (no label to show)", () => {
    const mode = detectSliceLabelingMode([]);
    expect(mode.kind).toBe("allLive");
  });
});

// MARK: - summarizeTrustProof

describe("summarizeTrustProof", () => {
  it("counts illustrative and live records across both types", () => {
    const cases: CaseStudy[] = [
      makeIllustrative({ id: "a" }),
      makeIllustrative({ id: "b" }),
      makeLive({ id: "c" }),
    ];
    const blocks: ProofBlock[] = [
      makeBlock({ id: "pb_a" }),
      makeBlock({ id: "pb_b", source: "liveTransaction" }),
    ];
    const summary = summarizeTrustProof(cases, blocks);
    expect(summary.totalCaseStudies).toBe(3);
    expect(summary.illustrativeCaseStudies).toBe(2);
    expect(summary.liveCaseStudies).toBe(1);
    expect(summary.totalProofBlocks).toBe(2);
    expect(summary.illustrativeProofBlocks).toBe(1);
    expect(summary.liveProofBlocks).toBe(1);
    expect(summary.hasLiveProof).toBe(true);
  });

  it("excludes internal-visibility records", () => {
    const cases: CaseStudy[] = [
      makeIllustrative({ id: "a", visibility: "public" }),
      makeIllustrative({ id: "b", visibility: "internal" }),
    ];
    const summary = summarizeTrustProof(cases, []);
    expect(summary.illustrativeCaseStudies).toBe(1);
  });

  it("excludes invalid live records from the count", () => {
    const valid = makeLive({ id: "ok" });
    const missingConsent = makeLive({ id: "bad" });
    // Cast through unknown to simulate a malformed record that
    // slipped past typechecking (e.g. legacy data migrated in).
    (missingConsent.verification as unknown as {
      buyerConsent: boolean;
    }).buyerConsent = false;
    const summary = summarizeTrustProof([valid, missingConsent], []);
    expect(summary.liveCaseStudies).toBe(1);
  });

  it("hasLiveProof is false when everything is illustrative", () => {
    const summary = summarizeTrustProof([makeIllustrative()], [makeBlock()]);
    expect(summary.hasLiveProof).toBe(false);
  });
});

// MARK: - Real catalog validation

describe("real trustProof catalog", () => {
  it("every public case study validates", async () => {
    const { CASE_STUDIES } = await import("@/content/trustProof");
    const public_ = CASE_STUDIES.filter((c) => c.visibility === "public");
    for (const study of public_) {
      expect(validateLiveTransactionCaseStudy(study)).toEqual([]);
    }
  });

  it("every public case study carries a label when passed through publicCaseStudies", async () => {
    const { CASE_STUDIES } = await import("@/content/trustProof");
    const labeled = publicCaseStudies(CASE_STUDIES);
    // Pre-revenue: everything illustrative must be labeled
    for (const l of labeled) {
      if (l.case.source === "illustrative") {
        expect(l.isIllustrative).toBe(true);
        expect(l.label).toBe(DEFAULT_LABELING_POLICY.illustrativeLabel);
      }
    }
  });

  it("catalog has at least 3 public illustrative case studies", async () => {
    const { CASE_STUDIES } = await import("@/content/trustProof");
    const illustrative = CASE_STUDIES.filter(
      (c) => c.visibility === "public" && c.source === "illustrative"
    );
    expect(illustrative.length).toBeGreaterThanOrEqual(3);
  });

  it("catalog has internal draft that is filtered from public render", async () => {
    const { CASE_STUDIES } = await import("@/content/trustProof");
    const drafts = CASE_STUDIES.filter((c) => c.visibility === "internal");
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    const public_ = publicCaseStudies(CASE_STUDIES);
    for (const draft of drafts) {
      expect(public_.some((l) => l.case.id === draft.id)).toBe(false);
    }
  });
});
