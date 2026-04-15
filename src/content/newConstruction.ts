import type { NewConstructionCatalog } from "@/lib/newConstruction/types";

/**
 * New-construction landing page catalog (KIN-823).
 *
 * Florida-first launch with two builders (one national, one
 * regional illustrative) and three communities. Every record is
 * typed and goes through `validateCatalog` in the test suite.
 *
 * Editing this file IS the CMS for new-construction SEO pages.
 * All copy goes through marketing + legal before a record flips
 * to public — urgency and savings claims are especially sensitive.
 */

export const NEW_CONSTRUCTION_CATALOG: NewConstructionCatalog = {
  builders: [
    {
      slug: "lennar",
      displayName: "Lennar",
      tagline: "National builder with deep Florida inventory.",
      pageTitle: "Lennar New Construction in Florida",
      summary:
        "A plain-language guide to buying a Lennar new-construction home in Florida with buyer-v2 — how the buyer-side commission works on new builds, what to expect at closing, and which incentive programs stack with a buyer-v2 rebate.",
      heroHeadline: "Buying a Lennar new-construction home in Florida",
      heroSubheadline:
        "Get buyer-v2's AI pricing and a rebate at closing while still keeping any Lennar builder incentives you qualify for.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "Lennar is one of Florida's largest new-construction builders. buyer-v2 represents buyers on Lennar purchases the same way we represent buyers on resale listings: we run the same AI pricing engine, provide the same licensed broker representation, and rebate a portion of the buyer-agent commission at closing. The difference is that new construction commission structures and incentives are builder-specific, so our analysis surfaces which incentives stack and which are mutually exclusive.",
        },
        {
          kind: "builder_facts",
          facts: [
            { label: "Founded", value: "1954" },
            { label: "FL communities", value: "200+" },
            { label: "Warranty", value: "10-year structural" },
            { label: "Typical delivery", value: "6–12 months" },
          ],
        },
        {
          kind: "savings_projection",
          headline: "Illustrative buyer-v2 savings on a Lennar purchase",
          rows: [
            {
              label: "Lennar builder rate buydown",
              value: "Up to $10,000",
              note: "Stackable with buyer-v2 rebate",
            },
            {
              label: "buyer-v2 commission rebate",
              value: "~$4,500",
              note: "On a $500k purchase — see savings calculator for your deal",
            },
            {
              label: "Total illustrative savings",
              value: "$14,500",
            },
          ],
          footnote:
            "Illustrative only. Actual incentives vary by community, phase, and lender. Use the savings calculator for a personalized estimate.",
        },
        {
          kind: "faq_ref",
          heading: "Common questions about new-construction purchases",
          entryIds: [
            "how-does-buyer-v2-save-me-money",
            "can-i-tour-homes-with-buyer-v2",
            "how-does-the-buyer-credit-work-at-closing",
          ],
        },
        {
          kind: "cta",
          variant: "savings_calculator",
          headline: "Estimate your savings on a Lennar home",
        },
      ],
      lastUpdated: "2026-04-12",
      visibility: "public",
    },
    {
      slug: "dr-horton",
      displayName: "D.R. Horton",
      tagline: "America's largest homebuilder, with strong FL volume.",
      pageTitle: "D.R. Horton New Construction in Florida",
      summary:
        "A guide to buying a D.R. Horton new-construction home in Florida with buyer-v2 — how builder incentives interact with buyer representation and how to capture a buyer-v2 rebate alongside any D.R. Horton promotion.",
      heroHeadline: "D.R. Horton new construction in Florida",
      heroSubheadline:
        "AI pricing, licensed broker representation, and a rebate at closing — even on a D.R. Horton contract.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "D.R. Horton sells a large share of Florida's entry-level new-construction inventory. buyer-v2 can represent you on a D.R. Horton purchase and rebate a portion of the buyer-agent commission at closing. The tricky part on any new-construction purchase is understanding which builder incentives are stackable — buyer-v2's analysis flags that upfront so you see the real, after-incentive delta.",
        },
        {
          kind: "builder_facts",
          facts: [
            { label: "Founded", value: "1978" },
            { label: "FL communities", value: "150+" },
            { label: "Price point", value: "Entry-level to mid-tier" },
            { label: "Typical delivery", value: "3–9 months" },
          ],
        },
        {
          kind: "faq_ref",
          heading: "D.R. Horton + buyer-v2 FAQs",
          entryIds: ["what-is-buyer-v2", "how-does-the-buyer-credit-work-at-closing"],
        },
        {
          kind: "cta",
          variant: "paste_link",
          headline: "Paste a D.R. Horton listing link",
          body: "Got a specific home in mind? Paste the listing URL and we'll run our analysis end-to-end.",
        },
      ],
      lastUpdated: "2026-04-12",
      visibility: "public",
    },
    {
      slug: "pulte-draft",
      displayName: "Pulte Homes",
      tagline: "Draft — not yet published.",
      pageTitle: "Pulte Homes New Construction in Florida",
      summary:
        "Draft builder profile held in the catalog so the visibility filter is exercised on real data. Marketing is still finalizing the copy and legal review before this flips to public.",
      heroHeadline: "Pulte new construction",
      heroSubheadline: "Draft — not ready for public render yet.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "Internal draft placeholder for Pulte Homes.",
        },
      ],
      lastUpdated: "2026-04-12",
      visibility: "draft",
    },
  ],
  communities: [
    {
      slug: "villages-at-tradition",
      displayName: "Villages at Tradition",
      builderSlug: "lennar",
      cityName: "Port St. Lucie",
      state: "FL",
      pageTitle: "Villages at Tradition — Lennar (Port St. Lucie)",
      summary:
        "Illustrative new-construction community from Lennar in Port St. Lucie. Shows how buyer-v2's analysis and rebate stack with builder incentives across phases of a master-planned community.",
      heroHeadline: "Villages at Tradition — Lennar in Port St. Lucie",
      heroSubheadline:
        "A master-planned community with multiple phases, builder incentives, and buyer-v2 representation at closing.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "Villages at Tradition is an illustrative new-construction community used to demonstrate how buyer-v2 represents buyers on phased master-planned developments. The key thing to understand about multi-phase communities is that builder incentives often change between phases — buyer-v2's analysis locks in the incentive structure at the moment you sign so the quoted savings don't evaporate at closing.",
        },
        {
          kind: "urgency",
          headline: "Phase III closings in Q3 2026",
          body: "Lennar is releasing Phase III homes now with delivery targeted for Q3 2026. Early-phase contracts typically carry the deepest builder rate buydowns.",
          deadline: "2026-09-30",
          scarcitySignal: "Illustrative — actual inventory varies",
        },
        {
          kind: "phase_list",
          heading: "Community phases",
          phases: [
            {
              label: "Phase I",
              status: "sold_out",
              description:
                "Original release. All homes closed in 2025.",
            },
            {
              label: "Phase II",
              status: "closing_soon",
              description:
                "Inventory nearly exhausted — remaining homes expected to contract by end of Q2 2026.",
            },
            {
              label: "Phase III",
              status: "available",
              description:
                "Currently the main release. Best availability and strongest builder incentives.",
            },
            {
              label: "Phase IV",
              status: "coming_soon",
              description:
                "Expected release late 2026 — pricing not yet set.",
            },
          ],
        },
        {
          kind: "savings_projection",
          headline: "Illustrative savings on a Phase III home",
          rows: [
            { label: "List price", value: "$525,000" },
            {
              label: "Lennar rate buydown",
              value: "-$10,000",
              note: "Builder incentive",
            },
            {
              label: "buyer-v2 commission rebate",
              value: "-$4,725",
              note: "~0.9% of purchase price",
            },
            { label: "Estimated net cost", value: "$510,275" },
          ],
          footnote:
            "Illustrative only. Incentives vary by community, phase, and lender. Use the savings calculator for a personalized estimate.",
        },
        {
          kind: "faq_ref",
          heading: "Questions from Villages at Tradition buyers",
          entryIds: ["how-does-buyer-v2-save-me-money", "is-the-rebate-taxable"],
        },
        {
          kind: "cta",
          variant: "savings_calculator",
        },
      ],
      lastUpdated: "2026-04-12",
      visibility: "public",
    },
    {
      slug: "heron-preserve",
      displayName: "Heron Preserve",
      builderSlug: "dr-horton",
      cityName: "Ocala",
      state: "FL",
      pageTitle: "Heron Preserve — D.R. Horton (Ocala)",
      summary:
        "Illustrative D.R. Horton community in Ocala. Shows how buyer-v2 handles entry-level new construction where the builder's default incentive is a rate buydown rather than a price reduction.",
      heroHeadline: "Heron Preserve — D.R. Horton in Ocala",
      heroSubheadline:
        "Entry-level new-construction community with paired AI pricing analysis and buyer-v2 rebate.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "Heron Preserve is an illustrative entry-level new-construction community in Ocala. buyer-v2's analysis focuses on whether the D.R. Horton default incentive (typically a rate buydown from their preferred lender) is actually the best deal available, or whether paying a slightly higher rate in exchange for a price concession leaves the buyer better off over the life of the loan.",
        },
        {
          kind: "urgency",
          headline: "Limited spec-home inventory",
          body: "Spec homes (already under construction with closing timelines under 60 days) typically carry stronger builder incentives than to-be-built contracts.",
          scarcitySignal: "Illustrative — actual inventory varies by release",
        },
        {
          kind: "builder_facts",
          facts: [
            { label: "Price from", value: "$325,000" },
            { label: "Lot sizes", value: "50' – 60'" },
            { label: "HOA", value: "$85/mo" },
            { label: "Schools", value: "Marion County" },
          ],
        },
        {
          kind: "faq_ref",
          heading: "Heron Preserve buyer questions",
          entryIds: ["how-does-buyer-v2-work", "how-does-the-buyer-credit-work-at-closing"],
        },
        {
          kind: "cta",
          variant: "paste_link",
          headline: "Paste a Heron Preserve listing",
        },
      ],
      lastUpdated: "2026-04-12",
      visibility: "public",
    },
    {
      slug: "silver-oak-reserve",
      displayName: "Silver Oak Reserve",
      builderSlug: "lennar",
      cityName: "Orlando",
      state: "FL",
      pageTitle: "Silver Oak Reserve — Lennar (Orlando)",
      summary:
        "Illustrative Lennar community in Orlando showing how buyer-v2 handles mid-tier move-up new construction with the combined buyer rebate and preferred lender incentive stack.",
      heroHeadline: "Silver Oak Reserve — Lennar in Orlando",
      heroSubheadline:
        "A mid-tier Lennar community in Orlando with buyer-v2 representation and a commission rebate at closing.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "Silver Oak Reserve is an illustrative mid-tier Lennar community in Orlando. The move-up price point (typically $450k–$600k) is where builder incentives tend to be most negotiable — buyer-v2's analysis surfaces the specific levers (closing cost credit vs rate buydown vs price concession) that move the needle most for your specific financing profile.",
        },
        {
          kind: "savings_projection",
          headline: "Illustrative savings breakdown",
          rows: [
            { label: "List price", value: "$489,900" },
            {
              label: "Lennar closing cost credit",
              value: "-$8,000",
            },
            {
              label: "buyer-v2 commission rebate",
              value: "-$4,400",
            },
            { label: "Estimated net cost", value: "$477,500" },
          ],
          footnote:
            "Illustrative only. See the savings calculator for a tailored estimate.",
        },
        {
          kind: "faq_ref",
          heading: "Silver Oak Reserve buyer questions",
          entryIds: ["can-i-still-talk-to-a-real-person", "is-the-rebate-taxable"],
        },
        {
          kind: "cta",
          variant: "custom",
          headline: "Ready to tour Silver Oak Reserve?",
          body: "Start with the savings calculator or paste any Silver Oak Reserve listing.",
          href: "/savings",
          label: "Open savings calculator",
        },
      ],
      lastUpdated: "2026-04-12",
      visibility: "public",
    },
    {
      slug: "cypress-bend-draft",
      displayName: "Cypress Bend",
      builderSlug: "lennar",
      cityName: "Naples",
      state: "FL",
      pageTitle: "Cypress Bend — Lennar (Naples)",
      summary:
        "Draft community page held in the catalog so the visibility filter is exercised on real data. Marketing and legal are finalizing copy before this record flips to public status.",
      heroHeadline: "Cypress Bend — draft",
      heroSubheadline: "Not ready for public render yet.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "Internal draft placeholder for Cypress Bend.",
        },
      ],
      lastUpdated: "2026-04-12",
      visibility: "draft",
    },
  ],
};
