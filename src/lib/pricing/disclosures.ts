/**
 * Compliance and disclosure copy for the savings calculator (KIN-772).
 *
 * This module holds the legal-reviewed copy that the calculator surface
 * must render alongside any savings figure. It is intentionally
 * separate from the math in `savingsCalculator.ts` — legal copy can
 * change without touching (and re-testing) the calculation code.
 *
 * Every disclosure has a stable `id` so analytics can track which
 * disclosures users have viewed, and so legal review rounds can
 * reference them by name.
 */

export type DisclosureSeverity = "info" | "emphasis" | "strong";

export type Disclosure = {
  /** Stable identifier — do not reuse when a disclosure is retired. */
  id: string;
  /** Short label for table-of-contents / analytics. */
  label: string;
  /** Body text shown inline on the calculator surface. */
  body: string;
  /** Visual weight hint for the renderer. */
  severity: DisclosureSeverity;
};

/**
 * The full disclosure set shown on the public savings calculator.
 * Order matters — the first item is rendered immediately under the
 * savings figure, the rest appear in the expandable "full disclosure"
 * accordion beneath.
 *
 * Any edit to this list is a legal review line item — add a TODO
 * comment referencing the review ticket rather than editing in place
 * if you're unsure.
 */
export const CALCULATOR_DISCLOSURES: ReadonlyArray<Disclosure> = [
  {
    id: "estimate_not_guarantee",
    label: "Estimate, not a guarantee",
    severity: "strong",
    body:
      "This calculator is an illustrative estimate based on typical Florida market assumptions. Actual commissions, credits, and closing figures depend on the final executed purchase agreement, the listing's co-broke offer, and any negotiation between the parties. buyer-v2 does not guarantee any specific savings amount.",
  },
  {
    id: "commission_negotiable",
    label: "Commissions are negotiable",
    severity: "emphasis",
    body:
      "Real estate commissions are always negotiable. The 6% total and 3% buyer-agent splits shown by default are historical market averages, not fixed rates. Post-2024 NAR settlement, buyer-agent compensation is explicitly negotiable between you and the listing side.",
  },
  {
    id: "buyer_credit_conditions",
    label: "Buyer credit conditions",
    severity: "info",
    body:
      "Buyer credit is applied at closing as a reduction of closing costs or cash to close, subject to the buyer-v2 buyer representation agreement and lender approval. Some mortgage programs cap the amount of seller and agent credits a buyer can receive — buyer-v2 will always disclose any such cap before closing.",
  },
  {
    id: "licensed_brokerage",
    label: "Licensed Florida brokerage",
    severity: "info",
    body:
      "buyer-v2 is a licensed Florida real estate brokerage. All license-critical actions — buyer representation agreements, compensation disclosures, and contract execution — are reviewed by a licensed broker. Nothing in this calculator constitutes legal or tax advice.",
  },
  {
    id: "no_fee_offer_acceptance",
    label: "No hidden fees",
    severity: "info",
    body:
      "buyer-v2 never charges the buyer directly for brokerage services. Our fee is paid out of the buyer-agent commission at closing. If a listing carries zero buyer-agent commission, we will tell you up front before you engage us.",
  },
] as const;

/**
 * Lookup a specific disclosure by id — used when a page wants to
 * highlight a particular clause (e.g. zero-commission banner shows
 * `estimate_not_guarantee` + `commission_negotiable` in a compact
 * inline layout).
 */
export function getDisclosure(id: string): Disclosure | undefined {
  return CALCULATOR_DISCLOSURES.find((d) => d.id === id);
}

/**
 * Return the disclosures that should sit immediately under the
 * headline savings figure (`severity === "strong"` or `"emphasis"`).
 * Used by the compact homepage teaser that doesn't show the full
 * accordion.
 */
export function getHeadlineDisclosures(): ReadonlyArray<Disclosure> {
  return CALCULATOR_DISCLOSURES.filter(
    (d) => d.severity === "strong" || d.severity === "emphasis"
  );
}
