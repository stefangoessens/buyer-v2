/**
 * Homepage "How we compare" content (KIN-1084).
 *
 * Single source of truth for the 3-way comparison section that
 * positions buyer-v2 against a Traditional Agent and going Without an
 * Agent. Editorial-only — no styling, no shadcn token references — so
 * the marketing UI agent can ship the legacy-marketing-token table
 * shell without coupling to product primitives.
 *
 * Two row kinds drive the table:
 *   - "money" rows have a free-form text value per column (e.g. real
 *     dollar amounts and explanatory phrases).
 *   - "symbol" rows render a small symbol per column from a fixed
 *     palette (check / partial / cross / na) with optional inline label
 *     text (e.g. "Manual", "Varies").
 *
 * Stable row ids are used as the `rowKey` value in the
 * `home_comparison_row_interacted` analytics event, so changing them
 * silently breaks growth dashboards — only rename via deliberate
 * tracking-plan migration.
 */

export const SECTION_ID = "how-we-compare";

/**
 * Anchor id the marketing UI agent will add to HeroSection.tsx so the
 * secondary CTA can deep-link to the paste-a-link intake.
 */
export const HERO_INTAKE_ANCHOR = "hero-intake";

export const SECTION_EYEBROW = "How we compare";
export const SECTION_HEADLINE =
  "Better than traditional. Safer than going alone.";
export const SECTION_INTRO =
  "Traditional agents cost more. Going without representation looks free until the seller keeps the value and nobody is on your side. buyer-v2 is built to give you representation, leverage, and upside.";

export type ComparisonColumnKey = "buyer-v2" | "traditional" | "without";

export interface ComparisonColumn {
  key: ComparisonColumnKey;
  label: string;
  subtext?: string;
}

export const COLUMNS: readonly ComparisonColumn[] = [
  { key: "buyer-v2", label: "buyer-v2" },
  {
    key: "traditional",
    label: "Traditional Agent",
    subtext: "3% commission",
  },
  {
    key: "without",
    label: "Without an Agent",
    subtext: "DIY / unrepresented",
  },
];

export type ComparisonSymbol = "check" | "partial" | "cross" | "na";

export const SR_LABELS: Record<ComparisonSymbol, string> = {
  check: "Included",
  partial: "Partial",
  cross: "Not included",
  na: "Not applicable",
};

interface ComparisonRowBase {
  id: string;
  label: string;
}

export interface MoneyComparisonRow extends ComparisonRowBase {
  type: "money";
  values: Record<ComparisonColumnKey, string>;
}

export interface SymbolComparisonRowCell {
  symbol: ComparisonSymbol;
  /** Optional inline label rendered alongside the symbol (e.g. "Manual", "Varies"). */
  text?: string;
}

export interface SymbolComparisonRow extends ComparisonRowBase {
  type: "symbol";
  values: Record<ComparisonColumnKey, SymbolComparisonRowCell>;
}

export type ComparisonRow = MoneyComparisonRow | SymbolComparisonRow;

export const HOME_COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    id: "fee",
    type: "money",
    label: "Fee on $500K home",
    values: {
      "buyer-v2": "$0 until close / 1% capped",
      traditional: "$15,000 (3%)",
      without:
        "$0 upfront / buyer-side value usually stays with seller unless separately negotiated",
    },
  },
  {
    id: "rebate",
    type: "money",
    label: "Estimated rebate to you",
    values: {
      "buyer-v2": "~$10,000",
      traditional: "$0",
      without: "$0 typical",
    },
  },
  {
    id: "representation",
    type: "money",
    label: "Who represents you",
    values: {
      "buyer-v2": "Licensed FL broker",
      traditional: "Licensed agent",
      without: "You represent yourself",
    },
  },
  {
    id: "ai_pricing",
    type: "symbol",
    label: "Instant AI pricing + comps",
    values: {
      "buyer-v2": { symbol: "check" },
      traditional: { symbol: "cross" },
      without: { symbol: "cross" },
    },
  },
  {
    id: "disclosure_red_flags",
    type: "symbol",
    label: "Disclosure red flags",
    values: {
      "buyer-v2": { symbol: "check" },
      traditional: { symbol: "partial", text: "Manual" },
      without: { symbol: "cross" },
    },
  },
  {
    id: "negotiation_support",
    type: "symbol",
    label: "Negotiation support",
    values: {
      "buyer-v2": { symbol: "check" },
      traditional: { symbol: "check" },
      without: { symbol: "cross" },
    },
  },
  {
    id: "inspection_ai",
    type: "symbol",
    label: "Inspection AI analysis",
    values: {
      "buyer-v2": { symbol: "check" },
      traditional: { symbol: "cross" },
      without: { symbol: "cross" },
    },
  },
  {
    id: "closing_coordination",
    type: "symbol",
    label: "Closing coordination",
    values: {
      "buyer-v2": { symbol: "check" },
      traditional: { symbol: "partial", text: "Varies" },
      without: { symbol: "cross" },
    },
  },
  {
    id: "flat_fee_alignment",
    type: "symbol",
    label: "Flat-fee alignment",
    values: {
      "buyer-v2": { symbol: "check" },
      traditional: { symbol: "cross" },
      without: { symbol: "na" },
    },
  },
];

export const DISCLAIMER =
  "Illustrative example assumes a $500,000 Florida purchase with 3% buyer-side compensation and a 1% buyer-v2 fee cap. Actual commission, credit, and representation terms vary by listing and final agreement. Unrepresented buyers can sometimes negotiate a seller credit, but lose professional representation, AI analysis tools, and negotiation support.";

export const PRIMARY_CTA = {
  label: "See the full pricing math",
  href: "/pricing#savings-calculator",
} as const;

export const SECONDARY_CTA = {
  label: "Paste a Zillow, Redfin, or Realtor link",
  href: `#${HERO_INTAKE_ANCHOR}`,
} as const;

// TODO(KIN-1077): replace placeholder with `broker.fl_license_number` setting once the brokerage gate ships.
export const FL_BROKER_LICENSE_FOOTER =
  "Licensed Florida real estate brokerage · License #[pending broker.fl_license_number setting]";
