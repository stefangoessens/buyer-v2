import { describe, it, expect } from "vitest";
import {
  extractMilestones,
  addDays,
  isOverdue,
  WORKSTREAMS,
} from "@/lib/contracts/milestones";

// ───────────────────────────────────────────────────────────────────────────
// Date helpers
// ───────────────────────────────────────────────────────────────────────────

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-04-12", 5)).toBe("2026-04-17");
  });

  it("handles month boundary", () => {
    expect(addDays("2026-04-28", 5)).toBe("2026-05-03");
  });

  it("handles year boundary", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });

  it("handles negative days", () => {
    expect(addDays("2026-04-12", -3)).toBe("2026-04-09");
  });
});

describe("isOverdue", () => {
  it("returns true when due before today", () => {
    expect(isOverdue("2026-04-01", "2026-04-12")).toBe(true);
  });

  it("returns false when due today", () => {
    expect(isOverdue("2026-04-12", "2026-04-12")).toBe(false);
  });

  it("returns false when due after today", () => {
    expect(isOverdue("2026-04-20", "2026-04-12")).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Standard FL FAR/BAR contract fixture — covers inspection, financing,
// appraisal, title, insurance, HOA, closing.
// ───────────────────────────────────────────────────────────────────────────

const STANDARD_CONTRACT = `
Florida Residential Contract For Sale And Purchase

Effective Date: 2028-01-15
Parties agree to the following:

Inspection Period: 15 calendar days from the effective date.
Financing Contingency: 30 days for loan approval.
Appraisal must be completed within 21 calendar days.
Title commitment shall be delivered within 20 days.
Insurance binder due 25 days from effective date.
HOA documents to be reviewed within 10 days.

Closing Date: 2028-03-15

End of terms.
`;

const CONDO_CONTRACT = `
Florida Condominium Contract
Effective Date: 2028-01-15

Inspection period: 10 calendar days.
Financing contingency: 45 calendar days.
Condominium documents: 7 days for review.

Closing Date: 2028-04-01
`;

const MALFORMED_CONTRACT = `
Inspection period: TBD
Financing: see addendum
Closing: when ready
`;

// ───────────────────────────────────────────────────────────────────────────
// Standard extraction
// ───────────────────────────────────────────────────────────────────────────

describe("extractMilestones — standard contract", () => {
  const result = extractMilestones({
    contractText: STANDARD_CONTRACT,
    effectiveDate: "2028-01-15",
    closingDate: "2028-03-15",
  });

  it("returns no warnings on clean input", () => {
    expect(result.warnings).toEqual([]);
  });

  it("extracts inspection period end at +15 days", () => {
    const ms = result.milestones.find((m) => m.workstream === "inspection");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-01-30");
    expect(ms?.confidence).toBeGreaterThanOrEqual(0.85);
    expect(ms?.flaggedForReview).toBe(false);
  });

  it("extracts financing contingency at +30 days", () => {
    const ms = result.milestones.find((m) => m.workstream === "financing");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-02-14");
  });

  it("extracts appraisal at +21 days", () => {
    const ms = result.milestones.find((m) => m.workstream === "appraisal");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-02-05");
  });

  it("extracts title commitment at +20 days", () => {
    const ms = result.milestones.find((m) => m.workstream === "title");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-02-04");
  });

  it("extracts insurance binder at +25 days", () => {
    const ms = result.milestones.find((m) => m.workstream === "insurance");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-02-09");
  });

  it("extracts HOA docs at +10 days", () => {
    const ms = result.milestones.find((m) => m.workstream === "hoa");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-01-25");
  });

  it("derives walkthrough 1 day before closing", () => {
    const ms = result.milestones.find((m) => m.workstream === "walkthrough");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-03-14");
  });

  it("emits closing milestone with confidence 1.0", () => {
    const ms = result.milestones.find((m) => m.workstream === "closing");
    expect(ms).toBeDefined();
    expect(ms?.dueDate).toBe("2028-03-15");
    expect(ms?.confidence).toBe(1);
  });

  it("overall confidence reflects high-quality extraction", () => {
    expect(result.overallConfidence).toBeGreaterThan(0.85);
  });

  it("none of the standard milestones are flagged", () => {
    // Standard dates are all in the future (2028), so date_in_past flags are absent
    expect(result.milestones.every((m) => !m.flaggedForReview)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Condo variant
// ───────────────────────────────────────────────────────────────────────────

describe("extractMilestones — condo contract", () => {
  it("extracts condominium documents as hoa workstream", () => {
    const result = extractMilestones({
      contractText: CONDO_CONTRACT,
      effectiveDate: "2028-01-15",
      closingDate: "2028-04-01",
    });
    const hoa = result.milestones.find((m) => m.workstream === "hoa");
    expect(hoa).toBeDefined();
    expect(hoa?.dueDate).toBe("2028-01-22");
  });

  it("handles shorter inspection periods (10 days)", () => {
    const result = extractMilestones({
      contractText: CONDO_CONTRACT,
      effectiveDate: "2028-01-15",
      closingDate: "2028-04-01",
    });
    const inspection = result.milestones.find(
      (m) => m.workstream === "inspection",
    );
    expect(inspection?.dueDate).toBe("2028-01-25");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Ambiguous / missing data — review flagging
// ───────────────────────────────────────────────────────────────────────────

describe("extractMilestones — malformed contract", () => {
  it("gracefully returns empty or flagged milestones without throwing", () => {
    expect(() =>
      extractMilestones({
        contractText: MALFORMED_CONTRACT,
        effectiveDate: "2028-01-15",
      }),
    ).not.toThrow();
  });

  it("emits warnings when no closing date found", () => {
    const result = extractMilestones({
      contractText: MALFORMED_CONTRACT,
      effectiveDate: "2028-01-15",
    });
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("closing")),
    ).toBe(true);
  });

  it("skips milestones for patterns that can't be parsed numerically", () => {
    const result = extractMilestones({
      contractText: MALFORMED_CONTRACT,
      effectiveDate: "2028-01-15",
    });
    // No inspection day count, no financing day count, no closing date → no milestones
    expect(result.milestones).toEqual([]);
  });
});

describe("extractMilestones — invalid effective date", () => {
  it("returns empty with warning when effective date is not ISO", () => {
    const result = extractMilestones({
      contractText: STANDARD_CONTRACT,
      effectiveDate: "not-a-date",
    });
    expect(result.milestones).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns empty for impossible dates like Feb 30", () => {
    const result = extractMilestones({
      contractText: STANDARD_CONTRACT,
      effectiveDate: "2028-02-30",
    });
    expect(result.milestones).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Past-date flagging (when contract effective date is in the past)
// ───────────────────────────────────────────────────────────────────────────

describe("extractMilestones — past dates flag for review", () => {
  it("flags milestones that compute to a past date", () => {
    const result = extractMilestones({
      contractText: STANDARD_CONTRACT,
      effectiveDate: "2020-01-15",
      closingDate: "2020-03-15",
    });
    // Every milestone is in the past — all should be flagged
    const flaggedCount = result.milestones.filter((m) => m.flaggedForReview).length;
    expect(flaggedCount).toBeGreaterThan(0);
    expect(
      result.milestones.every(
        (m) => !m.flaggedForReview || m.reviewReason === "date_in_past",
      ),
    ).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Month-name closing date format
// ───────────────────────────────────────────────────────────────────────────

describe("extractMilestones — month-name closing date format", () => {
  it("extracts closing date from 'May 15, 2028' format", () => {
    const contract = `
      Effective Date: 2028-01-15
      Inspection Period: 10 calendar days.
      Closing: May 15, 2028
    `;
    const result = extractMilestones({
      contractText: contract,
      effectiveDate: "2028-01-15",
    });
    const closing = result.milestones.find((m) => m.workstream === "closing");
    expect(closing).toBeDefined();
    expect(closing?.dueDate).toBe("2028-05-15");
  });

  it("extracts closing date from abbreviated month 'Jan 2, 2028'", () => {
    const contract = `
      Effective Date: 2027-11-01
      Inspection Period: 10 calendar days.
      Closing Date: Jan 2, 2028
    `;
    const result = extractMilestones({
      contractText: contract,
      effectiveDate: "2027-11-01",
    });
    const closing = result.milestones.find((m) => m.workstream === "closing");
    expect(closing?.dueDate).toBe("2028-01-02");
  });

  it("extracts closing date from M/D/YYYY slash format", () => {
    const contract = `
      Effective Date: 2028-01-15
      Inspection Period: 10 calendar days.
      Closing: 5/15/2028
    `;
    const result = extractMilestones({
      contractText: contract,
      effectiveDate: "2028-01-15",
    });
    const closing = result.milestones.find((m) => m.workstream === "closing");
    expect(closing?.dueDate).toBe("2028-05-15");
  });

  it("rejects impossible dates (Feb 30)", () => {
    const contract = `
      Effective Date: 2028-01-15
      Inspection Period: 10 days.
      Closing: February 30, 2028
    `;
    const result = extractMilestones({
      contractText: contract,
      effectiveDate: "2028-01-15",
    });
    const closing = result.milestones.find((m) => m.workstream === "closing");
    expect(closing).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Workstream constant
// ───────────────────────────────────────────────────────────────────────────

describe("WORKSTREAMS", () => {
  it("contains all expected workstreams", () => {
    expect(WORKSTREAMS).toContain("inspection");
    expect(WORKSTREAMS).toContain("financing");
    expect(WORKSTREAMS).toContain("appraisal");
    expect(WORKSTREAMS).toContain("title");
    expect(WORKSTREAMS).toContain("insurance");
    expect(WORKSTREAMS).toContain("hoa");
    expect(WORKSTREAMS).toContain("walkthrough");
    expect(WORKSTREAMS).toContain("closing");
    expect(WORKSTREAMS).toContain("other");
    expect(WORKSTREAMS.length).toBe(10);
  });
});
