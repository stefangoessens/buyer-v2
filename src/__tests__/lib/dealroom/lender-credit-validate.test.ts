import { describe, it, expect } from "vitest";
import {
  computeIpcLimitPercent,
  validateLenderCredit,
  NEAR_LIMIT_THRESHOLD,
  type LenderValidationInput,
} from "@/lib/dealroom/lender-credit-validate";

// Helper to build a validation input with sensible defaults.
function makeInput(overrides: Partial<LenderValidationInput> = {}): LenderValidationInput {
  return {
    financingType: "conventional",
    purchasePrice: 500_000,
    ltvRatio: 0.8,
    projectedSellerCredit: 0,
    projectedBuyerCredit: 0,
    projectedClosingCredit: 0,
    ...overrides,
  };
}

describe("NEAR_LIMIT_THRESHOLD constant", () => {
  it("is exported as 0.02 (2%)", () => {
    expect(NEAR_LIMIT_THRESHOLD).toBe(0.02);
  });
});

describe("computeIpcLimitPercent", () => {
  it("returns 0 for cash (no IPC constraint)", () => {
    expect(computeIpcLimitPercent("cash", undefined)).toBe(0);
  });

  it("returns 0 for cash even when LTV is supplied", () => {
    expect(computeIpcLimitPercent("cash", 0.8)).toBe(0);
  });

  it("conventional at 95% LTV → 3% (LTV > 90%)", () => {
    expect(computeIpcLimitPercent("conventional", 0.95)).toBe(0.03);
  });

  it("conventional at 85% LTV → 6% (mid tier)", () => {
    expect(computeIpcLimitPercent("conventional", 0.85)).toBe(0.06);
  });

  it("conventional at 70% LTV → 9% (low LTV tier)", () => {
    expect(computeIpcLimitPercent("conventional", 0.70)).toBe(0.09);
  });

  it("conventional at exactly 80% LTV → 6% (mid-tier boundary)", () => {
    expect(computeIpcLimitPercent("conventional", 0.80)).toBe(0.06);
  });

  it("conventional at exactly 90% LTV → 6% (upper mid-tier boundary)", () => {
    // LTV > 0.90 returns 3, so 0.90 exactly stays in 6% tier
    expect(computeIpcLimitPercent("conventional", 0.90)).toBe(0.06);
  });

  it("conventional at exactly 75% LTV → 9% (low-tier boundary)", () => {
    // LTV > 0.75 returns 6, so 0.75 exactly sits in 9% tier
    expect(computeIpcLimitPercent("conventional", 0.75)).toBe(0.09);
  });

  it("conventional with no LTV → 6% (conservative default)", () => {
    expect(computeIpcLimitPercent("conventional", undefined)).toBe(0.06);
  });

  it("FHA → 6% flat", () => {
    expect(computeIpcLimitPercent("fha", undefined)).toBe(0.06);
    expect(computeIpcLimitPercent("fha", 0.95)).toBe(0.06);
  });

  it("VA → 4% flat", () => {
    expect(computeIpcLimitPercent("va", undefined)).toBe(0.04);
    expect(computeIpcLimitPercent("va", 0.80)).toBe(0.04);
  });

  it("other → 6% conservative fallback", () => {
    expect(computeIpcLimitPercent("other", undefined)).toBe(0.06);
  });
});

describe("validateLenderCredit — cash (no constraint)", () => {
  it("cash purchase with zero credits → valid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "cash",
        ltvRatio: undefined,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.blockingReasonCode).toBeNull();
    expect(result.blockingReasonMessage).toBeNull();
    expect(result.reviewNotes).toEqual([]);
    expect(result.ipcLimitPercent).toBe(0);
    expect(result.ipcLimitDollars).toBe(0);
  });

  it("cash purchase with massive credits → still valid (no IPC constraint)", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "cash",
        ltvRatio: undefined,
        purchasePrice: 1_000_000,
        projectedSellerCredit: 50_000,
        projectedBuyerCredit: 25_000,
        projectedClosingCredit: 10_000,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.blockingReasonCode).toBeNull();
    expect(result.totalProjectedCredits).toBe(85_000);
  });
});

describe("validateLenderCredit — valid path", () => {
  it("conventional 80% LTV, $500k, $15k credits (3%) → valid (margin 3% > 2% threshold)", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 10_000,
        projectedBuyerCredit: 3_000,
        projectedClosingCredit: 2_000,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.ipcLimitPercent).toBe(0.06);
    expect(result.ipcLimitDollars).toBe(30_000);
    expect(result.totalProjectedCredits).toBe(15_000);
    expect(result.blockingReasonCode).toBeNull();
    expect(result.reviewNotes).toEqual([]);
  });

  it("FHA, $400k, credits under 6% → valid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "fha",
        ltvRatio: 0.95,
        purchasePrice: 400_000,
        projectedSellerCredit: 10_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 5_000,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.ipcLimitPercent).toBe(0.06);
    expect(result.ipcLimitDollars).toBe(24_000);
    expect(result.totalProjectedCredits).toBe(15_000);
    expect(result.blockingReasonCode).toBeNull();
  });

  it("VA, $300k, $3k credits (1%) → valid (margin 3% > 2% threshold)", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "va",
        ltvRatio: 1.0,
        purchasePrice: 300_000,
        projectedSellerCredit: 2_000,
        projectedBuyerCredit: 500,
        projectedClosingCredit: 500,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.ipcLimitPercent).toBe(0.04);
    expect(result.ipcLimitDollars).toBe(12_000);
    expect(result.totalProjectedCredits).toBe(3_000);
    expect(result.blockingReasonCode).toBeNull();
  });

  it("all zero credits on a financed purchase → valid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.85,
        purchasePrice: 500_000,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.totalProjectedCredits).toBe(0);
    expect(result.blockingReasonCode).toBeNull();
  });

  it("credits at 3% on conventional 6% cap (margin = 3%, well above 2% threshold) → valid", () => {
    // marginPercent = 0.06 - 0.03 = 0.03; check is `< NEAR_LIMIT_THRESHOLD` (0.02), so valid
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 15_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.blockingReasonCode).toBeNull();
  });
});

describe("validateLenderCredit — invalid path (exceeds IPC limit)", () => {
  it("conventional 80% LTV, $500k, $35k credits (7%) → invalid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 25_000,
        projectedBuyerCredit: 5_000,
        projectedClosingCredit: 5_000,
      }),
    );
    expect(result.outcome).toBe("invalid");
    expect(result.blockingReasonCode).toBe("exceeds_ipc_limit");
    expect(result.blockingReasonMessage).not.toBeNull();
    expect(result.ipcLimitDollars).toBe(30_000);
    expect(result.totalProjectedCredits).toBe(35_000);
    expect(result.reviewNotes).toEqual([]);
  });

  it("FHA, credits exceed 6% cap → invalid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "fha",
        ltvRatio: 0.95,
        purchasePrice: 400_000,
        projectedSellerCredit: 30_000, // 7.5%
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("invalid");
    expect(result.blockingReasonCode).toBe("exceeds_ipc_limit");
    expect(result.ipcLimitDollars).toBe(24_000);
  });

  it("VA, credits exceed 4% cap → invalid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "va",
        ltvRatio: 1.0,
        purchasePrice: 300_000,
        projectedSellerCredit: 15_000, // 5%
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("invalid");
    expect(result.blockingReasonCode).toBe("exceeds_ipc_limit");
    expect(result.ipcLimitDollars).toBe(12_000);
  });

  it("invalid result's blockingReasonMessage contains dollar amounts", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 50_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("invalid");
    expect(result.blockingReasonMessage).toContain("$50000.00");
    expect(result.blockingReasonMessage).toContain("$30000.00");
    expect(result.blockingReasonMessage).toContain("conventional");
  });

  it("very large credits (>100% of purchase) → invalid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 600_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("invalid");
    expect(result.blockingReasonCode).toBe("exceeds_ipc_limit");
  });
});

describe("validateLenderCredit — review_required path", () => {
  it("financingType 'other' → review_required with 'unknown_financing_type'", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "other",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 10_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("review_required");
    expect(result.blockingReasonCode).toBe("unknown_financing_type");
    expect(result.blockingReasonMessage).not.toBeNull();
    expect(result.ipcLimitPercent).toBe(0.06);
    expect(result.ipcLimitDollars).toBe(30_000);
    expect(result.reviewNotes.length).toBeGreaterThan(0);
  });

  it("conventional without LTV → review_required with 'missing_ltv_data'", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: undefined,
        purchasePrice: 500_000,
        projectedSellerCredit: 10_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("review_required");
    expect(result.blockingReasonCode).toBe("missing_ltv_data");
    expect(result.blockingReasonMessage).not.toBeNull();
    expect(result.ipcLimitPercent).toBe(0.06);
    expect(result.reviewNotes.length).toBeGreaterThan(0);
  });

  it("credits within 2% of cap → review_required ('edge_case_near_limit')", () => {
    // $500k purchase, 80% LTV conventional = 6% cap = $30k.
    // Credits of $28k = 5.6%. marginPercent = 0.06 - 0.056 = 0.004, which is < 0.02 → review.
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 28_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("review_required");
    expect(result.blockingReasonCode).toBe("edge_case_near_limit");
    expect(result.reviewNotes.length).toBeGreaterThan(0);
  });

  it("credits at 5% on a 6% cap (margin = 1%) → review_required", () => {
    // $500k, 80% LTV conventional, credits = $25k (5%). margin = 0.01 < 0.02 → review.
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 25_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("review_required");
    expect(result.blockingReasonCode).toBe("edge_case_near_limit");
  });

  it("high LTV conventional ≤ 75% at 9% cap, credits above 6% but with safe margin → high_ltv_stricter_limit review", () => {
    // $500k, 70% LTV conventional = 9% cap ($45k). Need credits > $30k (6%)
    // but margin >= 0.02 (to skip edge_case_near_limit).
    // Credits = $31k (6.2%), margin = 0.09 - 0.062 = 0.028 → clears near-limit, hits high_ltv_stricter_limit.
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.70,
        purchasePrice: 500_000,
        projectedSellerCredit: 31_000, // 6.2% — above 6% conventional default but within 9%
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("review_required");
    expect(result.blockingReasonCode).toBe("high_ltv_stricter_limit");
    expect(result.ipcLimitPercent).toBe(0.09);
    expect(result.reviewNotes.length).toBeGreaterThan(0);
  });

  it("review_required result carries blockingReasonMessage string", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "other",
        purchasePrice: 500_000,
      }),
    );
    expect(result.outcome).toBe("review_required");
    expect(typeof result.blockingReasonMessage).toBe("string");
    expect(result.blockingReasonMessage?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("validateLenderCredit — edge cases", () => {
  it("purchasePrice 0 → does not crash, treats actualPercent as 0", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 0,
        projectedSellerCredit: 0,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    // ipcLimitDollars = 0, totalProjectedCredits = 0, credits not > limit, margin = 0.06, so valid
    expect(result.outcome).toBe("valid");
    expect(result.ipcLimitDollars).toBe(0);
    expect(result.totalProjectedCredits).toBe(0);
  });

  it("all zero credits on FHA → valid", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "fha",
        ltvRatio: 0.95,
        purchasePrice: 400_000,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.totalProjectedCredits).toBe(0);
  });

  it("totalProjectedCredits sums all three credit sources correctly", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 3_000,
        projectedBuyerCredit: 2_000,
        projectedClosingCredit: 1_000,
      }),
    );
    expect(result.totalProjectedCredits).toBe(6_000);
    expect(result.outcome).toBe("valid");
  });

  it("negative projected credits sum into totalProjectedCredits (no special handling)", () => {
    // The library does not clamp negatives; this documents current behavior.
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: -1_000,
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.totalProjectedCredits).toBe(-1_000);
    // -1000 is NOT > 30_000 (ipc limit), so not invalid.
    // actualPercent = -0.002; marginPercent = 0.062, which is >= 0.02 → valid.
    expect(result.outcome).toBe("valid");
  });
});

describe("validateLenderCredit — return shape (discriminated-union-ish contract)", () => {
  it("valid results have null reason code and empty review notes", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "cash",
        ltvRatio: undefined,
      }),
    );
    expect(result.outcome).toBe("valid");
    expect(result.blockingReasonCode).toBeNull();
    expect(result.blockingReasonMessage).toBeNull();
    expect(result.reviewNotes).toEqual([]);
  });

  it("invalid results have non-null reason code and message and empty review notes", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: 0.80,
        purchasePrice: 500_000,
        projectedSellerCredit: 100_000, // 20% — way over
        projectedBuyerCredit: 0,
        projectedClosingCredit: 0,
      }),
    );
    expect(result.outcome).toBe("invalid");
    expect(result.blockingReasonCode).not.toBeNull();
    expect(result.blockingReasonMessage).not.toBeNull();
    expect(result.reviewNotes).toEqual([]);
  });

  it("review_required results have non-empty review notes", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "conventional",
        ltvRatio: undefined,
        purchasePrice: 500_000,
      }),
    );
    expect(result.outcome).toBe("review_required");
    expect(result.reviewNotes.length).toBeGreaterThan(0);
    expect(result.blockingReasonCode).not.toBeNull();
    expect(result.blockingReasonMessage).not.toBeNull();
  });

  it("ipcLimitDollars always equals purchasePrice * ipcLimitPercent (except cash)", () => {
    const result = validateLenderCredit(
      makeInput({
        financingType: "fha",
        ltvRatio: 0.95,
        purchasePrice: 400_000,
      }),
    );
    expect(result.ipcLimitDollars).toBe(result.ipcLimitPercent * 400_000);
  });
});
