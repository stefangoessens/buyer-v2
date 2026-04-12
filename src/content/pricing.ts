import type { PricingSection } from "@/lib/content/types";

/**
 * Public pricing page content for buyer-v2 (KIN-773).
 *
 * The pricing page is a single vertical stack of these sections. Each
 * section is either a value-prop block (no CTA), an explainer
 * (how commissions work), or a CTA block.
 */
export const PRICING_SECTIONS: PricingSection[] = [
  {
    id: "headline",
    title: "Free to use. Paid from the seller's commission.",
    visibility: "public",
    body:
      "buyer-v2 never charges buyers up front. Our fee is paid out of the buyer-agent commission at closing, and we rebate a portion of that commission back to you.",
    bullets: [
      "No sign-up fee, no monthly subscription, no hidden cost",
      "Buyer credit shows up on your closing disclosure",
      "If a listing has no buyer-agent commission, we'll tell you before you engage",
    ],
  },
  {
    id: "savings_calculator_cta",
    title: "See how much you could save",
    visibility: "public",
    body:
      "Our savings calculator walks you through a typical Florida transaction and shows the buyer credit you'd receive at closing. Adjust the assumptions to match your own deal.",
    cta: {
      label: "Open savings calculator",
      href: "/savings",
    },
  },
  {
    id: "how_commissions_work",
    title: "How real estate commissions work in Florida",
    visibility: "public",
    body:
      "Historically the seller pays a single total commission out of proceeds at closing. That total is typically split between the listing agent and the buyer's agent. After the 2024 NAR settlement, the buyer-agent portion is explicitly negotiated between the parties — no number is fixed in stone.",
    bullets: [
      "Total commission: historically 5–6% of purchase price",
      "Buyer-agent share: historically ~3%, now always negotiable",
      "buyer-v2 rebate: a portion of the buyer-agent share, returned to you at closing",
    ],
  },
  {
    id: "what_you_get",
    title: "What's included",
    visibility: "public",
    body:
      "Every buyer gets the full platform plus licensed broker representation — no tiers, no upsells.",
    bullets: [
      "AI pricing, comps, and leverage analysis on any listing",
      "Deal room with tasks, timeline, and document storage",
      "Licensed Florida broker representation",
      "Showing agent dispatch for tours",
      "Offer assistance and negotiation support",
      "Contract review and closing coordination",
      "Buyer credit back at closing",
    ],
  },
  {
    id: "internal_fee_schedule",
    title: "Internal: agent fee schedule",
    visibility: "internal",
    body:
      "Internal-only: agent fee split for the brokerage backend. Do not render on the public pricing page.",
  },
  {
    id: "final_cta",
    title: "Ready to start?",
    visibility: "public",
    body:
      "Paste a listing link on the homepage and we'll have your free analysis and deal room ready in seconds.",
    cta: {
      label: "Start with a listing link",
      href: "/",
    },
  },
];
