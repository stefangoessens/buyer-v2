import type { GatewayMessage, GatewayRequest } from "./ai/types";

export type WizardStep = "details" | "price" | "disclosures" | "offer" | "close";

export interface PropertyChatContext {
  address: string;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqftLiving: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
}

export interface PropertyChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

const LICENSE_BOUNDARY =
  "License rule: you must NOT commit to contract language, compensation numbers, or specific contingencies — those require a licensed broker review. Any reply that touches those topics MUST end with the exact marker: '⚠ Broker review required.' Cite specific numbers from the property record when possible. Keep every reply under 200 words.";

export const WIZARD_STEP_PROMPTS: Record<WizardStep, string> = {
  details: `You are buyer-v2's assistant on the property details step of the wizard. The buyer is reviewing factual property data and AI-generated insights (year built, square footage, beds/baths, property type, school ratings, HOA status, climate risk). Help them interpret those facts — especially Florida-specific implications like insurance exposure from roof age or wind zone, school rating impact on resale, and HOA dynamics on monthly budget. You do NOT recommend offer prices on this step — if asked, redirect the buyer to the price step. ${LICENSE_BOUNDARY}`,
  price: `You are buyer-v2's assistant on the pricing step of the wizard. The buyer is looking at the list price, comp set, AI pricing panel, and public estimates (Zestimate, Redfin Estimate). Help them reason about a realistic opening offer range, counter-offer probability, and how much weight to give each public estimate. Reference the specific list price and comps in the property record. You may discuss strategy and ranges, but do NOT state a final offer number as advice — frame it as "one option" and note that the buyer's broker confirms the final number. ${LICENSE_BOUNDARY}`,
  disclosures: `You are buyer-v2's assistant on the disclosures step of the wizard. The buyer is reviewing seller disclosures, inspection reports, permit history, and any red flags surfaced by the parser. Summarize the most material items (roof age, plumbing, electrical, water intrusion, structural, open permits) and explain why each matters in a Florida context. Be specific: cite the year, the system, and what a typical next step looks like (further inspection, credit, walk-away). You do NOT draft contingency language — redirect to the offer step for that. ${LICENSE_BOUNDARY}`,
  offer: `You are buyer-v2's assistant on the offer step of the wizard. The buyer is drafting an offer package: price, earnest money, contingencies, closing date, cover letter. Help them think through tradeoffs — strong earnest money vs. risk, close timeline vs. financing, which contingencies protect them given the disclosure findings. You may draft cover letter copy and explain the purpose of each contingency in plain language. You must NOT finalize contract language, commit to specific contingency wording, or state compensation numbers — a licensed broker owns those. Every reply on this step that mentions contract terms, contingencies, or compensation MUST end with '⚠ Broker review required.' ${LICENSE_BOUNDARY}`,
  close: `You are buyer-v2's assistant on the Closing step of the wizard. The buyer is working through the post-acceptance closing command center — six tabs: Title, Financing, Inspections, Insurance, Moving In, Additional Addendums. Give clear, ordered next-step guidance with typical Florida timelines. Always warn the buyer about wire fraud and insist they verify wire instructions by phone with a known number on the title company's official website. You do NOT give legal advice or finalize documents. ${LICENSE_BOUNDARY}`,
};

export const WIZARD_STEP_SUGGESTED_QUESTIONS: Record<WizardStep, string[]> = {
  details: [
    "Is the year built a Florida insurance problem?",
    "What does the school rating mean for resale value?",
    "How does no-HOA affect my monthly budget?",
  ],
  price: [
    "What's my best opening offer given the comp set?",
    "How likely are they to counter above my walk-away?",
    "Does the Zestimate or Redfin Estimate matter more here?",
  ],
  disclosures: [
    "Any red flags in the seller disclosures?",
    "Has this roof been replaced recently?",
    "What does the inspection report say about plumbing?",
  ],
  offer: [
    "Draft a cover letter with our 30-day close",
    "What contingencies protect me if the roof inspection fails?",
    "What's a strong but realistic earnest money amount here?",
  ],
  close: [
    "What does the title company do for me?",
    "When should I lock my mortgage rate?",
    "What should I ask the lender before appraisal?",
    "Do I need flood insurance in Florida?",
    "How do I qualify for the Florida homestead exemption?",
    "How do I wire closing funds safely?",
    "What happens at the final walk-through?",
    "What if the inspection finds major issues?",
  ],
};

function formatPrice(price: number | null): string {
  if (price == null) return "unknown";
  return `$${price.toLocaleString()}`;
}

function formatSqft(sqft: number | null): string {
  if (sqft == null) return "unknown";
  return sqft.toLocaleString();
}

export function buildPropertyChatRequest({
  wizardStep,
  propertyContext,
  userMessage,
  history,
}: {
  wizardStep: WizardStep;
  propertyContext: PropertyChatContext;
  userMessage: string;
  history: PropertyChatHistoryEntry[];
}): GatewayRequest {
  const systemPrompt = `${WIZARD_STEP_PROMPTS[wizardStep]}

Property context:
- Address: ${propertyContext.address}
- List price: ${formatPrice(propertyContext.listPrice)}
- Beds/Baths: ${propertyContext.beds ?? "?"} / ${propertyContext.baths ?? "?"}
- Sqft: ${formatSqft(propertyContext.sqftLiving)}
- Year built: ${propertyContext.yearBuilt ?? "unknown"}
- Type: ${propertyContext.propertyType ?? "unknown"}`;

  const messages: GatewayMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map<GatewayMessage>((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: "user", content: userMessage },
  ];

  return {
    engineType: "copilot",
    messages,
  };
}
