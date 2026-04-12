import { describe, it, expect } from "vitest";
import {
  calculateSavings,
  defaultCalculatorInput,
  formatUSD,
  parseRawField,
  type SavingsCalculatorInput,
} from "@/lib/pricing/savingsCalculator";
import {
  CALCULATOR_DISCLOSURES,
  getDisclosure,
  getHeadlineDisclosures,
} from "@/lib/pricing/disclosures";

function baseInput(
  overrides: Partial<SavingsCalculatorInput> = {}
): SavingsCalculatorInput {
  return {
    ...defaultCalculatorInput(500_000),
    ...overrides,
  };
}

describe("calculateSavings — happy path", () => {
  it("computes defaults: $500k, 6% total, 3% buyer-agent, 33% credit", () => {
    const result = calculateSavings(baseInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // 500k * 6% = 30k total
    expect(result.result.totalCommissionAmount).toBe(30_000);
    // 500k * 3% = 15k buyer-agent
    expect(result.result.buyerAgentCommissionAmount).toBe(15_000);
    // 15k * 33% = 4,950 credit
    expect(result.result.buyerCreditAmount).toBe(4_950);
    // 15k - 4,950 = 10,050 retained by buyer-v2
    expect(result.result.buyerV2FeeAmount).toBe(10_050);
    // Effective buyer commission: (15k - 4,950) / 500k * 100 = 2.01%
    expect(result.result.effectiveBuyerCommissionPercent).toBeCloseTo(2.01, 2);
    expect(result.result.isZeroCommission).toBe(false);
  });

  it("scales linearly with price", () => {
    const r1 = calculateSavings(baseInput({ purchasePrice: 250_000 }));
    const r2 = calculateSavings(baseInput({ purchasePrice: 1_000_000 }));
    if (r1.kind !== "ok" || r2.kind !== "ok") {
      throw new Error("expected ok results");
    }
    expect(r2.result.buyerCreditAmount).toBe(r1.result.buyerCreditAmount * 4);
  });

  it("round-trips through formatUSD without losing cents when unnecessary", () => {
    const result = calculateSavings(baseInput());
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(formatUSD(result.result.buyerCreditAmount)).toBe("$4,950");
  });
});

describe("calculateSavings — zero-comp states", () => {
  it("zero total commission yields isZeroCommission=true and zero credit", () => {
    const result = calculateSavings(
      baseInput({ totalCommissionPercent: 0, buyerAgentCommissionPercent: 0 })
    );
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.result.isZeroCommission).toBe(true);
    expect(result.result.buyerCreditAmount).toBe(0);
    expect(result.result.totalCommissionAmount).toBe(0);
  });

  it("zero buyer-agent commission (with nonzero total) still flags isZeroCommission", () => {
    const result = calculateSavings(
      baseInput({
        totalCommissionPercent: 5,
        buyerAgentCommissionPercent: 0,
      })
    );
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.result.isZeroCommission).toBe(true);
    expect(result.result.buyerCreditAmount).toBe(0);
    // Total commission still shown so users see the seller-side figure
    expect(result.result.totalCommissionAmount).toBe(25_000);
  });

  it("zero buyer credit percent yields credit=0 but not zero-commission state", () => {
    const result = calculateSavings(baseInput({ buyerCreditPercent: 0 }));
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.result.isZeroCommission).toBe(false);
    expect(result.result.buyerCreditAmount).toBe(0);
    // Full buyer-agent commission goes to buyer-v2
    expect(result.result.buyerV2FeeAmount).toBe(15_000);
  });
});

describe("calculateSavings — missing / NaN inputs", () => {
  it("missing purchasePrice surfaces as .missingInput error", () => {
    const result = calculateSavings(
      baseInput({ purchasePrice: NaN as unknown as number })
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      kind: "missingInput",
      field: "purchasePrice",
    });
  });

  it("missing totalCommissionPercent surfaces as .missingInput error", () => {
    const result = calculateSavings(
      baseInput({ totalCommissionPercent: NaN as unknown as number })
    );
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors[0]).toMatchObject({
      kind: "missingInput",
      field: "totalCommissionPercent",
    });
  });

  it("multiple missing inputs report all of them at once", () => {
    const result = calculateSavings({
      purchasePrice: NaN as unknown as number,
      totalCommissionPercent: NaN as unknown as number,
      buyerAgentCommissionPercent: NaN as unknown as number,
      buyerCreditPercent: NaN as unknown as number,
    });
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors).toHaveLength(4);
    const fields = result.errors.map((e) =>
      e.kind === "missingInput" ? e.field : null
    );
    expect(fields).toEqual([
      "purchasePrice",
      "totalCommissionPercent",
      "buyerAgentCommissionPercent",
      "buyerCreditPercent",
    ]);
  });

  it("Infinity is treated as missing", () => {
    const result = calculateSavings(
      baseInput({ purchasePrice: Number.POSITIVE_INFINITY })
    );
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors[0].kind).toBe("missingInput");
  });
});

describe("calculateSavings — boundary values", () => {
  it("zero purchase price surfaces as .outOfRange (must be > 0)", () => {
    const result = calculateSavings(baseInput({ purchasePrice: 0 }));
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors[0]).toMatchObject({
      kind: "outOfRange",
      field: "purchasePrice",
    });
  });

  it("negative purchase price surfaces as .outOfRange", () => {
    const result = calculateSavings(baseInput({ purchasePrice: -1 }));
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors[0]).toMatchObject({
      kind: "outOfRange",
      field: "purchasePrice",
    });
  });

  it("totalCommissionPercent > 100 surfaces as .outOfRange", () => {
    const result = calculateSavings(
      baseInput({ totalCommissionPercent: 101 })
    );
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors[0]).toMatchObject({
      kind: "outOfRange",
      field: "totalCommissionPercent",
    });
  });

  it("negative buyer credit percent surfaces as .outOfRange", () => {
    const result = calculateSavings(baseInput({ buyerCreditPercent: -5 }));
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors[0]).toMatchObject({
      kind: "outOfRange",
      field: "buyerCreditPercent",
    });
  });

  it("buyer-agent commission exceeding total commission is an inconsistent split", () => {
    const result = calculateSavings(
      baseInput({ totalCommissionPercent: 4, buyerAgentCommissionPercent: 5 })
    );
    if (result.kind !== "error") throw new Error("expected error");
    expect(result.errors[0].kind).toBe("inconsistentSplit");
  });

  it("buyer credit of exactly 100% yields full rebate and zero buyer-v2 fee", () => {
    const result = calculateSavings(baseInput({ buyerCreditPercent: 100 }));
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.result.buyerCreditAmount).toBe(15_000);
    expect(result.result.buyerV2FeeAmount).toBe(0);
    expect(result.result.effectiveBuyerCommissionPercent).toBe(0);
  });

  it("purchase price of exactly $1 (minimum valid) still computes", () => {
    const result = calculateSavings(baseInput({ purchasePrice: 1 }));
    if (result.kind !== "ok") throw new Error("expected ok");
    // 1 * 3% = 0.03 → rounds to 0 at whole-dollar precision
    expect(result.result.buyerAgentCommissionAmount).toBe(0);
  });

  it("very large purchase price computes without overflow", () => {
    const result = calculateSavings(
      baseInput({ purchasePrice: 100_000_000 })
    );
    if (result.kind !== "ok") throw new Error("expected ok");
    // 100M * 3% * 33% = $990,000
    expect(result.result.buyerCreditAmount).toBe(990_000);
  });
});

describe("formatUSD", () => {
  it("formats whole dollars with no cents by default", () => {
    expect(formatUSD(4_950)).toBe("$4,950");
    expect(formatUSD(0)).toBe("$0");
  });

  it("formats with cents when showCents=true", () => {
    expect(formatUSD(4_950.5, { showCents: true })).toBe("$4,950.50");
  });

  it("formats large numbers with group separators", () => {
    expect(formatUSD(1_234_567)).toBe("$1,234,567");
  });
});

describe("parseRawField (codex P1 regression)", () => {
  // Regression guard for the bug codex flagged on PR #45: typing "2.5"
  // in a percentage field used to lose the trailing decimal because
  // Number("2.") === 2, so the next keystroke read as "25".

  it("preserves mid-type trailing decimal as NaN (not 2)", () => {
    // "2." is the user mid-typing → calculator should treat as missing
    expect(parseRawField("2.")).toBeNaN();
  });

  it("parses a full decimal value like '2.5' correctly", () => {
    expect(parseRawField("2.5")).toBe(2.5);
  });

  it("parses a whole number", () => {
    expect(parseRawField("500000")).toBe(500_000);
    expect(parseRawField("6")).toBe(6);
  });

  it("empty string is NaN (triggers missingInput)", () => {
    expect(parseRawField("")).toBeNaN();
    expect(parseRawField("   ")).toBeNaN();
  });

  it("bare '.' and '-' are NaN (in-progress input)", () => {
    expect(parseRawField(".")).toBeNaN();
    expect(parseRawField("-")).toBeNaN();
  });

  it("gibberish like 'abc' is NaN", () => {
    expect(parseRawField("abc")).toBeNaN();
  });

  it("Infinity text is NaN", () => {
    expect(parseRawField("Infinity")).toBeNaN();
  });

  it("negative numbers parse correctly (range check catches them later)", () => {
    expect(parseRawField("-5")).toBe(-5);
  });

  it("integer typed through decimal progression round-trips", () => {
    // Simulating a user typing "2.5" keystroke by keystroke:
    //   "2"   → 2        (valid)
    //   "2."  → NaN      (mid-type, calculator waits)
    //   "2.5" → 2.5      (valid)
    expect(parseRawField("2")).toBe(2);
    expect(parseRawField("2.")).toBeNaN();
    expect(parseRawField("2.5")).toBe(2.5);
  });
});

describe("disclosures module", () => {
  it("all disclosures have stable ids and non-empty body text", () => {
    const ids = new Set<string>();
    for (const d of CALCULATOR_DISCLOSURES) {
      expect(d.id).toMatch(/^[a-z_]+$/);
      expect(d.body.length).toBeGreaterThan(20);
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
    }
  });

  it("getDisclosure retrieves by id", () => {
    const d = getDisclosure("estimate_not_guarantee");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("strong");
  });

  it("getDisclosure returns undefined for unknown ids", () => {
    expect(getDisclosure("nope_nope")).toBeUndefined();
  });

  it("getHeadlineDisclosures returns only strong + emphasis items", () => {
    const headline = getHeadlineDisclosures();
    expect(headline.length).toBeGreaterThan(0);
    for (const d of headline) {
      expect(["strong", "emphasis"]).toContain(d.severity);
    }
  });

  it("includes the license disclosure", () => {
    const licensed = getDisclosure("licensed_brokerage");
    expect(licensed?.label).toBe("Licensed Florida brokerage");
  });
});
