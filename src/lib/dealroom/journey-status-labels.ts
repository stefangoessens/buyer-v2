// ═══════════════════════════════════════════════════════════════════════════
// Journey status labels (KIN-1082)
//
// Single source of truth for the buyer-facing labels on the /dashboard/journeys
// screen. The raw lifecycle enum is an internal detail — buyers see
// friendlier phrases ("Just started", "Drafting offer") that match the
// 5-step progress indicator shown on each journey card.
//
// Pure TypeScript. Convex mirrors this by importing the file (tsconfig allows
// the Next.js app and Convex code to share `src/lib/dealroom/*` modules via
// dynamic import at the edges, but simpler projects can import the types
// directly — see convex/lib/dashboardDealIndex for the existing pattern).
// ═══════════════════════════════════════════════════════════════════════════

export type DealRoomLifecycleStatus =
  | "intake"
  | "analysis"
  | "tour_scheduled"
  | "offer_prep"
  | "offer_sent"
  | "under_contract"
  | "closing"
  | "closed"
  | "withdrawn";

/**
 * Buyer-facing label for every lifecycle status. These are short enough to
 * fit a chip / subtitle without truncation and avoid broker jargon.
 */
export const JOURNEY_STATUS_LABELS: Record<DealRoomLifecycleStatus, string> = {
  intake: "Just started",
  analysis: "Analyzing",
  tour_scheduled: "Tour scheduled",
  offer_prep: "Drafting offer",
  offer_sent: "Offer submitted",
  under_contract: "Under contract",
  closing: "Closing",
  closed: "Closed",
  withdrawn: "Withdrawn",
};

export function labelForJourneyStatus(status: DealRoomLifecycleStatus): string {
  return JOURNEY_STATUS_LABELS[status];
}

/**
 * Position of each status inside the 5-step progress indicator.
 *
 *   1 → Details    (property facts confirmed)
 *   2 → Price      (analysis / comps reviewed)
 *   3 → Disclosures (tour logistics + seller disclosures)
 *   4 → Offer      (offer prepared or sent)
 *   5 → Closing    (under contract, closing, or closed)
 *   0 → no step    (withdrawn — not rendered on the progress bar)
 */
export const JOURNEY_STEP_INDEX: Record<DealRoomLifecycleStatus, number> = {
  intake: 1,
  analysis: 2,
  tour_scheduled: 3,
  offer_prep: 4,
  offer_sent: 4,
  under_contract: 5,
  closing: 5,
  closed: 5,
  withdrawn: 0,
};

/**
 * Human-readable label for each step index. `0` is intentionally empty —
 * withdrawn journeys don't appear on the progress bar.
 */
export const JOURNEY_STEP_LABEL: Record<number, string> = {
  0: "",
  1: "Details",
  2: "Price",
  3: "Disclosures",
  4: "Offer",
  5: "Closing",
};

export const JOURNEY_TOTAL_STEPS = 5;

/**
 * Build the screen-reader aria-label for the journey progress indicator.
 * Shape: `"Step 2 of 5: Price, 40% complete"`.
 *
 * Keep the output stable — it is asserted verbatim in tests so the design
 * language on the dashboard doesn't drift out of sync with the accessibility
 * contract.
 */
export function journeyStepAriaLabel(
  step: number,
  percentComplete: number,
): string {
  const label = JOURNEY_STEP_LABEL[step] ?? "";
  const pct = Math.round(percentComplete);
  return `Step ${step} of ${JOURNEY_TOTAL_STEPS}: ${label}, ${pct}% complete`;
}
