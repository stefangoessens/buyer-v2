/**
 * Homepage "How it works" content (KIN-1083).
 *
 * Single source of truth for the four-step homepage HIW section copy,
 * step ordering, icon references, and human-vs-AI bylines. Kept
 * separate from `src/content/how-it-works.ts` (which powers the
 * standalone `/how-it-works` route) so the homepage rebuild can iterate
 * on shorter, role-attributed copy without disturbing the long-form
 * page.
 *
 * CTA anchor decision: the homepage hero (`HeroSection` + `HeroInput`)
 * does not currently expose a stable DOM id. Rather than introduce a
 * cross-subagent dependency on adding one, the CTA links to `/` which
 * routes back to the top of the homepage where the paste input lives.
 * If a stable hero anchor lands later, update `cta.href` to deep-link
 * directly.
 */

export interface HomeHowItWorksStep {
  id: "analyze" | "tour" | "offer" | "close";
  number: number;
  title: string;
  description: string;
  byline: string;
  bylineKind: "ai" | "human";
  iconName: "sparkles" | "home" | "handshake" | "key";
  href?: string;
}

export interface HomeHowItWorksContent {
  eyebrow: string;
  headline: string;
  intro: string;
  steps: readonly HomeHowItWorksStep[];
  cta: { label: string; href: string };
}

export const HOME_HOW_IT_WORKS: HomeHowItWorksContent = {
  eyebrow: "How it works",
  headline: "Every step has an owner",
  intro:
    "buyer-v2 combines software speed with a Florida transaction team, so you always know what the AI handles and where a real person steps in.",
  steps: [
    {
      id: "analyze",
      number: 1,
      title: "Analyze",
      description:
        "Paste a Zillow, Redfin, or Realtor.com link and buyer-v2 turns it into an instant buyer-side analysis. Our AI estimates fair value, pulls comparable sales, scores negotiation leverage, and flags climate, insurance, and condition risk before you ever book a tour.",
      byline: "Powered by [Brand] AI",
      bylineKind: "ai",
      iconName: "sparkles",
    },
    {
      id: "tour",
      number: 2,
      title: "Tour",
      description:
        "Book a showing with a local Florida coordinator who can get you in quickly without a sales pitch. They handle scheduling, access, and on-the-ground tour logistics so you can focus on whether the home is actually right for you.",
      byline: "Shown by Florida local guides",
      bylineKind: "human",
      iconName: "home",
    },
    {
      id: "offer",
      number: 3,
      title: "Offer",
      description:
        "When you are ready to move, a licensed Florida broker drafts your offer, explains the contingencies, and negotiates directly with the listing side. You stay in control of the decision; we handle the brokerage work that gets the deal across the line.",
      byline: "Drafted by licensed Florida brokers",
      bylineKind: "human",
      iconName: "handshake",
    },
    {
      id: "close",
      number: 4,
      title: "Close",
      description:
        "Once you are under contract, your closing team coordinates title, financing, inspections, insurance, and paperwork so deadlines do not slip. Your rebate is tracked through the transaction and delivered at closing.",
      byline: "Coordinated by your closing team",
      bylineKind: "human",
      iconName: "key",
    },
  ],
  cta: {
    label: "Paste your first property link",
    href: "/",
  },
};

export function homeHowItWorksStepsForSchema(): Array<{
  name: string;
  text: string;
}> {
  return HOME_HOW_IT_WORKS.steps.map((s) => ({
    name: s.title,
    text: s.description,
  }));
}
