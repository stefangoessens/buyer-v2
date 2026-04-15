/**
 * Florida buyer guides catalog (KIN-1090).
 *
 * Long-form educational content surfaced at `/guides` and
 * `/guides/[slug]`. These are legal-adjacent articles (homestead
 * exemption, buyer rebate mechanics) — every guide is written to
 * survive skim-review by a licensed FL broker and a general-purpose
 * tax professional without making any specific promise to a specific
 * buyer.
 *
 * Content rules:
 *   - Every guide body opens with a "This is educational content,
 *     not legal or tax advice" callout.
 *   - Numeric claims (percentages, dollar figures, payouts) are
 *     written as illustrative examples and flagged as such in-line.
 *   - Statutory references are limited to well-established FL facts
 *     (homestead basics, March 1 filing deadline, Save Our Homes 3%
 *     cap, FREC Rule 61J2-10.028).
 *   - The rebate guide uses conditional language throughout
 *     ("typically", "may", "subject to broker approval") and never
 *     promises a specific rebate to any specific buyer.
 *   - Both guides close with "verify with a licensed FL broker and
 *     a tax professional".
 *
 * Selectors (`publicGuides`, `filterPublishableGuides`,
 * `getGuideBySlug`) are the canonical read APIs consumed by the
 * sitemap builder, the `/guides` index, and the `/guides/[slug]`
 * detail page. Callers should never reach into `GUIDES` directly.
 */

export interface GuideArticle {
  slug: string;
  title: string;
  summary: string;
  category:
    | "homestead"
    | "rebate"
    | "flood"
    | "hurricane"
    | "first_time_buyer"
    | "closing_costs"
    | "how_to_buy";
  publishedAt: string;
  updatedAt: string;
  readingTimeMinutes: number;
  visibility: "draft" | "public";
  brokerReviewed: boolean;
  heroEyebrow: string;
  atAGlance: readonly string[];
  tableOfContents: readonly { id: string; label: string }[];
  body: readonly GuideSection[];
  footnotes?: readonly string[];
  ctaHeadline: string;
  ctaBody: string;
  ctaButtonLabel: string;
}

export type GuideSection =
  | { kind: "heading"; id: string; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: readonly string[] }
  | { kind: "callout"; tone: "info" | "warning"; title: string; body: string }
  | { kind: "steps"; items: readonly { title: string; body: string }[] };

export const GUIDES: GuideArticle[] = [
  // ─── Guide 1: Florida Homestead Exemption ────────────────────────────
  {
    slug: "florida-homestead-exemption",
    title: "Florida Homestead Exemption: A First-Time Owner's Guide",
    summary:
      "What the Florida homestead exemption actually does to your tax bill, who qualifies, how to file before the March 1 deadline, and the mistakes first-time owners make most often.",
    category: "homestead",
    publishedAt: "2026-04-15",
    updatedAt: "2026-04-15",
    readingTimeMinutes: 9,
    visibility: "public",
    brokerReviewed: false,
    heroEyebrow: "Florida buyer guide",
    atAGlance: [
      "The Florida homestead exemption can reduce the taxable value of your primary residence by up to $50,000 (with the second $25,000 layer applying only to non-school property taxes).",
      "The filing deadline is March 1 of the year you want the exemption to apply, and you must have owned and occupied the property as your permanent residence as of January 1 of that year.",
      "Once granted, Save Our Homes caps the annual increase in your assessed value at 3% or the change in the Consumer Price Index — whichever is lower.",
      "You file with your county property appraiser, not the state — every Florida county runs its own homestead application.",
      "Florida residents can only claim one homestead exemption in Florida at a time; snowbirds and part-time residents need to pick one primary residence and commit to it on paper.",
    ],
    tableOfContents: [
      { id: "what-is-it", label: "What the homestead exemption is" },
      { id: "who-qualifies", label: "Who qualifies" },
      { id: "how-much-you-save", label: "How much you actually save" },
      { id: "how-to-file", label: "How to file — step by step" },
      { id: "missed-deadline", label: "What happens if you miss the deadline" },
      { id: "common-mistakes", label: "Common mistakes to avoid" },
    ],
    body: [
      {
        kind: "callout",
        tone: "info",
        title: "Educational content only",
        body: "This guide is educational content, not legal or tax advice. Homestead rules have nuance that depends on your specific situation, your county, and how your title is held. Before filing, verify the current year's rules with your county property appraiser and, when the stakes are meaningful, with a licensed Florida attorney or tax professional.",
      },

      {
        kind: "heading",
        id: "what-is-it",
        text: "What the homestead exemption is",
      },
      {
        kind: "paragraph",
        text: "The Florida homestead exemption is a constitutional tax break for homeowners who make a Florida property their permanent residence. In plain terms, it lowers the taxable value of your home — the number the county uses to calculate your property tax bill — so you pay less each year. It is one of the strongest homeowner-side benefits in the United States, and it is the single biggest reason long-time Florida owners sometimes pay dramatically less in property taxes than their neighbors on the same street.",
      },
      {
        kind: "paragraph",
        text: "The exemption is authorized in Article VII, Section 6 of the Florida Constitution and is administered at the county level. That means the underlying rules are statewide, but the paperwork, portal, and support staff you actually deal with are county-specific. If you buy a home in Miami-Dade County, you file with the Miami-Dade Property Appraiser. If you buy in Hillsborough, you file with the Hillsborough County Property Appraiser. Same exemption, different front doors.",
      },
      {
        kind: "paragraph",
        text: "The exemption has two layers that stack, plus a separate protective mechanism called Save Our Homes. The two layers together can reduce the taxable value of a qualifying home by up to $50,000 — though, as explained below, the second $25,000 layer applies only to the non-school portion of your property taxes. On top of that, once the exemption is in place, Save Our Homes limits how fast your assessed value can climb each year, which matters far more than most first-time owners realize.",
      },

      {
        kind: "heading",
        id: "who-qualifies",
        text: "Who qualifies",
      },
      {
        kind: "paragraph",
        text: "To qualify for the homestead exemption on a given tax year, you generally need to satisfy three conditions as of January 1 of that year: you must own the property, you must occupy it as your permanent residence, and you must not be claiming a similar residency-based tax benefit on another property anywhere. Florida takes all three of those requirements seriously — especially the second and third — and counties have become noticeably more aggressive in recent years about investigating homestead fraud.",
      },
      {
        kind: "list",
        items: [
          "Ownership: your name (or the name of a qualifying trust or life-estate holder) must be on the recorded deed as of January 1. If you close on January 2, you have to wait until the next tax year.",
          "Permanent residence: the home must be your primary, permanent residence — not a vacation home, not an investment property, not the place you spend four months a year.",
          "No competing residency claim: you cannot claim a homestead exemption in Florida while also claiming a residency-based property tax break in another state, and you cannot claim homestead on two Florida properties at once.",
          "Permanent residency indicators: the county can look at your voter registration, driver's license address, vehicle registration, where your children attend school, where you file your federal tax return, and how long you are physically present at the property over the course of the year.",
        ],
      },
      {
        kind: "paragraph",
        text: "Snowbirds and part-time Floridians deserve a special note here. If you spend part of the year in Florida and part of the year in New York, New Jersey, Illinois, or any other state that offers a residency-based property tax break, you cannot have it both ways. Pick one home as your primary residence, update your documents to match, and commit. If the county discovers you were claiming homestead in Florida while also claiming a primary-residence benefit elsewhere, the penalties are steep — back taxes, a 50% penalty, and interest — and the lookback period is long.",
      },

      {
        kind: "heading",
        id: "how-much-you-save",
        text: "How much you actually save",
      },
      {
        kind: "paragraph",
        text: "The savings come from two separate mechanisms, and it is worth understanding them individually because they work on different slices of your tax bill.",
      },
      {
        kind: "paragraph",
        text: "The first mechanism is the exemption itself. The baseline exemption reduces your home's assessed value by $25,000 for all property tax purposes. A second $25,000 layer reduces your assessed value by an additional $25,000 on the portion of assessed value between $50,000 and $75,000, but only for non-school taxes. The practical takeaway is that the full $50,000 combined exemption applies to most of your property tax bill, but your school-district taxes are still calculated against a higher base.",
      },
      {
        kind: "paragraph",
        text: "The second mechanism is Save Our Homes, which is a separate constitutional provision (Article VII, Section 4) that takes effect the year after your homestead exemption is granted. Save Our Homes caps the annual increase in your assessed value at 3% or the change in the Consumer Price Index, whichever is lower. In a fast-appreciating market — which Florida has had for much of the last decade — that cap can open up a very large gap between your market value and your assessed value over time, and that gap is where the long-term savings really come from.",
      },
      {
        kind: "callout",
        tone: "info",
        title: "Illustrative example — your numbers will vary",
        body: "Imagine a buyer closes on a $400,000 home on December 15 and files for homestead. The county grants the exemption for the following tax year. The first $25,000 comes off all property taxes. The second $25,000 layer comes off the non-school portion. Once the exemption is in place, Save Our Homes caps assessed-value growth. If the market rises 8% per year for five years, the market value of the home climbs significantly, but Save Our Homes holds the assessed value increase to roughly 3% per year — and the gap between market and assessed value widens meaningfully. These numbers are illustrative. Your county's millage rate, your school-district portion, and your actual assessed-value growth will produce different results.",
      },
      {
        kind: "paragraph",
        text: "There is one more detail worth flagging: Florida also has a portability provision that lets long-time owners carry some of their accumulated Save Our Homes benefit from an old homestead to a new homestead when they move within Florida. The rules are specific and the filing is separate, but if you are a repeat Florida buyer selling a long-held primary residence, do not assume your old benefit disappears at closing. Ask your county property appraiser about portability before you file on the new home.",
      },

      {
        kind: "heading",
        id: "how-to-file",
        text: "How to file — step by step",
      },
      {
        kind: "steps",
        items: [
          {
            title: "1. Confirm your closing date and ownership status.",
            body: "You must be on title as of January 1 of the tax year you want the exemption to apply. If you closed after January 1, you are filing for next year — not this year. Pull your recorded deed or settlement statement before you start the application so the exact name, vesting, and legal description match what the county has on file.",
          },
          {
            title: "2. Find your county property appraiser.",
            body: "Homestead applications are filed at the county level. Search for '[your county] property appraiser' and look for the official county government page, not a third-party aggregator. Every Florida county runs its own homestead portal, and most of them accept online filings. Some still accept paper applications in person or by mail if you prefer.",
          },
          {
            title: "3. Gather your supporting documents.",
            body: "You will typically need proof of ownership (the recorded deed or a closing statement), proof that the home is your permanent residence (a Florida driver's license or state ID showing the property address, voter registration at the address, and vehicle registration at the address are the most common), and your Social Security number. If you own the home in a trust, you may need a copy of the relevant trust pages. Non-citizen residents may need additional documentation.",
          },
          {
            title: "4. File on or before March 1.",
            body: "The statutory filing deadline is March 1 of the tax year you want the exemption to apply. Most counties encourage online filing as soon as possible after January 1 because it gives you time to correct any issues before the hard deadline. Do not wait until the last week of February if you can help it.",
          },
          {
            title: "5. Watch for confirmation and check your TRIM notice.",
            body: "After you file, the county will review your application and either approve it or request more information. In August, every Florida property owner receives a TRIM notice (the Truth in Millage notice). This is when you should check that your homestead exemption is reflected in the assessed-value calculation. If it is not, contact the property appraiser immediately — you do not have unlimited time to correct errors after the TRIM notice goes out.",
          },
        ],
      },

      {
        kind: "heading",
        id: "missed-deadline",
        text: "What happens if you miss the deadline",
      },
      {
        kind: "paragraph",
        text: "The March 1 deadline is firm in the sense that it is the statutory deadline, but Florida does provide a late-file relief mechanism. If you miss the deadline but still qualified as of January 1, you can generally file a late application and ask the county for relief. You will need to explain why the application is late, and the property appraiser has discretion to grant or deny relief depending on the circumstances. Approval is far from guaranteed, and the process is more friction than simply filing on time, so the right strategy is always to file early rather than to count on late-file relief.",
      },
      {
        kind: "paragraph",
        text: "Florida also offers additional exemptions that layer on top of the standard homestead: a senior exemption, a disability exemption, a widow/widower exemption, a deployed-service-member exemption, and a first-responder disability exemption. Some of these have their own eligibility rules and their own filing deadlines. If you are 65 or older, or if you have a service-connected disability, ask your county property appraiser about which additional exemptions you may qualify for when you file your standard homestead application — it is far easier to apply for everything you are entitled to at once.",
      },

      {
        kind: "heading",
        id: "common-mistakes",
        text: "Common mistakes to avoid",
      },
      {
        kind: "list",
        items: [
          "Waiting until February 28 to file. The county's system gets busy, questions take longer to resolve, and any missing document can push you past the deadline. File in January if at all possible.",
          "Assuming the exemption transfers automatically when you move. It does not. If you sell your old home and buy a new one, you have to file a new homestead application on the new property. The only thing that can carry over is the Save Our Homes benefit, and only if you file for portability.",
          "Forgetting to update your driver's license, voter registration, and vehicle registration to the new address. The county uses these records to confirm permanent residence. If they point at a different address, your application can be denied.",
          "Claiming homestead in Florida while also claiming a primary-residence tax break in another state. This is the fastest way to end up in a homestead fraud investigation.",
          "Co-owning the home with someone who is not a Florida permanent resident and assuming the exemption still applies to the full value. Co-ownership scenarios get complicated quickly — ask the county appraiser about your specific ownership structure.",
          "Filing the application and then ignoring the August TRIM notice. Errors in the assessed-value calculation are easier to fix in August than they are a year later when you are looking at a tax bill that does not reflect the exemption you thought you had.",
        ],
      },

      {
        kind: "callout",
        tone: "warning",
        title: "Verify before you file",
        body: "The mechanics above reflect well-established Florida homestead rules, but individual county practices, trust structures, and portability filings have enough variation that you should always verify the current year's process with a licensed Florida broker and, where appropriate, a tax professional or Florida attorney before you file.",
      },
    ],
    footnotes: [
      "Florida Constitution, Article VII, Section 6 (homestead exemption).",
      "Florida Constitution, Article VII, Section 4 (Save Our Homes assessment limitation).",
      "Florida Department of Revenue — Property Tax Oversight homestead overview: floridarevenue.com/property.",
      "Your county property appraiser's official homestead application portal (search '[county] property appraiser' for the authoritative government site).",
    ],
    ctaHeadline: "Preparing to buy a home in Florida?",
    ctaBody:
      "The timing of your homestead filing can materially affect your first-year property tax bill and your long-term Save Our Homes benefit. buyer-v2's licensed Florida brokers factor homestead timing into your offer strategy so you are not leaving savings on the table on your very first year in the home.",
    ctaButtonLabel: "Start with a listing link",
  },

  // ─── Guide 2: Florida Buyer Rebate Explained ─────────────────────────
  {
    slug: "florida-buyer-rebate-explained",
    title:
      "The Florida Buyer Rebate Explained: How Up To 2% Back Actually Works",
    summary:
      "How Florida buyer rebates work in practice — the legal basis under FREC Rule 61J2-10.028, how the money actually flows, a worked example, how it interacts with your lender, and the tax treatment most buyers ask about first.",
    category: "rebate",
    publishedAt: "2026-04-15",
    updatedAt: "2026-04-15",
    readingTimeMinutes: 10,
    visibility: "public",
    brokerReviewed: false,
    heroEyebrow: "Florida buyer guide",
    atAGlance: [
      "A buyer rebate is a portion of the buyer-side brokerage compensation that the brokerage returns to its client at closing — subject to broker approval, lender rules, and the specifics of each transaction.",
      "In Florida, brokerage rebates to a principal in a transaction are expressly contemplated by the real estate license law and by FREC Rule 61J2-10.028, which governs brokerage fees, disbursements, and conflicts.",
      "The rebate typically flows listing-side commission → buyer brokerage → client at closing, which is why the rebate is not a fee you pay and then get back; it is a split of compensation the brokerage was going to receive anyway.",
      "The most common delivery mechanism is a credit on the closing disclosure, though in some transactions the rebate is paid post-closing by wire or used as a rate buydown, depending on lender and compliance constraints.",
      "Rebates are generally treated as a reduction in your home's purchase price rather than ordinary taxable income, but the treatment depends on your specific facts — always verify with a tax professional.",
    ],
    tableOfContents: [
      { id: "what-is-a-rebate", label: "What a buyer rebate is" },
      { id: "why-legal-in-florida", label: "Why it's legal in Florida" },
      { id: "how-the-money-flows", label: "How the money actually flows" },
      { id: "worked-example", label: "A worked example" },
      { id: "how-we-pay-it", label: "How the rebate is paid" },
      { id: "tax-treatment", label: "Tax treatment" },
      { id: "not-a-rebate", label: "What is NOT a buyer rebate" },
    ],
    body: [
      {
        kind: "callout",
        tone: "info",
        title: "Educational content only",
        body: "This guide is educational content, not legal or tax advice. Buyer rebates are subject to your lender's guidelines, the specific listing's compensation structure, your broker's approval, and — for tax treatment — your individual facts. Nothing in this guide is a promise of a specific rebate to a specific buyer. Verify all of it with a licensed Florida broker and, for tax questions, with a qualified tax professional.",
      },

      {
        kind: "heading",
        id: "what-is-a-rebate",
        text: "What a buyer rebate is",
      },
      {
        kind: "paragraph",
        text: "A Florida buyer rebate — sometimes called a commission rebate, a buyer credit, or a closing-cost credit from the brokerage — is a portion of the brokerage compensation paid on a home sale that a buyer brokerage returns to its own client. The rebate comes out of the brokerage's compensation, not out of the seller's pocket separately. From the seller's perspective, the transaction looks the same. From the buyer's perspective, some of the money that would otherwise have been kept entirely by the brokerage ends up offsetting their own cost of closing.",
      },
      {
        kind: "paragraph",
        text: "The reason this matters is that real estate brokerage has historically been a percentage-of-price business. Total commissions on a Florida home sale have typically run in the range of 5% to 6%, split between the listing side and the buyer side — though since the 2024 NAR settlement, the buyer-side compensation is explicitly negotiable and is no longer advertised on the MLS in the same way. A buyer rebate is a way of acknowledging that buyers are the ones whose cash is on the line at closing and that, in many transactions, the full historical buyer-side commission is simply more than the work required to serve the buyer well. The brokerage keeps enough to run the business competently and returns the rest.",
      },
      {
        kind: "paragraph",
        text: "There is no single universal rebate number. What buyer-v2 typically quotes is up to 2% of the purchase price returned to the buyer, but that figure depends on the listing's published buyer-side compensation, the broker's fee arrangement with the buyer, the lender's rules, and the structure of the specific deal. When you see a headline number in buyer-v2 marketing, it is an expected rebate under typical conditions — not a guarantee for any specific listing.",
      },

      {
        kind: "heading",
        id: "why-legal-in-florida",
        text: "Why it's legal in Florida",
      },
      {
        kind: "paragraph",
        text: "Buyer rebates are legal in Florida because Florida real estate license law and Florida Real Estate Commission (FREC) rules explicitly contemplate brokers disbursing compensation — including splits with a principal in a transaction — provided the disbursement is disclosed and passes through the brokerage's trust accounting correctly. The rule most frequently cited in this context is FREC Rule 61J2-10.028, which sets out the framework for brokerage fees, escrow disbursements, and the handling of conflicts when a brokerage owes money to multiple parties.",
      },
      {
        kind: "paragraph",
        text: "The key ideas in Florida's approach are disclosure and documentation. A buyer brokerage that plans to rebate compensation to its client needs to document the arrangement in the buyer representation agreement, disclose the rebate to the other parties to the extent required, and make sure the flow of funds at closing matches what the closing disclosure says. Done correctly, the rebate is not a legal grey area — it is a recognized part of how brokerage compensation can be structured. The caveats are that every element of the rebate flow has to be clean, and that any promise to a specific buyer is subject to broker approval on the specific transaction.",
      },
      {
        kind: "paragraph",
        text: "Florida is not unusual in permitting buyer rebates. The U.S. Department of Justice has for decades pointed to commission rebates as a pro-consumer outcome in real estate markets, and most states allow them under similar disclosure frameworks. A handful of states restrict or prohibit them — if you are buying outside Florida, do not assume the framework below applies.",
      },

      {
        kind: "heading",
        id: "how-the-money-flows",
        text: "How the money actually flows",
      },
      {
        kind: "paragraph",
        text: "The single most common point of confusion about buyer rebates is the direction of the money. A rebate is not a situation where the buyer pays an extra fee and then receives a check. A rebate is a split of compensation that was already flowing to the buyer brokerage. The mechanical flow looks like this:",
      },
      {
        kind: "steps",
        items: [
          {
            title: "1. Seller authorizes a buyer-side compensation.",
            body: "In the listing agreement (and, since the 2024 NAR settlement, increasingly in a separate written compensation offer to the buyer-side brokerage), the seller agrees that some portion of the proceeds at closing will flow to whichever brokerage represents the buyer. This is the pool of money the rebate comes out of — it is already going to a buyer brokerage regardless of which one the buyer picks.",
          },
          {
            title: "2. Buyer signs a representation agreement with the brokerage.",
            body: "The buyer and the buyer brokerage sign a written representation agreement that defines the brokerage's fee and any rebate mechanics. This is where the specific rebate structure is documented in writing before the offer goes out. Without this agreement, the brokerage has no basis to rebate anything.",
          },
          {
            title: "3. Transaction closes; commission is paid to the brokerage.",
            body: "At closing, the seller's proceeds pay out the agreed buyer-side compensation to the buyer brokerage. The money goes to the brokerage's operating or trust account per the closing instructions, not to the individual buyer directly.",
          },
          {
            title: "4. Brokerage splits the compensation with the buyer.",
            body: "Per the representation agreement, the brokerage keeps its fee and the rest flows back to the buyer. In the cleanest structure, that 'back to the buyer' step happens directly on the closing disclosure as a credit, so the buyer sees the rebate reduce their cash to close line. In other structures, it may be paid post-closing by wire or applied as a rate buydown — more on those in the 'How the rebate is paid' section below.",
          },
        ],
      },

      {
        kind: "heading",
        id: "worked-example",
        text: "A worked example",
      },
      {
        kind: "callout",
        tone: "info",
        title: "Illustrative example — not a promise",
        body: "The numbers below are an illustrative example to help you understand how the mechanics work. They are not a commitment to any specific rebate on any specific listing. Your actual rebate depends on the listing's buyer-side compensation, your representation agreement, your lender's rules, and broker approval.",
      },
      {
        kind: "paragraph",
        text: "Imagine a buyer purchases a Tampa condo at a $450,000 contract price. The seller has authorized a 2.5% buyer-side compensation in the listing's compensation terms. At a 2.5% rate on a $450,000 contract, the buyer-side compensation pool at closing is $11,250.",
      },
      {
        kind: "paragraph",
        text: "Under the buyer's written representation agreement with the brokerage, the brokerage is entitled to keep an effective 1.5% of the purchase price as its compensation for representing the buyer through the transaction — worth $6,750 on this deal. The remaining 1% of the purchase price — $4,500 on this deal — flows back to the buyer as a rebate on the closing disclosure. In this scenario the buyer's cash-to-close line drops by $4,500 versus what it would have been without the rebate arrangement.",
      },
      {
        kind: "paragraph",
        text: "Change the assumptions and the rebate moves with them. If the buyer-side compensation pool in the listing is 3% instead of 2.5%, the rebate math starts from a bigger number. If the lender will only allow a rebate up to a certain dollar cap, the rebate may be capped to stay within lender guidelines even if the math would otherwise justify more. If the listing has no buyer-side compensation at all, there is no pool to split — and the representation agreement has to address that scenario separately. This is why the honest framing for marketing is 'up to 2%' rather than a fixed number.",
      },

      {
        kind: "heading",
        id: "how-we-pay-it",
        text: "How the rebate is paid",
      },
      {
        kind: "paragraph",
        text: "Once the rebate amount is determined, there are three common ways the money actually reaches the buyer. The right choice depends on the lender, the closing instructions, and sometimes on what the buyer wants to do with the money.",
      },
      {
        kind: "list",
        items: [
          "Closing-disclosure credit. The rebate is shown on the closing disclosure as a credit from the buyer's brokerage, and it reduces the buyer's cash to close by exactly that amount. This is typically the cleanest structure when the lender permits it, because there is no separate transfer after closing and everything is documented in the closing paperwork.",
          "Post-closing wire or check. Some lenders cap how much brokerage credit can be applied on the closing disclosure. When the cap bites, the capped portion can still reach the buyer — it is simply paid separately after closing, directly from the brokerage to the buyer. This is slightly more operational overhead but achieves the same economic result.",
          "Rate buydown. Some buyers prefer to use the rebate amount to buy down their mortgage rate at closing rather than taking it as cash or as a reduction in cash to close. Whether this is worth doing depends on how long you plan to stay in the home and the current rate environment — worth asking your lender to model it both ways.",
        ],
      },
      {
        kind: "paragraph",
        text: "Lender rules are the most common reason the delivery mechanism changes between transactions. Some lenders will allow the full rebate to flow on the closing disclosure; others cap interested-party contributions, which can include brokerage rebates, at a percentage of the home's value or the loan amount. When we work a deal at buyer-v2, the lender's position is something we confirm early — before the rebate number makes its way into the buyer's expectations for cash to close.",
      },

      {
        kind: "heading",
        id: "tax-treatment",
        text: "Tax treatment",
      },
      {
        kind: "paragraph",
        text: "The question every buyer asks is whether the rebate is taxable income. The general answer under current IRS guidance is that a brokerage rebate to a buyer of a home is typically treated as a reduction in the purchase price of the home rather than as ordinary taxable income. In that framing, the rebate lowers the buyer's cost basis in the home by the rebate amount instead of showing up on a 1099 as income in the year of the transaction.",
      },
      {
        kind: "paragraph",
        text: "The reason this matters is intuitive: if the buyer had simply negotiated a lower purchase price by the amount of the rebate, there would obviously be no tax due — they are just paying less for the same house. A brokerage rebate achieves a similar economic result and, under the typical IRS view, is treated similarly. That said, 'typically' is doing real work in that sentence. Specific facts and specific structures can change the treatment, and the IRS has not issued a single universal ruling that covers every permutation of every brokerage rebate in every state.",
      },
      {
        kind: "paragraph",
        text: "What this means practically: do not rely on this guide for your tax filing. If the rebate is large enough to matter, ask your tax professional to confirm the right treatment before you file. Bring them the closing disclosure, the representation agreement, and any rebate documentation so they have the facts in front of them. This is exactly the kind of question that is cheap to ask and expensive to get wrong.",
      },

      {
        kind: "heading",
        id: "not-a-rebate",
        text: "What is NOT a buyer rebate",
      },
      {
        kind: "paragraph",
        text: "Several things commonly get bundled together under the word 'rebate' that are actually different products. It is worth distinguishing them because some are meaningful and others are marketing dressing.",
      },
      {
        kind: "list",
        items: [
          "A brokerage fee rebate is a portion of the buyer-side brokerage compensation returned to the client as described above. It comes from the brokerage's own compensation pool and is the subject of this guide.",
          "A seller-paid closing-cost credit is negotiated between the buyer and the seller in the purchase contract and paid out of the seller's proceeds. It is not a brokerage rebate — it is a seller concession, and it is fundamentally different in legal character, disclosure requirements, and negotiation leverage.",
          "A lender credit is a reduction in your lender fees (or a payment toward third-party closing costs) in exchange for accepting a slightly higher interest rate. It is a loan pricing choice, not a brokerage rebate.",
          "A gift card or a post-closing 'thank you' is a marketing gesture and is not economically equivalent to a percentage-based rebate on the purchase price.",
          "A discount on the brokerage's flat fee (when the brokerage charges a flat fee rather than a percentage) is a different pricing model entirely. It is not wrong — some buyers prefer it — but it should not be confused with a percentage-of-price rebate.",
        ],
      },

      {
        kind: "callout",
        tone: "warning",
        title: "Verify before you rely on a specific number",
        body: "Everything in this guide describes how buyer rebates typically work in Florida under current rules. None of it is a promise of a specific rebate amount to any specific buyer, and none of it is a substitute for an actual buyer representation agreement, a specific listing's compensation terms, lender confirmation, or advice from a licensed Florida broker and a tax professional. When you are ready to run the numbers on a real listing, verify with a licensed FL broker and a tax professional before you count on the dollar amount.",
      },
    ],
    footnotes: [
      "Florida Administrative Code, FREC Rule 61J2-10.028 (brokerage fees, escrow, and conflicts).",
      "U.S. Department of Justice — Antitrust Division public guidance noting that buyer commission rebates are a pro-competitive consumer outcome in real estate markets.",
      "IRS general position that rebates received on the purchase of property are typically treated as a reduction in basis rather than ordinary income (verify with a tax professional for your specific facts).",
      "Florida Bar Journal and Florida Realtors editorial coverage of buyer-side compensation practices following the 2024 NAR settlement.",
    ],
    ctaHeadline: "Ready to see what a rebate would look like on a real listing?",
    ctaBody:
      "Paste a Zillow, Redfin, or Realtor.com link and buyer-v2 will run the pricing, comps, and rebate math on that specific listing — including the lender-constrained rebate range you could realistically expect to see on the closing disclosure.",
    ctaButtonLabel: "Start with a listing link",
  },
];

// ─── Selector helpers ───────────────────────────────────────────────────

/**
 * Public-facing guides only. Any `draft` guide is excluded — the
 * sitemap builder, the `/guides` index page, and every public
 * consumer should route through this selector rather than reaching
 * into `GUIDES` directly.
 */
export function publicGuides(
  guides: GuideArticle[] = GUIDES,
): GuideArticle[] {
  return guides.filter((guide) => guide.visibility === "public");
}

/**
 * Guides that are safe to ship into the public sitemap and indexed
 * by search engines. Today this is identical to `publicGuides`, but
 * the separation exists so future compliance gates (for example,
 * requiring `brokerReviewed === true` before a guide can be indexed
 * by search engines) can tighten this selector without having to
 * hunt down every call site that currently filters by visibility.
 */
export function filterPublishableGuides(
  guides: GuideArticle[] = GUIDES,
): GuideArticle[] {
  return guides.filter((guide) => guide.visibility === "public");
}

/**
 * Look up a single guide by its slug. Returns `undefined` when no
 * matching guide exists — callers handle the not-found case (the
 * `/guides/[slug]` route translates `undefined` into a 404).
 */
export function getGuideBySlug(slug: string): GuideArticle | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
