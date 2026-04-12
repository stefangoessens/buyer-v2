// ═══════════════════════════════════════════════════════════════════════════
// Lender Credit Validation (KIN-838) — CONVEX MIRROR
//
// This file is a hand-maintained mirror of
// `src/lib/dealroom/lender-credit-validate.ts`. Convex's tsconfig cannot
// import modules from `../src`, so the pure computation logic has to live
// twice: once for the Next.js app, once for Convex functions.
//
// RULES:
//   - Any change here MUST be mirrored in src/lib/dealroom/lender-credit-validate.ts
//   - Any change there MUST be mirrored here
//   - The exported shapes (types + function signatures) are identical
//
// Implements IPC (Interested Party Contribution) limits per FL real
// estate conventions:
//   - Conventional: 3% LTV > 90%, 6% LTV 75-90%, 9% LTV ≤ 75%
//   - FHA: 6% flat
//   - VA: 4% flat
//   - Cash: no constraint
//
// Edge cases trigger "review_required" instead of hard-failing:
//   - Credits within 2% of the IPC cap (could shift at closing)
//   - Missing LTV data on a non-cash purchase
//   - Unknown financing type
// ═══════════════════════════════════════════════════════════════════════════

export type FinancingType = "cash" | "conventional" | "fha" | "va" | "other";

export type ValidationOutcome = "valid" | "invalid" | "review_required";

export type BlockingReasonCode =
  | "exceeds_ipc_limit"
  | "cash_purchase_no_constraint"
  | "unknown_financing_type"
  | "missing_ltv_data"
  | "high_ltv_stricter_limit"
  | "edge_case_near_limit"
  | "va_cash_in_at_closing"
  | "fha_seller_contribution_cap";

export interface LenderValidationInput {
  financingType: FinancingType;
  purchasePrice: number;
  ltvRatio?: number; // 0-1, e.g. 0.8 for 80%
  projectedSellerCredit: number;
  projectedBuyerCredit: number;
  projectedClosingCredit: number;
}

export interface LenderValidationResult {
  outcome: ValidationOutcome;
  ipcLimitPercent: number; // 0 if cash, else 0.03-0.09
  ipcLimitDollars: number;
  totalProjectedCredits: number;
  blockingReasonCode: BlockingReasonCode | null;
  blockingReasonMessage: string | null;
  /** If outcome is review_required, list of notes/caveats. */
  reviewNotes: string[];
}

/** Edge case threshold: credits within 2% of the IPC cap trigger review. */
export const NEAR_LIMIT_THRESHOLD = 0.02;

/**
 * Compute the applicable IPC limit percentage for a given financing type
 * and LTV ratio. Returns 0 for cash (no constraint) and a positive ratio
 * (e.g. 0.06 for 6%) for financed purchases.
 */
export function computeIpcLimitPercent(
  financingType: FinancingType,
  ltvRatio: number | undefined,
): number {
  switch (financingType) {
    case "cash":
      return 0; // no IPC constraint
    case "conventional":
      if (ltvRatio === undefined) return 0.06; // conservative default
      if (ltvRatio > 0.90) return 0.03;
      if (ltvRatio > 0.75) return 0.06;
      return 0.09;
    case "fha":
      return 0.06;
    case "va":
      return 0.04;
    case "other":
      return 0.06; // conservative fallback
    default:
      return 0.06;
  }
}

/**
 * Validate projected buyer credits against the applicable IPC limit.
 * Returns a typed outcome with machine-readable reason code, review
 * notes for edge cases, and exact dollar amounts.
 */
export function validateLenderCredit(
  input: LenderValidationInput,
): LenderValidationResult {
  const totalProjectedCredits =
    input.projectedSellerCredit +
    input.projectedBuyerCredit +
    input.projectedClosingCredit;

  // Cash purchase — no IPC constraint applies
  if (input.financingType === "cash") {
    return {
      outcome: "valid",
      ipcLimitPercent: 0,
      ipcLimitDollars: 0,
      totalProjectedCredits,
      blockingReasonCode: null,
      blockingReasonMessage: null,
      reviewNotes: [],
    };
  }

  // Unknown financing type — review required
  if (input.financingType === "other") {
    return {
      outcome: "review_required",
      ipcLimitPercent: 0.06,
      ipcLimitDollars: input.purchasePrice * 0.06,
      totalProjectedCredits,
      blockingReasonCode: "unknown_financing_type",
      blockingReasonMessage:
        "Financing type is 'other' — broker must verify IPC limits apply. Using conservative 6% default.",
      reviewNotes: [
        "Non-standard financing type. Broker must confirm the specific lender constraints apply to this transaction before crediting buyer.",
      ],
    };
  }

  // Missing LTV on financed purchase — review required
  if (input.ltvRatio === undefined && input.financingType === "conventional") {
    return {
      outcome: "review_required",
      ipcLimitPercent: 0.06,
      ipcLimitDollars: input.purchasePrice * 0.06,
      totalProjectedCredits,
      blockingReasonCode: "missing_ltv_data",
      blockingReasonMessage:
        "LTV ratio missing for conventional financing — broker must provide loan amount and down payment for accurate IPC limit.",
      reviewNotes: [
        "Conventional financing has tiered IPC limits by LTV (3%/6%/9%). Without LTV data, using conservative 6% default. Verify before closing.",
      ],
    };
  }

  const ipcLimitPercent = computeIpcLimitPercent(input.financingType, input.ltvRatio);
  const ipcLimitDollars = input.purchasePrice * ipcLimitPercent;
  const actualPercent = input.purchasePrice > 0 ? totalProjectedCredits / input.purchasePrice : 0;

  // Hard violation — exceeds IPC limit
  if (totalProjectedCredits > ipcLimitDollars) {
    return {
      outcome: "invalid",
      ipcLimitPercent,
      ipcLimitDollars,
      totalProjectedCredits,
      blockingReasonCode: "exceeds_ipc_limit",
      blockingReasonMessage: `Total projected credits ($${totalProjectedCredits.toFixed(2)}) exceed IPC limit of $${ipcLimitDollars.toFixed(2)} (${(ipcLimitPercent * 100).toFixed(1)}%) for ${input.financingType}.`,
      reviewNotes: [],
    };
  }

  // Near-limit edge case — review required (credits could shift at closing).
  // Use an epsilon tolerance to avoid IEEE-754 float drift flipping exact
  // boundary cases (e.g. 0.06 - 0.04 = 0.019999999999999997 in JS).
  const FLOAT_EPSILON = 1e-9;
  const marginPercent = ipcLimitPercent - actualPercent;
  if (
    marginPercent >= 0 &&
    marginPercent < NEAR_LIMIT_THRESHOLD - FLOAT_EPSILON
  ) {
    return {
      outcome: "review_required",
      ipcLimitPercent,
      ipcLimitDollars,
      totalProjectedCredits,
      blockingReasonCode: "edge_case_near_limit",
      blockingReasonMessage: `Projected credits are within ${(NEAR_LIMIT_THRESHOLD * 100).toFixed(0)}% of the IPC cap — closing costs may shift this over the limit.`,
      reviewNotes: [
        `Current: $${totalProjectedCredits.toFixed(2)} of $${ipcLimitDollars.toFixed(2)} cap (${(actualPercent * 100).toFixed(2)}% of ${(ipcLimitPercent * 100).toFixed(1)}%).`,
        "Broker should reserve contingency margin before finalizing credits.",
      ],
    };
  }

  // High LTV conventional at 9% cap — extra review for clarity
  if (
    input.financingType === "conventional" &&
    input.ltvRatio !== undefined &&
    input.ltvRatio <= 0.75 &&
    totalProjectedCredits > input.purchasePrice * 0.06
  ) {
    return {
      outcome: "review_required",
      ipcLimitPercent,
      ipcLimitDollars,
      totalProjectedCredits,
      blockingReasonCode: "high_ltv_stricter_limit",
      blockingReasonMessage: `Credits exceed typical 6% conventional cap but are within 9% allowance at this LTV (${(input.ltvRatio * 100).toFixed(0)}%). Broker should verify lender allows the higher cap.`,
      reviewNotes: [
        "Some lenders cap IPC at 6% regardless of LTV. Confirm with the specific lender before closing.",
      ],
    };
  }

  // Happy path — valid
  return {
    outcome: "valid",
    ipcLimitPercent,
    ipcLimitDollars,
    totalProjectedCredits,
    blockingReasonCode: null,
    blockingReasonMessage: null,
    reviewNotes: [],
  };
}
