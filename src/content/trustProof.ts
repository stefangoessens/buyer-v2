import type {
  BuyerStory,
  CaseStudy,
  ProofBlock,
} from "@/lib/trustProof/types";

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

// NOTE: All stories ship as `draft` until broker/legal release is obtained.
// Replace with real released buyer stories before public launch.
// Per KIN-1087 spec, drafts are HIDDEN by default via filterPublishableStories
// (opts.includeDrafts=false). The story-ui-routes teammate decides draft
// visibility per placement; home/pricing render nothing when no approved
// stories exist.
export const BUYER_STORIES: readonly BuyerStory[] = [
  {
    id: "story-dj-tampa",
    slug: "dj-tampa-first-time",
    visibility: "public",
    publicationStatus: "draft",
    placements: ["home", "pricing", "stories"],
    sortOrder: 1,
    buyer: {
      firstName: "DJ",
      lastInitial: "R",
      displayName: "DJ R.",
      type: "first_time",
      city: "Tampa",
      state: "FL",
    },
    teaser: {
      savedUsd: 10_500,
      quote:
        "They caught a flood-zone issue the seller's disclosure tried to bury. Saved me thousands and a lot of sleepless nights.",
      cardHeadline: "Saved $10,500 on my first Tampa home",
      closedLabel: "Closed Q1 2026",
    },
    story: {
      title: "How DJ saved $10,500 on his first Tampa home",
      summary:
        "A first-time buyer who almost signed on a flood-prone bungalow — until the AI disclosure review flagged it.",
      heroQuote:
        "I didn't know what I didn't know. The team caught things I would have missed.",
      floridaAngle:
        "Flood-zone disclosure review on a pre-2005 Tampa bungalow in Zone AE",
      body: "[DRAFT — Replace with real released buyer story before public launch.] DJ was ready to write an offer on a charming 1970s Tampa bungalow when the buyer-v2 AI parser flagged a discrepancy between the seller disclosure and the FEMA flood zone data. What looked like a simple Zone X listing turned out to be on an AE line — meaning $3,600/year flood insurance the seller had downplayed. DJ's broker used that finding to negotiate $10,500 in seller credits covering the first three years of flood premiums, plus a buyer-agent rebate at closing. DJ closed in Q1 2026.",
    },
    outcomes: {
      totalSavedUsd: 10_500,
      purchasePriceUsd: 385_000,
      rebateUsd: 7_700,
      negotiatedCreditsUsd: 2_800,
      daysToClose: 34,
    },
    compliance: {
      // Draft stories intentionally omit releaseRef + approvals.
      brokerApprovedForPublicUse: false,
      legalApprovedForPublicUse: false,
      retentionBucket: "legal_documents",
    },
  },
  {
    id: "story-alicia-miami",
    slug: "alicia-miami-repeat",
    visibility: "public",
    publicationStatus: "draft",
    placements: ["home", "pricing", "stories"],
    sortOrder: 2,
    buyer: {
      firstName: "Alicia",
      lastInitial: "P",
      displayName: "Alicia P.",
      type: "repeat",
      city: "Miami",
      state: "FL",
    },
    teaser: {
      savedUsd: 18_200,
      quote:
        "The hurricane insurance analysis alone saved me $5,000 — and that was before the rebate.",
      cardHeadline: "Saved $18,200 on a Miami condo with insurance leverage",
      closedLabel: "Closed Q1 2026",
    },
    story: {
      title: "How Alicia saved $18,200 on a Miami high-rise condo",
      summary:
        "A repeat buyer who used AI-backed hurricane-insurance analysis to negotiate concessions on a 1990s Brickell tower.",
      heroQuote:
        "I'd bought a house before but not like this. The insurance math was a game-changer.",
      floridaAngle:
        "Hurricane wind-mitigation + insurance-premium leverage on a pre-2001 Brickell high-rise",
      body: "[DRAFT — Replace with real released buyer story before public launch.] Alicia had bought a home once before and knew the drill — until she tried to buy a Miami condo built in 1994. The wind-mitigation report showed the building still had original hurricane shutters, which meant her insurance quote came in $5,800 higher than the seller's existing policy. Alicia's buyer-v2 broker surfaced the gap during the inspection period and negotiated a $12,000 seller credit plus a closing-cost reduction. Combined with her rebate at closing, Alicia walked away with $18,200 in savings. She closed in Q1 2026.",
    },
    outcomes: {
      totalSavedUsd: 18_200,
      purchasePriceUsd: 615_000,
      rebateUsd: 6_200,
      negotiatedCreditsUsd: 12_000,
      daysToClose: 42,
    },
    compliance: {
      brokerApprovedForPublicUse: false,
      legalApprovedForPublicUse: false,
      retentionBucket: "legal_documents",
    },
  },
  {
    id: "story-noah-orlando",
    slug: "noah-orlando-investor",
    visibility: "public",
    publicationStatus: "draft",
    placements: ["home", "pricing", "stories"],
    sortOrder: 3,
    buyer: {
      firstName: "Noah",
      lastInitial: "T",
      displayName: "Noah T.",
      type: "investor",
      city: "Orlando",
      state: "FL",
    },
    teaser: {
      savedUsd: 14_750,
      quote:
        "The roof was mid-useful-life. They caught it, got it replaced before closing, and credited me the difference.",
      cardHeadline: "Saved $14,750 on an Orlando rental duplex",
      closedLabel: "Closed Q1 2026",
    },
    story: {
      title: "How Noah saved $14,750 on an Orlando rental duplex",
      summary:
        "An investor buyer who used wind-mit + roof-age findings to negotiate a new roof and a credit on a turnkey Orlando duplex.",
      heroQuote:
        "For rental math to work, you need to know the roof replacement is not coming in year two.",
      floridaAngle:
        "Wind-mit + 15-year roof-age leverage on a 2009 Orlando duplex",
      body: "[DRAFT — Replace with real released buyer story before public launch.] Noah was underwriting his third rental property when the inspection report flagged the 2009 roof as having 1-3 years of useful life remaining. The wind-mit report confirmed the straps and opening protection were original, meaning insurance was already at a premium. Noah's broker used both findings to negotiate the seller into replacing the roof before closing, plus a $9,500 credit toward the first-year insurance delta. With the buyer-v2 rebate on top, Noah saved $14,750 total. He closed in Q1 2026.",
    },
    outcomes: {
      totalSavedUsd: 14_750,
      purchasePriceUsd: 425_000,
      rebateUsd: 5_250,
      negotiatedCreditsUsd: 9_500,
      daysToClose: 38,
    },
    compliance: {
      brokerApprovedForPublicUse: false,
      legalApprovedForPublicUse: false,
      retentionBucket: "legal_documents",
    },
  },
];
