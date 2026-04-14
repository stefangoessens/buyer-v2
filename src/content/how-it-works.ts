import type { HowItWorksContent } from "@/lib/content/types";

/**
 * Shared "how it works" content (KIN-1056).
 *
 * Consumed by both the homepage `#how-it-works` anchor section and
 * the standalone `/how-it-works` route so the copy and imagery live
 * in a single place.
 */
export const HOW_IT_WORKS: HowItWorksContent = {
  eyebrow: "Simple process",
  title: "Three steps to your best deal",
  description:
    "From a pasted listing link to a closed Florida home — here's how buyer-v2 takes you from analysis to closing.",
  steps: [
    {
      id: "paste",
      number: 1,
      title: "Paste a link",
      description:
        "Copy any listing URL from Zillow, Redfin, or Realtor.com and paste it into our analysis bar.",
      imageSrc: "/images/marketing/steps/step-1.png",
    },
    {
      id: "review",
      number: 2,
      title: "Review your analysis",
      description:
        "Get an instant AI-powered report with fair pricing, comps, leverage signals, and a property score.",
      imageSrc: "/images/marketing/steps/step-2.png",
    },
    {
      id: "close",
      number: 3,
      title: "Close with confidence",
      description:
        "Connect with a licensed Florida broker who uses your analysis to negotiate the best possible deal.",
      imageSrc: "/images/marketing/steps/step-3.png",
    },
  ],
};
