import { describe, it, expect } from "vitest";
import {
  canTransitionReview,
  filterFactsByRole,
  formatValue,
  isIsoDate,
  isValidFactSlug,
  latestApprovedPerSlug,
  projectBrokerFact,
  projectBuyerFact,
  validateFact,
  validateFactValue,
} from "@/lib/fileFacts/logic";
import type {
  FileFact,
  FileFactReviewStatus,
  FileFactValue,
} from "@/lib/fileFacts/types";

// MARK: - Fixtures

function makeFact(overrides: Partial<FileFact> = {}): FileFact {
  return {
    id: "fact_1",
    factSlug: "hoa.monthly_fee",
    value: { kind: "numeric", value: 350, unit: "USD" },
    storageId: "kg_123",
    propertyId: "p_1",
    dealRoomId: "dr_1",
    analysisRunId: "run_abc",
    confidence: 0.92,
    reviewStatus: "approved",
    internalOnly: false,
    reviewedBy: "stefang@buyerv2.com",
    reviewedAt: "2026-04-12T00:00:00Z",
    createdAt: "2026-04-12T00:00:00Z",
    updatedAt: "2026-04-12T00:00:00Z",
    ...overrides,
  };
}

// MARK: - isValidFactSlug

describe("isValidFactSlug", () => {
  it("accepts dot-separated kebab/snake case", () => {
    expect(isValidFactSlug("hoa.monthly_fee")).toBe(true);
    expect(isValidFactSlug("flood.zone")).toBe(true);
    expect(isValidFactSlug("inspection.roof_age_years")).toBe(true);
    expect(isValidFactSlug("contract.cash_to_close")).toBe(true);
    expect(isValidFactSlug("simple")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(isValidFactSlug("HOA.monthly_fee")).toBe(false);
    expect(isValidFactSlug("hoa.MonthlyFee")).toBe(false);
  });

  it("rejects whitespace and special chars", () => {
    expect(isValidFactSlug("hoa monthly_fee")).toBe(false);
    expect(isValidFactSlug("hoa-monthly-fee")).toBe(false);
    expect(isValidFactSlug("hoa.")).toBe(false);
    expect(isValidFactSlug(".hoa")).toBe(false);
  });

  it("rejects starting with a digit", () => {
    expect(isValidFactSlug("2bedrooms")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidFactSlug("")).toBe(false);
  });
});

// MARK: - isIsoDate

describe("isIsoDate", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(isIsoDate("2026-04-12")).toBe(true);
  });

  it("accepts full ISO timestamps", () => {
    expect(isIsoDate("2026-04-12T12:00:00Z")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isIsoDate("04/12/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("yesterday")).toBe(false);
  });

  it("rejects parses-but-invalid dates", () => {
    expect(isIsoDate("2026-13-40")).toBe(false);
  });
});

// MARK: - validateFactValue

describe("validateFactValue", () => {
  it("accepts well-formed numeric", () => {
    expect(
      validateFactValue({ kind: "numeric", value: 42.5 })
    ).toEqual([]);
  });

  it("rejects NaN on numeric", () => {
    const errors = validateFactValue({ kind: "numeric", value: Number.NaN });
    expect(errors.some((e) => e.kind === "valueKindMismatch")).toBe(true);
  });

  it("accepts well-formed text", () => {
    expect(validateFactValue({ kind: "text", value: "example" })).toEqual([]);
  });

  it("accepts well-formed date", () => {
    expect(validateFactValue({ kind: "date", value: "2026-04-12" })).toEqual(
      []
    );
  });

  it("rejects invalid date", () => {
    const errors = validateFactValue({ kind: "date", value: "not-a-date" });
    expect(errors.some((e) => e.kind === "invalidIsoDate")).toBe(true);
  });

  it("accepts well-formed boolean", () => {
    expect(validateFactValue({ kind: "boolean", value: true })).toEqual([]);
  });

  it("accepts enum with value in allow list", () => {
    expect(
      validateFactValue({
        kind: "enum",
        value: "excellent",
        allowed: ["excellent", "good", "fair"],
      })
    ).toEqual([]);
  });

  it("rejects enum value not in allow list", () => {
    const errors = validateFactValue({
      kind: "enum",
      value: "mediocre",
      allowed: ["excellent", "good", "fair"],
    });
    expect(errors.some((e) => e.kind === "enumValueNotAllowed")).toBe(true);
  });

  it("rejects enum with empty allow list", () => {
    const errors = validateFactValue({
      kind: "enum",
      value: "anything",
      allowed: [],
    });
    expect(errors.some((e) => e.kind === "emptyEnumAllowList")).toBe(true);
  });
});

// MARK: - validateFact

describe("validateFact", () => {
  it("passes for a well-formed numeric fact", () => {
    expect(validateFact(makeFact()).ok).toBe(true);
  });

  it("rejects empty factSlug", () => {
    const result = validateFact(makeFact({ factSlug: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "missingFactSlug")).toBe(
        true
      );
    }
  });

  it("rejects invalid factSlug format", () => {
    const result = validateFact(makeFact({ factSlug: "HOA Fee" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "invalidFactSlug")).toBe(
        true
      );
    }
  });

  it("rejects empty storageId", () => {
    const result = validateFact(makeFact({ storageId: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "missingStorageId")
      ).toBe(true);
    }
  });

  it("rejects confidence below 0", () => {
    const result = validateFact(makeFact({ confidence: -0.1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "confidenceOutOfRange")
      ).toBe(true);
    }
  });

  it("rejects confidence above 1", () => {
    const result = validateFact(makeFact({ confidence: 1.5 }));
    expect(result.ok).toBe(false);
  });

  it("rejects NaN confidence", () => {
    const result = validateFact(makeFact({ confidence: Number.NaN }));
    expect(result.ok).toBe(false);
  });

  it("allows undefined confidence (manually entered fact)", () => {
    expect(validateFact(makeFact({ confidence: undefined })).ok).toBe(true);
  });
});

// MARK: - canTransitionReview

describe("canTransitionReview", () => {
  const matrix: Array<{
    from: FileFactReviewStatus;
    to: FileFactReviewStatus;
    allowed: boolean;
  }> = [
    { from: "needsReview", to: "approved", allowed: true },
    { from: "needsReview", to: "rejected", allowed: true },
    { from: "needsReview", to: "superseded", allowed: false },
    { from: "approved", to: "rejected", allowed: true },
    { from: "approved", to: "superseded", allowed: true },
    { from: "approved", to: "needsReview", allowed: false },
    { from: "rejected", to: "approved", allowed: true },
    { from: "rejected", to: "superseded", allowed: true },
    { from: "rejected", to: "needsReview", allowed: false },
    { from: "superseded", to: "approved", allowed: false },
    { from: "superseded", to: "rejected", allowed: false },
    { from: "superseded", to: "needsReview", allowed: false },
  ];

  for (const { from, to, allowed } of matrix) {
    it(`${from} → ${to} ${allowed ? "allowed" : "blocked"}`, () => {
      expect(canTransitionReview(from, to)).toBe(allowed);
    });
  }

  it("allows self-transitions as no-ops", () => {
    expect(canTransitionReview("approved", "approved")).toBe(true);
  });
});

// MARK: - filterFactsByRole

describe("filterFactsByRole", () => {
  const facts: FileFact[] = [
    makeFact({ id: "a", reviewStatus: "approved", internalOnly: false }),
    makeFact({ id: "b", reviewStatus: "approved", internalOnly: true }),
    makeFact({ id: "c", reviewStatus: "needsReview", internalOnly: false }),
    makeFact({ id: "d", reviewStatus: "rejected", internalOnly: false }),
    makeFact({ id: "e", reviewStatus: "superseded", internalOnly: false }),
  ];

  it("buyer sees only approved + non-internal facts", () => {
    const buyer = filterFactsByRole(facts, "buyer").map((f) => f.id);
    expect(buyer).toEqual(["a"]);
  });

  it("broker sees all facts", () => {
    const broker = filterFactsByRole(facts, "broker").map((f) => f.id);
    expect(broker).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("admin sees all facts", () => {
    const admin = filterFactsByRole(facts, "admin").map((f) => f.id);
    expect(admin).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns a new array (not a mutation of the input)", () => {
    const input = [...facts];
    filterFactsByRole(input, "broker");
    expect(input).toHaveLength(facts.length);
  });
});

// MARK: - projectBuyerFact / projectBrokerFact

describe("projectBuyerFact", () => {
  it("renders a numeric value with unit", () => {
    const view = projectBuyerFact(makeFact());
    expect(view.displayValue).toBe("350 USD");
  });

  it("renders a numeric value without unit", () => {
    const view = projectBuyerFact(
      makeFact({ value: { kind: "numeric", value: 42 } })
    );
    expect(view.displayValue).toBe("42");
  });

  it("renders a text value as-is", () => {
    const view = projectBuyerFact(
      makeFact({ value: { kind: "text", value: "pool" } })
    );
    expect(view.displayValue).toBe("pool");
  });

  it("renders a date value as YYYY-MM-DD", () => {
    const view = projectBuyerFact(
      makeFact({
        value: { kind: "date", value: "2026-04-12T12:00:00Z" },
      })
    );
    expect(view.displayValue).toBe("2026-04-12");
  });

  it("renders a boolean value as Yes/No", () => {
    const yes = projectBuyerFact(
      makeFact({ value: { kind: "boolean", value: true } })
    );
    const no = projectBuyerFact(
      makeFact({ value: { kind: "boolean", value: false } })
    );
    expect(yes.displayValue).toBe("Yes");
    expect(no.displayValue).toBe("No");
  });

  it("renders an enum value as its string", () => {
    const view = projectBuyerFact(
      makeFact({
        value: {
          kind: "enum",
          value: "good",
          allowed: ["excellent", "good", "fair"],
        },
      })
    );
    expect(view.displayValue).toBe("good");
  });

  it("drops internal fields from the view", () => {
    const view = projectBuyerFact(makeFact());
    expect((view as unknown as { reviewStatus?: string }).reviewStatus).toBeUndefined();
    expect(
      (view as unknown as { internalOnly?: boolean }).internalOnly
    ).toBeUndefined();
  });
});

describe("projectBrokerFact", () => {
  it("keeps every field plus a displayValue", () => {
    const view = projectBrokerFact(makeFact());
    expect(view.displayValue).toBe("350 USD");
    expect(view.reviewStatus).toBe("approved");
    expect(view.internalOnly).toBe(false);
  });
});

// MARK: - formatValue (exercise remaining value kinds directly)

describe("formatValue", () => {
  it("handles every value kind", () => {
    const cases: Array<[FileFactValue, string]> = [
      [{ kind: "numeric", value: 1 }, "1"],
      [{ kind: "numeric", value: 1, unit: "USD" }, "1 USD"],
      [{ kind: "text", value: "hi" }, "hi"],
      [{ kind: "date", value: "2026-04-12" }, "2026-04-12"],
      [{ kind: "boolean", value: true }, "Yes"],
      [{ kind: "boolean", value: false }, "No"],
      [
        { kind: "enum", value: "good", allowed: ["good", "bad"] },
        "good",
      ],
    ];
    for (const [value, expected] of cases) {
      expect(formatValue(value)).toBe(expected);
    }
  });
});

// MARK: - latestApprovedPerSlug

describe("latestApprovedPerSlug", () => {
  it("returns one entry per slug", () => {
    const facts: FileFact[] = [
      makeFact({ id: "a", factSlug: "hoa.monthly_fee", updatedAt: "2026-04-01T00:00:00Z" }),
      makeFact({ id: "b", factSlug: "hoa.monthly_fee", updatedAt: "2026-04-10T00:00:00Z" }),
      makeFact({ id: "c", factSlug: "flood.zone" }),
    ];
    const latest = latestApprovedPerSlug(facts);
    expect(latest).toHaveLength(2);
    const ids = latest.map((f) => f.id).sort();
    expect(ids).toEqual(["b", "c"]);
  });

  it("excludes non-approved facts", () => {
    const facts: FileFact[] = [
      makeFact({ id: "a", reviewStatus: "needsReview" }),
      makeFact({ id: "b", reviewStatus: "rejected" }),
      makeFact({ id: "c", reviewStatus: "superseded" }),
    ];
    expect(latestApprovedPerSlug(facts)).toEqual([]);
  });

  it("picks the most recent by updatedAt, then id desc", () => {
    const facts: FileFact[] = [
      makeFact({ id: "a", updatedAt: "2026-04-01T00:00:00Z" }),
      makeFact({ id: "b", updatedAt: "2026-04-01T00:00:00Z" }),
      makeFact({ id: "c", updatedAt: "2026-04-05T00:00:00Z" }),
    ];
    const latest = latestApprovedPerSlug(facts);
    expect(latest[0]?.id).toBe("c");
  });
});
