import type { FAQEntry } from "@/lib/content/types";

/**
 * Canonical FAQ catalog for the public site.
 *
 * The public /faq page is organised around three editorial THEMES so
 * buyers can jump-nav directly to the part of the story they care
 * about:
 *
 *   1. how_it_works   — what buyer-v2 is, how the workflow runs,
 *                       who actually shows homes, where we operate.
 *   2. how_you_save   — fee model, buyer credit at closing, lender
 *                       constraints, tax treatment.
 *   3. protection     — licensing, contracts, hidden fees, disclosure
 *                       handling, data ownership, cancellation.
 *
 * `theme` is the PUBLIC-FACING IA axis. `category` and `stage` are
 * preserved on every entry — older surfaces (homepage teasers, the
 * stage-grouped accordion fallback) and ops review still consume
 * them, so deleting them would silently break unrelated render paths.
 *
 * Every entry's `id` is a stable kebab-case slug. Slugs are
 * deep-linkable (`/faq#what-is-buyer-v2`) and become the `url` field
 * inside FAQPage JSON-LD per entry, so they must be stable across
 * copy edits — change the slug only when you genuinely intend to
 * break the public anchor.
 *
 * Internal-only entries (ops playbook clarifications, agent training
 * notes) live in this file alongside public entries for single-source
 * review but are stripped before public render by `filterPublic`.
 */
export const FAQ_ENTRIES: FAQEntry[] = [
  // ─── Theme 1: How it works ─────────────────────────────────────────
  {
    id: "what-is-buyer-v2",
    category: "getting_started",
    stage: "pre_offer",
    theme: "how_it_works",
    question: "What is buyer-v2?",
    answer:
      "buyer-v2 is a Florida-first buyer brokerage built around AI analysis and licensed human representation. You paste a listing, we turn it into a deal room, and we help you from analysis through closing.",
    visibility: "public",
  },
  {
    id: "how-does-buyer-v2-work",
    category: "getting_started",
    stage: "pre_offer",
    theme: "how_it_works",
    question: "How does buyer-v2 work?",
    answer:
      "Start by pasting a Zillow, Redfin, or Realtor.com link. We analyze the listing, organize the property data, and then help with tours, offers, negotiations, and closing when you are ready.",
    visibility: "public",
  },
  {
    id: "can-i-tour-homes-with-buyer-v2",
    category: "process",
    stage: "pre_offer",
    theme: "how_it_works",
    question: "Can I tour homes with buyer-v2?",
    answer:
      "Yes. buyer-v2 can coordinate tours through licensed local showing partners and licensed brokers where required. You still get real-world access to homes; we just make the scheduling and follow-through much faster.",
    visibility: "public",
  },
  {
    id: "can-i-still-talk-to-a-real-person",
    category: "process",
    stage: "pre_offer",
    theme: "how_it_works",
    question: "Can I still talk to a real person?",
    answer:
      "Yes. AI handles speed and analysis, but licensed humans handle representation, negotiation, contracts, and the moments that actually need judgment. You are never forced into an AI-only experience.",
    visibility: "public",
  },
  {
    id: "do-i-have-to-switch-lenders-or-title-companies",
    category: "process",
    stage: "pre_offer",
    theme: "how_it_works",
    question: "Do I have to switch lenders or title companies?",
    answer:
      "Usually no. If you already have a lender or preferred title company, we can usually work with them as long as the transaction setup allows it. We will tell you early if anything needs to change for a specific deal.",
    visibility: "public",
  },
  {
    id: "where-is-buyer-v2-available",
    category: "getting_started",
    stage: "pre_offer",
    theme: "how_it_works",
    question: "Where is buyer-v2 available?",
    answer:
      "buyer-v2 is built for Florida homebuyers today. We are deliberately Florida-first so the workflow, compliance, contracts, and brokerage operations match one market well before we expand.",
    visibility: "public",
  },
  {
    id: "how-is-buyer-v2-different-from-zillow-redfin-or-a-traditional-agent",
    category: "getting_started",
    stage: "pre_offer",
    theme: "how_it_works",
    question:
      "How is buyer-v2 different from Zillow, Redfin, or a traditional agent?",
    answer:
      "Zillow and Redfin are great search tools, but they are not built around a buyer-side operating system with rebate-first economics. Traditional agents give you representation, but buyer-v2 adds instant AI analysis, a structured deal room, and a lower-fee model designed to return more value to the buyer.",
    visibility: "public",
  },
  {
    id: "internal-eng-roadmap",
    category: "technical",
    stage: "under_contract",
    theme: "how_it_works",
    question: "Internal: current engineering priorities?",
    answer:
      "iOS launch, multi-state expansion foundations, and AI engine v2. Internal-only.",
    visibility: "internal",
  },

  // ─── Theme 2: How you save ─────────────────────────────────────────
  {
    id: "how-does-buyer-v2-save-me-money",
    category: "pricing",
    stage: "pre_offer",
    theme: "how_you_save",
    question: "How does buyer-v2 save me money?",
    answer:
      "buyer-v2 is designed to keep the brokerage fee lower than a traditional percentage-based model and return part of the buyer-side economics back to you at closing. The exact amount depends on the listing, the final compensation structure, and lender rules.",
    visibility: "public",
  },
  {
    id: "how-does-the-buyer-credit-work-at-closing",
    category: "pricing",
    stage: "post_close",
    theme: "how_you_save",
    question: "How does the buyer credit work at closing?",
    answer:
      "When the transaction allows it, part of the buyer-side compensation is credited back to you on the closing statement. That credit typically reduces your closing costs or cash to close rather than showing up as a separate cash payment.",
    visibility: "public",
  },
  {
    id: "is-the-rebate-taxable",
    category: "pricing",
    stage: "post_close",
    theme: "how_you_save",
    question: "Is the rebate taxable?",
    answer:
      "In many cases, buyer credits are generally treated as a reduction in purchase price rather than ordinary taxable income. buyer-v2 does not provide tax advice, so buyers should confirm the treatment with their tax advisor.",
    visibility: "public",
  },
  {
    id: "what-if-my-lender-doesnt-allow-rebates",
    category: "pricing",
    stage: "pre_offer",
    theme: "how_you_save",
    question: "What if my lender doesn't allow rebates?",
    answer:
      "Some lenders cap how much credit can be applied to a transaction. If that happens, we will explain the lender constraint early and show the cleanest available structure before closing so there are no surprises.",
    visibility: "public",
  },
  {
    id: "internal-agent-bonus-split",
    category: "pricing",
    stage: "pre_offer",
    theme: "how_you_save",
    question: "Internal: agent bonus split for referrals?",
    answer:
      "Referral bonuses are split 70/30 between the closing broker and the referring partner. This is internal-only — do not share publicly.",
    visibility: "internal",
  },

  // ─── Theme 3: Protection & peace of mind ───────────────────────────
  {
    id: "is-buyer-v2-a-licensed-brokerage",
    category: "legal",
    stage: "pre_offer",
    theme: "protection",
    question: "Is buyer-v2 a licensed brokerage?",
    answer:
      "Yes. buyer-v2 operates as a licensed Florida real estate brokerage, and all license-critical actions stay under licensed human oversight. The page will display the Florida license number once compliance confirms the final public format.",
    visibility: "public",
  },
  {
    id: "will-buyer-v2-use-the-same-florida-contracts",
    category: "legal",
    stage: "making_offer",
    theme: "protection",
    question: "Will buyer-v2 use the same real estate contracts Florida agents use?",
    answer:
      "Yes. buyer-v2 uses the same standard Florida contract families buyers expect in a normal transaction, subject to the specific deal and broker review. We are not inventing a separate set of contracts just because the experience is software-driven.",
    visibility: "public",
  },
  {
    id: "are-there-any-hidden-fees-or-commissions",
    category: "legal",
    stage: "pre_offer",
    theme: "protection",
    question: "Are there any hidden fees or commissions?",
    answer:
      "No hidden fees appear after the fact. Compensation and representation terms are disclosed clearly before you sign anything binding.",
    visibility: "public",
  },
  {
    id: "why-let-buyer-v2-contact-the-sellers-agent-directly",
    category: "process",
    stage: "making_offer",
    theme: "protection",
    question:
      "Why should I let buyer-v2 contact the seller's agent directly instead of doing it myself?",
    answer:
      "When the brokerage contacts the listing side directly, the representation line is clearer and the buyer-side economics are easier to preserve. It also keeps negotiation, disclosures, and follow-up inside a documented brokerage workflow instead of leaving you to manage it alone.",
    visibility: "public",
  },
  {
    id: "what-happens-if-i-find-a-concerning-issue-in-the-disclosures",
    category: "process",
    stage: "under_contract",
    theme: "protection",
    question: "What happens if I find a concerning issue in the disclosures?",
    answer:
      "buyer-v2 helps surface the issue, explains why it matters, and routes it into the right next step with your broker. Depending on the contract timeline, that may mean asking follow-up questions, requesting repairs or credits, bringing in a specialist, or deciding not to move forward.",
    visibility: "public",
  },
  {
    id: "who-owns-my-data",
    category: "technical",
    stage: "pre_offer",
    theme: "protection",
    question: "Who owns my data?",
    answer:
      "Your deal data belongs to your relationship with buyer-v2, not to an advertising marketplace. We do not sell buyer data for marketing, and the Privacy Policy governs retention, access, and deletion rights.",
    visibility: "public",
  },
  {
    id: "what-if-i-want-to-cancel-after-signing-the-representation-agreement",
    category: "legal",
    stage: "pre_offer",
    theme: "protection",
    question: "What if I want to cancel after signing the representation agreement?",
    answer:
      "Representation agreements have terms. Before signing, you can ask questions about the specific cancellation language, and we will walk you through it so there are no surprises. If you later decide the relationship is not working, we will follow the cancellation terms in the agreement.",
    visibility: "public",
  },
];
