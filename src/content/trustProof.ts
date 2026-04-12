import type { CaseStudy, ProofBlock } from "@/lib/trustProof/types";

/**
 * Canonical trust-proof catalog for buyer-v2 (KIN-825).
 *
 * buyer-v2 is pre-revenue. All case studies and proof blocks below
 * are `illustrative` and must render with the "Illustrative example"
 * label (enforced by `src/lib/trustProof/policy.ts`). When live
 * transactions start closing, we append new records with
 * `source: "liveTransaction"` + `verification` metadata — they
 * render without a label.
 *
 * Keep illustrative + live records in the same catalog so the
 * selector can filter and label them deterministically.
 */

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: "cs_tampa_first_home",
    slug: "tampa-first-home",
    source: "illustrative",
    headline: "Saved $18,000 on a first home in Tampa",
    summary:
      "A first-time buyer pasted a Zillow link on lunch break and had a full analysis before they got back to their desk. buyer-v2 ran the pricing, comps, and leverage engines, then negotiated a $12,400 credit at closing.",
    body:
      "In this illustrative scenario, a first-time buyer in Tampa pastes a Zillow listing URL into buyer-v2. Within seconds the AI engines produce a fair-value estimate, five comparable sales, and a 7.4 / 10 competitiveness score. The pricing engine flags the listing as slightly overpriced relative to comps. Our broker then negotiates a rebated buyer-agent commission at closing, totaling approximately $18,000 between the price reduction and the rebate. The buyer walks away with a keys-in-hand closing in 23 days.\n\nThis is an illustrative example that demonstrates how the platform works end-to-end. Actual outcomes depend on the listing, negotiation, market conditions, and individual circumstances.",
    outcomes: {
      purchasePrice: 485_000,
      buyerSavings: 18_000,
      daysToClose: 23,
      effectiveCommissionPct: 1.5,
    },
    buyer: {
      displayName: "Maria G.",
      location: "First-time buyer, Tampa",
    },
    visibility: "public",
  },
  {
    id: "cs_miami_relocation",
    slug: "miami-relocation",
    source: "illustrative",
    headline: "Saved $22,400 relocating from Miami to Coral Gables",
    summary:
      "A relocating family used the savings calculator to model their buyer credit before paste-a-linking their shortlist. The AI flagged two overpriced listings and they closed on the third with a negotiated credit.",
    body:
      "Illustrative scenario. A relocating family uses buyer-v2's savings calculator to model their expected buyer credit, then pastes three shortlisted listings from Zillow. The pricing engine flags two of them as above fair value. They focus on the third, which the leverage engine identifies as highly negotiable (long days on market, recent price drop). Our broker negotiates a $14,000 price reduction plus the $8,400 buyer credit at closing.\n\nAs with all illustrative examples on this page, the outcomes are representative, not drawn from a specific closed buyer-v2 transaction.",
    outcomes: {
      purchasePrice: 825_000,
      buyerSavings: 22_400,
      daysToClose: 34,
      effectiveCommissionPct: 1.8,
    },
    buyer: {
      displayName: "James C.",
      location: "Relocating family, Coral Gables",
    },
    visibility: "public",
  },
  {
    id: "cs_orlando_townhome",
    slug: "orlando-townhome",
    source: "illustrative",
    headline: "First townhome in Orlando with a $9,200 credit",
    summary:
      "A young couple used buyer-v2 to analyze three new-construction townhome listings, picked the one the AI rated highest for value, and closed with a rebated commission.",
    body:
      "Illustrative example. A young couple looking for their first townhome in Orlando analyzes three new-construction listings through buyer-v2. The comps engine produces five nearby recent sales for each, and the competitiveness engine rates one listing significantly higher for value. They proceed with that listing, and our broker negotiates a $9,200 buyer credit at closing.\n\nRepresentative outcome — actual figures depend on the specific listing, builder terms, and negotiation.",
    outcomes: {
      purchasePrice: 395_000,
      buyerSavings: 9_200,
      daysToClose: 28,
      effectiveCommissionPct: 1.7,
    },
    buyer: {
      displayName: "Sarah M.",
      location: "First-time buyers, Orlando",
    },
    visibility: "public",
  },
  {
    id: "cs_internal_draft",
    slug: "internal-draft-example",
    source: "illustrative",
    headline: "Internal draft — not ready to publish",
    summary:
      "Internal draft case study held in source file for review but excluded from public rendering via the visibility flag.",
    body: "Internal content. Do not render.",
    outcomes: { purchasePrice: 0, buyerSavings: 0 },
    buyer: { displayName: "Internal", location: "Internal" },
    visibility: "internal",
  },
];

export const PROOF_BLOCKS: ProofBlock[] = [
  {
    id: "pb_pilot_cohort",
    source: "illustrative",
    value: "50+",
    label: "Pilot cohort buyers",
    description:
      "Buyers we're onboarding into the pilot cohort across Tampa, Miami, and Orlando.",
    visibility: "public",
  },
  {
    id: "pb_total_illustrative_savings",
    source: "illustrative",
    value: "$49.6K",
    label: "Illustrative savings across 3 scenarios",
    description:
      "Sum of the illustrative savings from the three case studies on this page.",
    visibility: "public",
  },
  {
    id: "pb_fl_brokerage",
    source: "illustrative",
    value: "100%",
    label: "Licensed Florida brokerage",
    description:
      "buyer-v2 is a fully licensed Florida real estate brokerage. Every license-critical action is reviewed by a licensed broker.",
    visibility: "public",
  },
  {
    id: "pb_first_analysis_time",
    source: "illustrative",
    value: "<10s",
    label: "To first AI analysis",
    description:
      "Median time from URL paste to first rendered AI analysis in our pilot environment.",
    visibility: "public",
  },
  {
    id: "pb_internal_runway",
    source: "illustrative",
    value: "18 months",
    label: "Internal: runway target",
    description: "Internal-only metric for ops dashboards.",
    visibility: "internal",
  },
];
