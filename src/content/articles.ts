import type { Article } from "@/lib/articles/types";

/**
 * Seed article catalog for the public blog (KIN-812).
 *
 * These are real buyer-v2 editorial pieces, not placeholder copy —
 * they exercise every block type so any regression in the renderer
 * surfaces immediately. Add new articles here; the route + index
 * page will pick them up automatically.
 */

export const ARTICLES: Article[] = [
  {
    id: "paste-a-link-walkthrough",
    slug: "paste-a-link-walkthrough",
    title: "How the paste-a-link flow actually works",
    summary:
      "A step-by-step walkthrough of what happens when you drop a Zillow URL into buyer-v2 — from fetching the listing to running the AI pricing analysis.",
    category: "buying_guide",
    author: {
      name: "The buyer-v2 team",
      bio: "Licensed Florida brokerage, AI-native, buyer-side only.",
    },
    publishedAt: "2026-04-05",
    updatedAt: "2026-04-05",
    readingMinutes: 5,
    visibility: "public",
    body: [
      {
        kind: "paragraph",
        lede: true,
        text:
          "Pasting a listing link is the single most productive thing you can do as a Florida homebuyer. In under ten seconds buyer-v2 turns a URL into a full deal room — pricing, comps, leverage, and a deal score — without you creating an account first. Here's what actually happens under the hood.",
      },
      {
        kind: "heading",
        level: 2,
        text: "1. We normalize the URL",
      },
      {
        kind: "paragraph",
        text:
          "Different portals encode the same listing differently. We detect the portal (Zillow, Redfin, Realtor.com), extract the listing identifier, and look up the canonical property record in our own graph. If we've seen this property before from a different portal, we merge them into one record rather than creating duplicates.",
      },
      {
        kind: "heading",
        level: 2,
        text: "2. We fetch and parse the listing",
      },
      {
        kind: "paragraph",
        text:
          "A headless fetch pulls the listing's HTML and structured data. We read the address, beds/baths, square footage, price, description, photos, and any listing-agent notes. Portals sometimes hide fields behind login walls — we handle the common cases gracefully and fall back to the fields that are always available.",
      },
      {
        kind: "callout",
        variant: "info",
        label: "About our data",
        body:
          "We never rely on a single source. If the Zillow listing and the Redfin listing for the same address disagree on list price, we show both figures and flag the discrepancy so you can make your own call.",
      },
      {
        kind: "heading",
        level: 2,
        text: "3. We run the AI analysis engines",
      },
      {
        kind: "paragraph",
        text:
          "The real magic happens in the engines. Each one takes the normalized property record and produces a structured output with confidence, citations, and a review state.",
      },
      {
        kind: "list",
        style: "bulleted",
        items: [
          "Pricing engine — fair market value with a confidence interval and the comps it used.",
          "Comps engine — up to twelve nearby recent sales, scored for similarity.",
          "Leverage engine — how much negotiating room you have based on days on market, price drops, and local absorption rates.",
          "Competitiveness engine — a single 0–10 score that rolls up the rest of the analysis.",
        ],
      },
      {
        kind: "paragraph",
        text:
          "Every AI output carries its citations with it. When the pricing engine says the fair market value is $472,000, you can click through to see exactly which comps it used and how similar they were.",
      },
      {
        kind: "savings_calculator_cta",
      },
      {
        kind: "heading",
        level: 2,
        text: "4. We hand the deal room to you",
      },
      {
        kind: "paragraph",
        text:
          "Everything we computed lives in a semi-public deal room — anyone with the link can see the AI analysis and a teaser of the property data, but the full details (tour scheduling, offer templates, broker chat) require you to register. It's the fastest way to get a real buyer-v2 analysis without committing to anything.",
      },
      {
        kind: "quote",
        text:
          "I pasted a Zillow link on my phone during lunch and had a full deal room open by the time I got back to my desk. I didn't sign up until the next day, after I'd already seen the analysis.",
        attribution: "— Maria G., first-time buyer, Tampa",
      },
      {
        kind: "paste_link_cta",
      },
    ],
  },
  {
    id: "florida-closing-costs-2026",
    slug: "florida-closing-costs-2026",
    title: "What Florida closing costs actually look like in 2026",
    summary:
      "A plain-language breakdown of the fees you'll see on your Florida closing disclosure — lender, title, state, and brokerage — plus what buyer-v2 credits back.",
    category: "closing_process",
    author: {
      name: "The buyer-v2 team",
      bio: "Licensed Florida brokerage, AI-native, buyer-side only.",
    },
    publishedAt: "2026-04-02",
    updatedAt: "2026-04-02",
    readingMinutes: 6,
    visibility: "public",
    body: [
      {
        kind: "paragraph",
        lede: true,
        text:
          "Closing in Florida is mostly predictable — the same line items show up on almost every disclosure, with small variations by county and lender. Here's what to expect on a typical $500,000 purchase, with buyer-v2's commission rebate applied.",
      },
      {
        kind: "heading",
        level: 2,
        text: "Lender fees",
      },
      {
        kind: "paragraph",
        text:
          "Origination, credit report, appraisal, flood certification, and any points you've negotiated. These vary the most between lenders — shop around, and don't be afraid to ask for itemized quotes before you lock.",
      },
      {
        kind: "heading",
        level: 2,
        text: "Title and escrow",
      },
      {
        kind: "paragraph",
        text:
          "In Florida the seller typically pays the owner's title policy in Miami-Dade and Broward, and the buyer pays it in most other counties. The lender's title policy is always the buyer's cost. Title search, closing fee, and state documentary stamps round out the section.",
      },
      {
        kind: "callout",
        variant: "emphasis",
        label: "Quick tip",
        body:
          "Florida's documentary stamp tax is $0.35 per $100 of loan amount for the mortgage, and $0.70 per $100 of purchase price for the deed (paid by the seller in most counties). On a $500k purchase you're looking at ~$1,750 in stamps on the mortgage side.",
      },
      {
        kind: "heading",
        level: 2,
        text: "State and local",
      },
      {
        kind: "list",
        style: "bulleted",
        items: [
          "Documentary stamps on the deed (seller pays in most counties)",
          "Intangible tax on the mortgage (0.2%)",
          "Recording fees for the deed and mortgage",
          "Municipal and county taxes depending on your closing date",
        ],
      },
      {
        kind: "heading",
        level: 2,
        text: "Brokerage and commission",
      },
      {
        kind: "paragraph",
        text:
          "This is where buyer-v2 shows up. The total commission is paid by the seller out of proceeds — historically around 6% of the purchase price, split between the listing side and the buyer's side. Post-2024 NAR settlement, the buyer-agent portion is explicitly negotiated.",
      },
      {
        kind: "paragraph",
        text:
          "When you engage buyer-v2, we rebate a portion of the buyer-agent commission back to you at closing. On our default assumptions that's a buyer credit of about $4,950 on a $500k purchase — reducing the cash you need to bring to the table.",
      },
      {
        kind: "savings_calculator_cta",
        headline: "Run the numbers on your own purchase",
        body:
          "Adjust the price, commission assumptions, and rebate percent to match your specific deal.",
      },
      {
        kind: "heading",
        level: 2,
        text: "What you actually bring to closing",
      },
      {
        kind: "paragraph",
        text:
          "Total cash to close = down payment + lender fees + title and escrow + prepaid property tax and insurance − seller credits − buyer-v2 rebate. Your closing disclosure shows the full breakdown three business days before closing; read it carefully and flag anything that doesn't match your pre-approval estimates.",
      },
      {
        kind: "callout",
        variant: "strong",
        label: "Not legal or tax advice",
        body:
          "This article is an informational overview. Specific numbers depend on your lender, county, and closing company. Your buyer-v2 broker and closing agent will review every line item with you before you sign.",
      },
    ],
  },
  {
    id: "internal-draft-example",
    slug: "internal-draft-example",
    title: "Draft: upcoming article on negotiation strategy",
    summary:
      "Internal draft — not yet published. Kept in the source file so the visibility filter is exercised in production.",
    category: "buying_guide",
    author: { name: "Editorial" },
    publishedAt: "2026-04-10",
    updatedAt: "2026-04-10",
    readingMinutes: 1,
    visibility: "internal",
    body: [
      {
        kind: "paragraph",
        text: "Internal draft placeholder.",
      },
    ],
  },
];
