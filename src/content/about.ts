/**
 * Canonical content for the /about route (KIN-1068).
 *
 * The /about page is composed from typed sections rather than a
 * stub template — copy lives here so editorial changes never touch
 * the JSX. Every other surface that wants the same mission line,
 * team list, or trust badges should import from this module.
 */

export interface AboutHeroContent {
  eyebrow: string;
  title: string;
  mission: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}

export interface AboutOperatingPillar {
  id: string;
  title: string;
  description: string;
}

export interface AboutOperatingModelContent {
  eyebrow: string;
  title: string;
  description: string;
  aiPillars: AboutOperatingPillar[];
  brokerPillars: AboutOperatingPillar[];
}

export interface AboutTrustBadge {
  id: string;
  pill: string;
  title: string;
  description: string;
}

export interface AboutTrustContent {
  eyebrow: string;
  title: string;
  description: string;
  badges: AboutTrustBadge[];
}

export interface AboutProcessStep {
  id: string;
  number: number;
  title: string;
  description: string;
}

export interface AboutProcessContent {
  eyebrow: string;
  title: string;
  description: string;
  steps: AboutProcessStep[];
}

export interface AboutTeamMember {
  id: string;
  name: string;
  role: string;
  bio: string;
  photoSrc?: string;
}

export interface AboutTeamContent {
  eyebrow: string;
  title: string;
  description: string;
  emptyState: string;
  members: AboutTeamMember[];
}

export interface AboutContent {
  hero: AboutHeroContent;
  operatingModel: AboutOperatingModelContent;
  trust: AboutTrustContent;
  process: AboutProcessContent;
  team: AboutTeamContent;
}

export const ABOUT: AboutContent = {
  hero: {
    eyebrow: "About",
    title: "A buyer brokerage built for modern Florida homebuyers",
    mission:
      "Give every Florida homebuyer the analysis, leverage, and licensed representation that used to be reserved for institutional buyers — without ever charging them a fee.",
    description:
      "buyer-v2 combines instant AI-powered analysis with licensed Florida representation so you can negotiate from a position of strength. We rebate part of the buyer-agent commission back to you at closing.",
    imageSrc: "/images/marketing/bento/bento-2.png",
    imageAlt: "Florida homebuyer reviewing a buyer-v2 deal room",
  },

  operatingModel: {
    eyebrow: "How we operate",
    title: "AI does the analysis. A licensed broker owns the deal.",
    description:
      "buyer-v2 is a single platform built around a simple split — software handles the heavy data work, and a real Florida broker handles every license-critical decision.",
    aiPillars: [
      {
        id: "instant-analysis",
        title: "Instant analysis",
        description:
          "Pricing, comps, leverage, and risk engines run in parallel against Florida MLS history with confidence scores and source citations.",
      },
      {
        id: "always-on-deal-room",
        title: "Always-on deal room",
        description:
          "A semi-public deal room keeps every analysis, document, and timeline in one place — accessible the moment you paste a listing.",
      },
      {
        id: "auditable-recommendations",
        title: "Auditable recommendations",
        description:
          "Every engine output ships with a confidence score and citations so you can see exactly how each conclusion was reached.",
      },
    ],
    brokerPillars: [
      {
        id: "human-review",
        title: "Human review on every output",
        description:
          "A licensed Florida broker reviews each AI-generated analysis and adds local context before anything is shown as a recommended action.",
      },
      {
        id: "licensed-representation",
        title: "Licensed representation",
        description:
          "Offer drafting, compensation negotiation, disclosure delivery, and signing are all run by a real Florida broker — never automated.",
      },
      {
        id: "fiduciary-duty",
        title: "Fiduciary duty end-to-end",
        description:
          "Your broker owes you the full fiduciary duty of care, loyalty, and disclosure from the first paste-a-link to closing day.",
      },
    ],
  },

  trust: {
    eyebrow: "Florida-first trust",
    title: "A licensed Florida brokerage with broker oversight on every deal",
    description:
      "buyer-v2 is built specifically for Florida buyers, not retrofitted from a generic national platform. Every transaction runs through a registered Florida brokerage in good standing with the Department of Business and Professional Regulation.",
    badges: [
      {
        id: "florida-licensed",
        pill: "FL DBPR · License #BK-3000000",
        title: "Florida-licensed brokerage",
        description:
          "Every transaction runs through a registered Florida real estate brokerage in good standing with the Department of Business and Professional Regulation.",
      },
      {
        id: "broker-oversight",
        pill: "Broker oversight",
        title: "A human broker signs every move",
        description:
          "Buyer representation agreements, compensation disclosures, and contract terms are reviewed and signed off by a licensed Florida broker — never the AI alone.",
      },
      {
        id: "auditable-ai",
        pill: "Auditable AI",
        title: "Citations on every recommendation",
        description:
          "Pricing, comps, and negotiation guidance ship with confidence scores and source citations so you can audit how each conclusion was reached.",
      },
    ],
  },

  process: {
    eyebrow: "How we work with buyers",
    title: "From a pasted link to keys at closing",
    description:
      "We sit on your side of the table at every stage of the transaction. Here is how a typical engagement unfolds.",
    steps: [
      {
        id: "paste",
        number: 1,
        title: "Paste a Florida listing link",
        description:
          "Drop any Zillow, Redfin, or Realtor.com URL and we normalise the listing into a structured property record in seconds.",
      },
      {
        id: "analysis",
        number: 2,
        title: "Get an instant, broker-reviewed analysis",
        description:
          "Pricing, comps, leverage, and risk engines run end-to-end. A licensed broker reviews the output and adds local context before you see it.",
      },
      {
        id: "represent",
        number: 3,
        title: "We represent you through offer and close",
        description:
          "Your broker drafts the FAR/BAR offer, negotiates with the listing side, runs the deal room, and rebates a portion of commission to you at closing.",
      },
    ],
  },

  team: {
    eyebrow: "The team",
    title: "Florida operators behind the platform",
    description:
      "We are a small team of Florida brokers, software engineers, and ML practitioners building the buyer-side platform we always wished existed. Full team profiles are coming soon.",
    emptyState: "Team coming soon",
    members: [
      {
        id: "broker-of-record",
        name: "Broker of Record",
        role: "Florida-licensed broker · BK#BK-3000000",
        bio: "Owns broker oversight, licensing, and every license-critical action on the platform.",
      },
      {
        id: "head-of-product",
        name: "Head of Product",
        role: "Product & buyer experience",
        bio: "Shapes the deal room, paste-a-link onboarding, and every surface a Florida buyer touches.",
      },
      {
        id: "head-of-ai",
        name: "Head of AI",
        role: "Pricing, comps, and risk engines",
        bio: "Builds the AI engines behind every analysis — fair-price bands, comparables, leverage, and inspection signals.",
      },
      {
        id: "head-of-engineering",
        name: "Head of Engineering",
        role: "Platform & deal room",
        bio: "Owns the Next.js / Convex / Railway stack that keeps the deal room fast, calm, and auditable.",
      },
    ],
  },
};
