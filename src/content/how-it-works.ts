import type { HowItWorksContent } from "@/lib/content/types";

/**
 * Shared "how it works" content (KIN-1056 / KIN-1067).
 *
 * Consumed by both the homepage `#how-it-works` anchor section and
 * the standalone `/how-it-works` route so the copy and imagery live
 * in a single place.
 */
export const HOW_IT_WORKS: HowItWorksContent = {
  eyebrow: "Simple process",
  title: "Five steps from listing link to closing day",
  description:
    "Paste a Florida listing URL and we run the full buyer-side workflow — analysis, broker review, offer, negotiation, and closing — on one platform.",
  steps: [
    {
      id: "paste",
      number: 1,
      title: "Paste a listing",
      description:
        "Drop any Zillow, Redfin, or Realtor.com URL into the analysis bar. We normalise the listing into a structured property record in seconds.",
      technicalDetail:
        "Headless ingestion via Browser Use parses photos, beds, baths, lot, taxes, and listing history into the deal room.",
      imageSrc: "/images/marketing/steps/step-1.png",
    },
    {
      id: "ai-analysis",
      number: 2,
      title: "AI analysis",
      description:
        "Our pricing, comp, leverage, and risk engines build an instant report — fair-price band, comparable sales, negotiation signals, and inspection flags.",
      technicalDetail:
        "Pricing, comps, leverage, and risk engines run in parallel against Florida MLS history with confidence scores and citations.",
      imageSrc: "/images/marketing/steps/step-2.png",
    },
    {
      id: "broker-review",
      number: 3,
      title: "Broker review",
      description:
        "A licensed Florida broker reviews the AI analysis, validates the numbers, and adds local context before anything reaches you.",
      technicalDetail:
        "Human-in-the-loop review queue — every engine output is gated on broker sign-off before it is shown as recommended action.",
      imageSrc: "/images/marketing/steps/step-3.png",
    },
    {
      id: "offer-negotiation",
      number: 4,
      title: "Offer & negotiation",
      description:
        "Your broker drafts the FAR/BAR offer, walks you through the terms, and runs the negotiation with the listing side on your behalf.",
      technicalDetail:
        "Offer drafting, compensation negotiation, and counter-offer rounds are broker-led — license-critical actions never run on autopilot.",
      imageSrc: "/images/marketing/steps/step-4.png",
    },
    {
      id: "closing-support",
      number: 5,
      title: "Closing support",
      description:
        "We coordinate disclosures, inspections, escrow, and the title company so closing day arrives with no surprises.",
      technicalDetail:
        "A dedicated closing coordinator runs the timeline in the deal room — disclosure delivery, inspection scheduling, and escrow milestones in one place.",
      imageSrc: "/images/marketing/steps/step-5.png",
    },
  ],
};
