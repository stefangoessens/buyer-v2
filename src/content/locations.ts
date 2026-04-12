import type { LocationCatalog } from "@/lib/locations/types";

/**
 * City and community landing page catalog for buyer-v2 (KIN-818).
 *
 * Florida-first: we ship with three flagship cities (Miami, Tampa,
 * Orlando) plus four communities at launch. Every record is typed
 * and goes through `validateCatalog` in the test suite — dropping
 * to draft should be a one-line change, not a code refactor.
 *
 * Editing this file IS the CMS for programmatic SEO pages. All copy
 * is reviewed by marketing and legal before a record flips to public.
 */

export const LOCATION_CATALOG: LocationCatalog = {
  cities: [
    {
      slug: "miami",
      displayName: "Miami",
      state: "FL",
      pageTitle: "Buying a Home in Miami",
      summary:
        "Everything you need to know about buying a home in Miami — market snapshots, brokerage services, neighborhood breakdowns, and how buyer-v2's commission rebate works for Miami buyers.",
      heroHeadline: "Your AI-native buyer brokerage for Miami",
      heroSubheadline:
        "Paste any Miami listing link to get instant AI analysis, fair pricing, and a licensed Florida broker negotiating on your behalf.",
      blocks: [
        {
          kind: "hero_paragraph",
          text:
            "Miami is one of the most competitive real estate markets in Florida. Listings move fast, prices vary wildly by neighborhood, and the buyer-agent commission is fully negotiable post-2024 NAR settlement. buyer-v2 gives Miami buyers the same AI-powered analysis our brokerage uses internally — for free — and rebates a portion of the commission at closing.",
        },
        {
          kind: "key_stats",
          stats: [
            {
              label: "Median list price",
              value: "$725k",
              note: "Miami-Dade residential, Q1 2026",
            },
            {
              label: "Avg. days on market",
              value: "42",
              note: "Illustrative — refresh from live MLS feed",
            },
            {
              label: "Typical buyer credit",
              value: "$6,200",
              note: "Based on buyer-v2 default assumptions at $725k",
            },
            {
              label: "Neighborhoods covered",
              value: "30+",
              note: "Deal room available city-wide",
            },
          ],
        },
        {
          kind: "market_snapshot",
          heading: "Miami market at a glance",
          body:
            "Miami's buyer-side negotiation leverage is at its highest in three years, with days on market up and price cuts increasingly common on listings that don't get offers within two weeks. Buyers who paste a link through buyer-v2 get a leverage score that quantifies how much room they have to negotiate on each listing.",
          source: "Illustrative — refresh from Florida Realtors live feed",
          refreshedAt: "2026-04-01",
        },
        {
          kind: "neighborhood_list",
          heading: "Miami neighborhoods",
          communitySlugs: ["brickell", "coconut-grove"],
        },
        {
          kind: "faq_ref",
          heading: "Common questions from Miami buyers",
          entryIds: [
            "what_is_buyer_v2",
            "how_much_does_it_cost",
            "who_shows_me_homes",
          ],
        },
        {
          kind: "testimonial_ref",
          heading: "Illustrative case studies",
          caseStudyIds: ["cs_miami_relocation"],
        },
        {
          kind: "cta",
          variant: "paste_link",
          headline: "Start with a Miami listing link",
          body: "Paste any Zillow, Redfin, or Realtor.com URL to get your free analysis.",
        },
      ],
      communitySlugs: ["brickell", "coconut-grove"],
      lastUpdated: "2026-04-01",
      visibility: "public",
    },
    {
      slug: "tampa",
      displayName: "Tampa",
      state: "FL",
      pageTitle: "Buying a Home in Tampa",
      summary:
        "A plain-language guide to buying a home in Tampa — neighborhood snapshots, closing costs, buyer representation, and how buyer-v2 rebates a portion of the commission back at closing.",
      heroHeadline: "Your AI-native buyer brokerage for Tampa",
      heroSubheadline:
        "Paste any Tampa listing and get instant pricing, comps, and a licensed broker ready to negotiate.",
      blocks: [
        {
          kind: "hero_paragraph",
          text:
            "Tampa has been one of Florida's most active markets for first-time buyers. The combination of newer inventory, competitive list prices, and accessible financing makes it a natural fit for buyers who want to use buyer-v2's AI analysis from their first paste-a-link forward.",
        },
        {
          kind: "key_stats",
          stats: [
            {
              label: "Median list price",
              value: "$485k",
              note: "Tampa Bay residential, Q1 2026",
            },
            {
              label: "Avg. days on market",
              value: "36",
              note: "Illustrative baseline",
            },
            {
              label: "Typical buyer credit",
              value: "$4,100",
              note: "Based on buyer-v2 default assumptions at $485k",
            },
          ],
        },
        {
          kind: "neighborhood_list",
          heading: "Tampa neighborhoods",
          communitySlugs: ["hyde-park", "seminole-heights"],
        },
        {
          kind: "faq_ref",
          heading: "Common questions from Tampa buyers",
          entryIds: [
            "paste_link_flow",
            "how_is_the_rebate_calculated",
            "what_happens_at_closing",
          ],
        },
        {
          kind: "testimonial_ref",
          heading: "Illustrative case studies",
          caseStudyIds: ["cs_tampa_first_home"],
        },
        {
          kind: "cta",
          variant: "savings_calculator",
        },
      ],
      communitySlugs: ["hyde-park", "seminole-heights"],
      lastUpdated: "2026-04-01",
      visibility: "public",
    },
    {
      slug: "orlando",
      displayName: "Orlando",
      state: "FL",
      pageTitle: "Buying a Home in Orlando",
      summary:
        "Your guide to buying a home in Orlando — neighborhood picks, new-construction trends, buyer representation, and how buyer-v2's buyer credit translates into real cash back at closing.",
      heroHeadline: "Your AI-native buyer brokerage for Orlando",
      heroSubheadline:
        "Paste any Orlando listing to get AI pricing, comps, and a licensed broker on your side.",
      blocks: [
        {
          kind: "hero_paragraph",
          text:
            "Orlando has an unusually high share of new-construction listings compared to other Florida metros, which changes the negotiation math. buyer-v2's leverage engine flags new-construction listings automatically so you can see where the real room is — builder incentives, rate buydowns, and commission structure are all different from resale.",
        },
        {
          kind: "key_stats",
          stats: [
            {
              label: "Median list price",
              value: "$415k",
              note: "Orlando metro, Q1 2026",
            },
            {
              label: "Avg. days on market",
              value: "31",
              note: "Illustrative baseline",
            },
          ],
        },
        {
          kind: "faq_ref",
          heading: "Common questions from Orlando buyers",
          entryIds: [
            "what_is_buyer_v2",
            "is_buyer_v2_a_broker",
            "do_you_support_mls_direct",
          ],
        },
        {
          kind: "testimonial_ref",
          heading: "Illustrative case studies",
          caseStudyIds: ["cs_orlando_townhome"],
        },
        {
          kind: "cta",
          variant: "paste_link",
          headline: "Start with an Orlando listing",
        },
      ],
      lastUpdated: "2026-04-01",
      visibility: "public",
    },
    {
      slug: "jacksonville-draft",
      displayName: "Jacksonville",
      state: "FL",
      pageTitle: "Buying a Home in Jacksonville",
      summary:
        "Draft — not yet published. Held in the content catalog so the visibility filter is exercised on real data.",
      heroHeadline: "Draft Jacksonville page",
      heroSubheadline: "Not ready for public render yet.",
      blocks: [
        {
          kind: "hero_paragraph",
          text: "Internal draft placeholder for Jacksonville.",
        },
      ],
      lastUpdated: "2026-04-01",
      visibility: "draft",
    },
  ],
  communities: [
    {
      slug: "brickell",
      displayName: "Brickell",
      citySlug: "miami",
      pageTitle: "Buying a Home in Brickell",
      summary:
        "Brickell is Miami's financial district — high-rise condos, walkable urban core, rapid appreciation. Here's what Brickell buyers should know before they paste their first link.",
      heroHeadline: "buyer-v2 for Brickell buyers",
      heroSubheadline:
        "Paste any Brickell condo listing and see instant pricing, comps, and a licensed broker ready to negotiate.",
      blocks: [
        {
          kind: "hero_paragraph",
          text:
            "Brickell is one of Miami's most competitive micro-markets. Listings move quickly, comps are hyper-local (one building at a time), and the leverage signals are different from single-family neighborhoods. buyer-v2's AI analysis pulls nearby recent sales from the same building when possible, so your comparable set is genuinely comparable.",
        },
        {
          kind: "market_snapshot",
          heading: "Brickell market snapshot",
          body:
            "Brickell inventory is concentrated in 2–3 year delivery cycles of new towers, and buyer-side leverage depends heavily on which tower and which floor. Historic data shows that listings sitting 45+ days without a price change tend to negotiate down 3–5% on average.",
          source: "Illustrative baseline — refresh from live MLS feed",
          refreshedAt: "2026-04-01",
        },
        {
          kind: "faq_ref",
          heading: "Questions from Brickell buyers",
          entryIds: ["how_much_does_it_cost", "how_is_the_rebate_calculated"],
        },
        {
          kind: "cta",
          variant: "paste_link",
          headline: "Paste a Brickell listing",
        },
      ],
      lastUpdated: "2026-04-01",
      visibility: "public",
    },
    {
      slug: "coconut-grove",
      displayName: "Coconut Grove",
      citySlug: "miami",
      pageTitle: "Buying a Home in Coconut Grove",
      summary:
        "Coconut Grove mixes historic single-family homes with new-build townhomes. This guide covers neighborhood specifics and how buyer-v2 helps Coconut Grove buyers negotiate.",
      heroHeadline: "buyer-v2 for Coconut Grove",
      heroSubheadline:
        "Paste any listing in the Grove to see pricing, comps, and leverage signals for the neighborhood.",
      blocks: [
        {
          kind: "hero_paragraph",
          text:
            "Coconut Grove has one of Miami's most diverse housing stocks. Historic homes on oversized lots sit a few blocks from new-build townhouses, and buyer negotiation leverage varies dramatically between them. buyer-v2's comps engine filters for like-for-like (era, lot size, waterfront proximity) so your analysis is fair.",
        },
        {
          kind: "faq_ref",
          heading: "Questions from Coconut Grove buyers",
          entryIds: ["what_is_buyer_v2", "what_about_ai_decisions"],
        },
        {
          kind: "cta",
          variant: "savings_calculator",
        },
      ],
      lastUpdated: "2026-04-01",
      visibility: "public",
    },
    {
      slug: "hyde-park",
      displayName: "Hyde Park",
      citySlug: "tampa",
      pageTitle: "Buying a Home in Hyde Park, Tampa",
      summary:
        "Hyde Park is Tampa's historic walkable core — bungalows, restaurants, and premium walkability. Here's what buyer-v2 can do for Hyde Park buyers specifically.",
      heroHeadline: "buyer-v2 for Hyde Park, Tampa",
      heroSubheadline:
        "Historic Tampa living with AI-powered deal analysis from the moment you paste a link.",
      blocks: [
        {
          kind: "hero_paragraph",
          text:
            "Hyde Park commands a premium for walkability and historic character. buyer-v2's pricing engine treats pre-war bungalows as their own comp set so you're not comparing a 1924 cottage against a modern infill build a block away.",
        },
        {
          kind: "faq_ref",
          heading: "Questions from Hyde Park buyers",
          entryIds: ["how_much_does_it_cost", "who_shows_me_homes"],
        },
        {
          kind: "cta",
          variant: "paste_link",
        },
      ],
      lastUpdated: "2026-04-01",
      visibility: "public",
    },
    {
      slug: "seminole-heights",
      displayName: "Seminole Heights",
      citySlug: "tampa",
      pageTitle: "Buying a Home in Seminole Heights, Tampa",
      summary:
        "Seminole Heights has been one of Tampa's hottest emerging neighborhoods. Here's what matters for Seminole Heights buyers and how buyer-v2's analysis adapts.",
      heroHeadline: "buyer-v2 for Seminole Heights",
      heroSubheadline:
        "Tampa's most-watched emerging neighborhood with AI pricing, comps, and licensed broker representation.",
      blocks: [
        {
          kind: "hero_paragraph",
          text:
            "Seminole Heights has seen strong price appreciation over the past five years, and its buyer profile is different from the rest of Tampa — younger first-time buyers willing to take on renovation projects. buyer-v2's AI analysis surfaces the condition proxies (days on market, price changes, description keywords) that matter for this buyer profile.",
        },
        {
          kind: "faq_ref",
          heading: "Questions from Seminole Heights buyers",
          entryIds: ["paste_link_flow", "is_my_data_private"],
        },
        {
          kind: "cta",
          variant: "custom",
          headline: "Ready to find your Seminole Heights home?",
          body: "Start with a savings calculation or paste a listing link.",
          href: "/savings",
          label: "Open savings calculator",
        },
      ],
      lastUpdated: "2026-04-01",
      visibility: "public",
    },
  ],
};
