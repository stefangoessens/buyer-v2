/**
 * Pure savings calculator for buyer-v2 (KIN-772).
 *
 * This module owns the math that drives the public savings calculator,
 * the homepage teaser, pricing pages, and any future campaign surface.
 * It is deliberately decoupled from disclosure rendering — legal copy
 * lives in `src/lib/pricing/disclosures.ts` and can evolve without
 * touching this file.
 *
 * Model summary
 * -------------
 * In Florida (and most US markets today), the seller pays the total
 * real-estate commission out of proceeds at closing. That total is
 * typically split between the listing agent and the buyer's agent —
 * historically around 3% each for a 6% total, though every number is
 * negotiable and the post-NAR-settlement landscape has made the split
 * explicitly up to the parties.
 *
 * buyer-v2's model: we are the buyer's brokerage, and we credit a
 * portion of the buyer-agent commission back to the buyer at closing
 * as a buyer credit (a.k.a. commission rebate). The calculator below
 * turns typed assumptions about price, total commission, buyer-agent
 * split, and rebate percent into a typed result the UI can render
 * directly — with explicit boundary/error states so the surface never
 * shows a silent zero.
 *
 * Nothing in this file renders UI or copy. Callers compose the result
 * with disclosures from the disclosure module.
 */

// MARK: - Inputs

/**
 * Typed input model for the calculator.
 *
 * All percentages are whole numbers in the range [0, 100] — e.g. 6
 * means 6%, not 0.06. The calculator normalizes them internally.
 *
 * Every field is required — the UI passes explicit defaults when the
 * user hasn't touched a control. A missing field surfaces as an
 * `.missingInput` error so we never silently treat nothing as zero.
 */
export type SavingsCalculatorInput = {
  /** Agreed purchase price in USD. Must be > 0. */
  purchasePrice: number;

  /**
   * Total real-estate commission paid by the seller, as a percent of
   * purchase price. Range: [0, 100]. Typical values: 5.0 – 6.0.
   */
  totalCommissionPercent: number;

  /**
   * The buyer-agent share of the total commission, as a percent of
   * purchase price (not of total commission). Range: [0, totalCommissionPercent].
   * Typical values: 2.5 – 3.0 at a 6% total. Post-NAR-settlement the
   * split is fully negotiable so we accept any number within the
   * total-commission ceiling.
   */
  buyerAgentCommissionPercent: number;

  /**
   * Percentage of the buyer-agent commission that buyer-v2 credits
   * back to the buyer at closing. Range: [0, 100].
   *
   * A value of 33 means buyer-v2 keeps 67% of the buyer-agent
   * commission as its service fee and credits 33% to the buyer.
   */
  buyerCreditPercent: number;
};

// MARK: - Errors

/**
 * Every invalid-input condition surfaces as an explicit discriminated
 * union case so the UI can render precise error messages without
 * inspecting raw strings. No calculator result shipping from this
 * module collapses to "NaN" or "0" — errors are first-class values.
 */
export type CalculatorError =
  | {
      kind: "missingInput";
      field: keyof SavingsCalculatorInput;
      message: string;
    }
  | {
      kind: "outOfRange";
      field: keyof SavingsCalculatorInput;
      min: number;
      max: number;
      actual: number;
      message: string;
    }
  | {
      kind: "inconsistentSplit";
      message: string;
    };

// MARK: - Result

/**
 * Deterministic result of a successful calculation. Every field is
 * derived from the inputs — no fallback defaults, no implicit rounding
 * that would hide a miscalculation.
 *
 * Currency values are in whole USD (rounded to the nearest dollar at
 * the module boundary so callers never have to deal with floating-point
 * artifacts in display code).
 */
export type SavingsCalculatorResult = {
  /** Echo of the inputs — callers sometimes display them next to outputs. */
  input: SavingsCalculatorInput;

  /** Total seller-paid commission in USD (price * totalCommissionPercent / 100). */
  totalCommissionAmount: number;

  /** Buyer-agent commission slice in USD. */
  buyerAgentCommissionAmount: number;

  /**
   * Amount credited to the buyer at closing in USD. This is the dollar
   * figure the homepage hero shows as "you save $X".
   */
  buyerCreditAmount: number;

  /**
   * Amount buyer-v2 retains as its fee in USD (buyerAgentCommissionAmount
   * minus buyerCreditAmount).
   */
  buyerV2FeeAmount: number;

  /**
   * Effective commission percent the buyer ends up paying — computed
   * as (buyer-agent commission - buyer credit) / price * 100. Used by
   * the pricing page for a "what you actually pay" row.
   */
  effectiveBuyerCommissionPercent: number;

  /**
   * Zero-comp state: when totalCommissionPercent or
   * buyerAgentCommissionPercent is 0 the entire result collapses to
   * "no savings available". We still return a valid result (not an
   * error) because 0-commission listings exist and the UI needs to
   * render them with a clear "no commission on this listing" banner.
   */
  isZeroCommission: boolean;
};

/**
 * Discriminated union returned by the calculator. Callers must exhaust
 * both cases — no sneaky "success with undefined" state.
 */
export type SavingsCalculation =
  | { kind: "ok"; result: SavingsCalculatorResult }
  | { kind: "error"; errors: CalculatorError[] };

// MARK: - Calculator

/**
 * Run the savings calculation.
 *
 * All validation happens up front so an invalid input always yields
 * an `.error` result with a complete list of issues — the UI can
 * render every field-level message at once instead of one-at-a-time.
 *
 * @param input Typed input model. Percentages are whole numbers.
 * @returns Either `{ kind: "ok", result }` or `{ kind: "error", errors }`.
 */
export function calculateSavings(
  input: SavingsCalculatorInput
): SavingsCalculation {
  const errors: CalculatorError[] = [];

  // Missing / non-numeric guards. We check NaN explicitly because the
  // UI's numeric input can emit NaN for a cleared field.
  if (!isFiniteNumber(input.purchasePrice)) {
    errors.push({
      kind: "missingInput",
      field: "purchasePrice",
      message: "Enter a purchase price.",
    });
  }
  if (!isFiniteNumber(input.totalCommissionPercent)) {
    errors.push({
      kind: "missingInput",
      field: "totalCommissionPercent",
      message: "Enter a total commission percent.",
    });
  }
  if (!isFiniteNumber(input.buyerAgentCommissionPercent)) {
    errors.push({
      kind: "missingInput",
      field: "buyerAgentCommissionPercent",
      message: "Enter a buyer-agent commission percent.",
    });
  }
  if (!isFiniteNumber(input.buyerCreditPercent)) {
    errors.push({
      kind: "missingInput",
      field: "buyerCreditPercent",
      message: "Enter a buyer credit percent.",
    });
  }

  // If any missing-input errors, bail before range checks so we don't
  // chain NaN comparisons.
  if (errors.length > 0) {
    return { kind: "error", errors };
  }

  // Range checks.
  if (input.purchasePrice <= 0) {
    errors.push({
      kind: "outOfRange",
      field: "purchasePrice",
      min: 1,
      max: Number.POSITIVE_INFINITY,
      actual: input.purchasePrice,
      message: "Purchase price must be greater than $0.",
    });
  }
  if (input.totalCommissionPercent < 0 || input.totalCommissionPercent > 100) {
    errors.push({
      kind: "outOfRange",
      field: "totalCommissionPercent",
      min: 0,
      max: 100,
      actual: input.totalCommissionPercent,
      message: "Total commission must be between 0% and 100%.",
    });
  }
  if (
    input.buyerAgentCommissionPercent < 0 ||
    input.buyerAgentCommissionPercent > 100
  ) {
    errors.push({
      kind: "outOfRange",
      field: "buyerAgentCommissionPercent",
      min: 0,
      max: 100,
      actual: input.buyerAgentCommissionPercent,
      message: "Buyer-agent commission must be between 0% and 100%.",
    });
  }
  if (input.buyerCreditPercent < 0 || input.buyerCreditPercent > 100) {
    errors.push({
      kind: "outOfRange",
      field: "buyerCreditPercent",
      min: 0,
      max: 100,
      actual: input.buyerCreditPercent,
      message: "Buyer credit must be between 0% and 100%.",
    });
  }

  // Consistency check: buyer-agent share can't exceed total commission.
  if (input.buyerAgentCommissionPercent > input.totalCommissionPercent) {
    errors.push({
      kind: "inconsistentSplit",
      message:
        "Buyer-agent commission can't exceed the total commission — check your split assumptions.",
    });
  }

  if (errors.length > 0) {
    return { kind: "error", errors };
  }

  // Calculation. Done in cents to avoid binary-float drift on typical
  // real-estate numbers, then rounded back to whole dollars.
  const priceCents = Math.round(input.purchasePrice * 100);
  const totalCommissionCents = Math.round(
    (priceCents * input.totalCommissionPercent) / 100
  );
  const buyerAgentCents = Math.round(
    (priceCents * input.buyerAgentCommissionPercent) / 100
  );
  const buyerCreditCents = Math.round(
    (buyerAgentCents * input.buyerCreditPercent) / 100
  );
  const buyerV2FeeCents = Math.max(0, buyerAgentCents - buyerCreditCents);

  const isZeroCommission =
    input.totalCommissionPercent === 0 ||
    input.buyerAgentCommissionPercent === 0;

  const effectiveBuyerCommissionPercent =
    input.purchasePrice === 0
      ? 0
      : Number(
          (
            ((buyerAgentCents - buyerCreditCents) / priceCents) *
            100
          ).toFixed(3)
        );

  return {
    kind: "ok",
    result: {
      input,
      totalCommissionAmount: Math.round(totalCommissionCents / 100),
      buyerAgentCommissionAmount: Math.round(buyerAgentCents / 100),
      buyerCreditAmount: Math.round(buyerCreditCents / 100),
      buyerV2FeeAmount: Math.round(buyerV2FeeCents / 100),
      effectiveBuyerCommissionPercent,
      isZeroCommission,
    },
  };
}

// MARK: - Defaults

/**
 * The canonical defaults the public calculator shows on first render.
 * These match the Florida market averages we use in buyer education
 * copy. Exposed as a function (not a const) so a future config
 * surface can swap them without changing the calculator API.
 */
export function defaultCalculatorInput(
  purchasePrice: number = 500_000
): SavingsCalculatorInput {
  return {
    purchasePrice,
    totalCommissionPercent: 6,
    buyerAgentCommissionPercent: 3,
    buyerCreditPercent: 33,
  };
}

// MARK: - Currency formatting

/**
 * Shared formatter so every surface renders the same rounded USD
 * figures. Kept here rather than in a component so tests exercise
 * the same code path.
 */
export function formatUSD(
  amount: number,
  options: { showCents?: boolean } = {}
): string {
  const fractionDigits = options.showCents ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

// MARK: - Raw-input parsing (for interactive edit state)

/**
 * Parse a single raw string field into a number for the calculator.
 *
 * Why this exists: when the UI binds numeric `input` state directly,
 * transient decimal input like `"2."` gets immediately coerced to `2`
 * by `Number(...)`, eating the trailing dot and making it impossible
 * to type `2.5`. Components should hold a `Record<field, string>`
 * edit state as the source of truth and run it through this helper
 * to derive the numeric calculator input on each render.
 *
 * Return contract:
 * - Empty / whitespace / `.` / `-` / trailing-dot → NaN
 *   (surfaced as `missingInput` by the calculator — UI hint)
 * - Fully-formed numbers → the parsed number
 * - Non-finite (Infinity, bad text) → NaN
 */
export function parseRawField(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "." || trimmed === "-") return Number.NaN;
  // Trailing decimal like "2." means the user is mid-type — treat as
  // NaN so the calculator waits for a full number without the UI
  // losing the raw edit state.
  if (trimmed.endsWith(".")) return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// MARK: - Private helpers

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
