/**
 * Homepage interactive rebate slider content (KIN-1086).
 *
 * Editorial-only content for the "up to 2% back at closing" homepage
 * section. No styling, no JSX, no DOM references — the marketing UI
 * agent composes these strings into the interactive slider while the
 * math helper (`src/lib/pricing/rebateIllustration.ts`) drives the
 * numbers. Copy is production-ready, legal-safe ("could go toward",
 * never "you will get"), Florida-specific, and not salesy.
 *
 * Aspiration bands map from the `RebateBand` discriminator in the
 * math helper to a short headline + three example upgrades the rebate
 * "could go toward" — intentionally Florida-flavored (hurricane
 * shutters, wind mitigation, hurricane-rated roofs).
 */

import type { RebateBand } from "@/lib/pricing/rebateIllustration";

export const SECTION_ID = "rebate-slider";
export const SECTION_EYEBROW = "Up to 2% back at closing";

export const SECTION_HEADLINE_PREFIX = "A";
export const SECTION_HEADLINE_INFIX = "home could put";
export const SECTION_HEADLINE_SUFFIX = "back in your pocket";

/**
 * Returns a fully-interpolated headline string. Callers pass already
 * currency-formatted price and rebate values (typically via
 * `formatCurrency` from the math helper) so this stays presentation
 * agnostic.
 */
export function formatHeadline(
  formattedPrice: string,
  formattedRebate: string,
): string {
  return `${SECTION_HEADLINE_PREFIX} ${formattedPrice} ${SECTION_HEADLINE_INFIX} ${formattedRebate} ${SECTION_HEADLINE_SUFFIX}`;
}

export const SECTION_INTRO =
  "Every buyer-v2 deal is built to send money back to you at closing. Drag the slider to see what a typical Florida purchase could look like — this is an illustrative estimate, not a guaranteed payout.";

export const MATH_TRANSPARENCY_LABELS = {
  priceLabel: "home price",
  commissionLabel: "3% buyer-side commission",
  feeLabel: "buyer-v2 1% fee",
  rebateLabel: "estimated rebate",
} as const;

export const DISCLAIMER =
  "Illustrative estimate assumes a 3% buyer-side commission and buyer-v2's 1% flat fee. Actual commission, lender limits, credits, and representation terms vary by listing and final agreement. Subject to closing. buyer-v2 is a licensed Florida real estate brokerage.";

// TODO(KIN-1077): replace placeholder with actual broker.fl_license_number once exposed in a public-safe way.
export const LICENSE_SUFFIX =
  "License #[pending broker.fl_license_number setting]";

export const LOW_COMMISSION_NOTE =
  "If the listing offers less than 1% buyer-side compensation, your rebate may be $0.";

export const ASPIRATION_BANDS: Record<
  RebateBand,
  { headline: string; items: readonly string[] }
> = {
  zero: {
    headline: "You still get full representation + AI analysis",
    items: [
      "Full buyer-side representation",
      "Instant AI pricing, comps, and disclosure flags",
      "No rebate required to work with us",
    ],
  },
  "under-5k": {
    headline: "Could go toward",
    items: [
      "Moving costs",
      "Hurricane prep kit",
      "Appliance upgrades",
    ],
  },
  "5k-10k": {
    headline: "Could go toward",
    items: [
      "Hurricane shutters",
      "New flooring",
      "Rate buydown cushion",
    ],
  },
  "10k-20k": {
    headline: "Could go toward",
    items: [
      "Bathroom remodel",
      "Hurricane-rated roof contribution",
      "Wind mitigation upgrades",
    ],
  },
  "over-20k": {
    headline: "Could go toward",
    items: [
      "Kitchen remodel",
      "Full hurricane-rated roof replacement",
      "Major post-close project",
    ],
  },
};

export const PRIMARY_CTA = {
  label: "Paste a property link to get your real home analysis",
  href: "#hero-intake",
} as const;

export const FALLBACK_PRICE_POINTS: readonly number[] = [
  250_000, 500_000, 750_000, 1_000_000,
] as const;
