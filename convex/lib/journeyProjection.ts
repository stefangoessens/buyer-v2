// ═══════════════════════════════════════════════════════════════════════════
// Journey projection helpers (KIN-1082) — CONVEX MIRROR
//
// Hand-maintained mirror of `src/lib/dealroom/journey-status-labels.ts`,
// `src/lib/dealroom/journey-routing.ts`, and the server-only pieces that
// turn a (dealRoom, property, attention sources) triple into the canonical
// journey row shape consumed by both the /dashboard/journeys screen and
// the dashboard teaser that survives after KIN-1082.
//
// Convex's tsconfig allows `@/*` and `../src/*` via bundler resolution, but
// the existing convention here (see `convex/lib/dashboardDealIndex.ts`) is
// to mirror pure helpers into `convex/lib` so queries never need a dynamic
// import at request time. New code should follow that convention.
//
// RULES:
//   - Any change here MUST be mirrored in the matching src/lib file
//   - Any change there MUST be mirrored here
// ═══════════════════════════════════════════════════════════════════════════

import type { DealStatus } from "./dashboardDealIndex";

// ───────────────────────────────────────────────────────────────────────────
// Buyer-facing labels (mirror of src/lib/dealroom/journey-status-labels.ts)
// ───────────────────────────────────────────────────────────────────────────

export const JOURNEY_STATUS_LABELS: Record<DealStatus, string> = {
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

export const JOURNEY_STEP_INDEX: Record<DealStatus, number> = {
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

export const JOURNEY_STEP_LABEL: Record<number, string> = {
  0: "",
  1: "Details",
  2: "Price",
  3: "Disclosures",
  4: "Offer",
  5: "Closing",
};

export const JOURNEY_TOTAL_STEPS = 5;

export function labelForJourneyStatus(status: DealStatus): string {
  return JOURNEY_STATUS_LABELS[status];
}

// ───────────────────────────────────────────────────────────────────────────
// Routing (mirror of src/lib/dealroom/journey-routing.ts)
// ───────────────────────────────────────────────────────────────────────────

export function resolveJourneyHref(
  propertyId: string,
  status: DealStatus,
): string {
  if (status === "under_contract" || status === "closing") {
    return `/property/${propertyId}/closing`;
  }
  if (status === "offer_prep" || status === "offer_sent") {
    return `/property/${propertyId}/offer`;
  }
  if (status === "tour_scheduled") {
    return `/property/${propertyId}/disclosures`;
  }
  if (status === "analysis") {
    return `/property/${propertyId}/price`;
  }
  return `/property/${propertyId}/details`;
}

// ───────────────────────────────────────────────────────────────────────────
// Next-action / step projection (shared by /dashboard/journeys and the
// dashboard teaser). Re-homed from convex/dashboardPortfolio.ts so both
// queries emit identical copy and severity.
// ───────────────────────────────────────────────────────────────────────────

export type TeaserStep =
  | "details"
  | "price"
  | "disclosures"
  | "offer"
  | "close";

export type NextActionSeverity = "info" | "warning" | "error";

export interface NextActionProjection {
  currentStep: TeaserStep;
  nextAction: {
    label: string;
    href: string;
    severity: NextActionSeverity;
  };
}

export function projectNextAction(
  status: DealStatus,
  propertyId: string,
): NextActionProjection {
  switch (status) {
    case "intake":
      return {
        currentStep: "details",
        nextAction: {
          label: "Review property details",
          href: `/property/${propertyId}/details`,
          severity: "info",
        },
      };
    case "analysis":
      return {
        currentStep: "price",
        nextAction: {
          label: "Review pricing",
          href: `/property/${propertyId}/price`,
          severity: "info",
        },
      };
    case "tour_scheduled":
      return {
        currentStep: "disclosures",
        nextAction: {
          label: "Prep for tour",
          href: `/property/${propertyId}/details`,
          severity: "info",
        },
      };
    case "offer_prep":
      return {
        currentStep: "offer",
        nextAction: {
          label: "Finalize offer",
          href: `/property/${propertyId}/offer`,
          severity: "warning",
        },
      };
    case "offer_sent":
      return {
        currentStep: "offer",
        nextAction: {
          label: "Awaiting seller response",
          href: `/property/${propertyId}/offer`,
          severity: "warning",
        },
      };
    case "under_contract":
      return {
        currentStep: "offer",
        nextAction: {
          label: "Track your closing",
          href: `/property/${propertyId}/closing`,
          severity: "warning",
        },
      };
    case "closing":
      return {
        currentStep: "close",
        nextAction: {
          label: "Closing workflow",
          href: `/property/${propertyId}/closing`,
          severity: "info",
        },
      };
    case "closed":
      return {
        currentStep: "close",
        nextAction: {
          label: "View summary",
          href: `/property/${propertyId}/closing`,
          severity: "info",
        },
      };
    case "withdrawn":
      return {
        currentStep: "details",
        nextAction: {
          label: "Reopen deal",
          href: `/property/${propertyId}/details`,
          severity: "info",
        },
      };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Percent-complete helper — used for the aria-label on the progress bar.
// intake = 0%, closing/closed = 100%, linear in between.
// ───────────────────────────────────────────────────────────────────────────

export function percentCompleteForStatus(status: DealStatus): number {
  const step = JOURNEY_STEP_INDEX[status];
  if (step <= 0) return 0;
  if (status === "closed") return 100;
  return Math.round(((step - 1) / (JOURNEY_TOTAL_STEPS - 1)) * 100);
}
