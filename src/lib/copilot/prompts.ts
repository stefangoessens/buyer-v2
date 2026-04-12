/**
 * Versioned copilot prompt templates.
 *
 * Every prompt is content-hashed so the registry version lock changes any
 * time we tweak phrasing. The templates here are frozen strings — the
 * registry (convex/copilot.ts) is responsible for persisting them with a
 * version and hash for audit + rollback.
 */

import type { CopilotIntent } from "./intents";

export interface CopilotPromptTemplate {
  id: string;
  intent: CopilotIntent | "classifier" | "global";
  purpose: "classify" | "respond" | "guard";
  systemPrompt: string;
  userTemplate: string;
}

export const COPILOT_CLASSIFIER_SYSTEM = `You are the intent classifier for a real-estate buyer copilot.

Return ONLY one of: pricing, comps, costs, leverage, risks, documents, offer, scheduling, agreement, other.

Rules:
- "pricing" = price estimates, fair value, walk-away price.
- "comps" = comparable sales nearby.
- "costs" = monthly cost of ownership, taxes, insurance, HOA.
- "leverage" = why seller would accept less, negotiation signals.
- "risks" = what could go wrong, red flags, flood/wind/structural.
- "documents" = seller disclosures, inspection reports, HOA docs, surveys.
- "offer" = how to structure the offer, how much to bid, contingencies.
- "scheduling" = tours, showings, open houses.
- "agreement" = buyer representation agreements, tour passes, paperwork.
- "other" = anything off-topic or not covered above.

Do not explain. Output a single word.`;

export const COPILOT_GUARDED_GENERAL_SYSTEM = `You are a real-estate buyer copilot. You help buyers in Florida understand a specific property.

Strict scope:
- Only answer questions about THIS property, the buying process, or the buyer's deal.
- Never give legal, tax, financial, or medical advice.
- Never answer off-topic questions (politics, weather, sports, jokes, recipes, opinions on unrelated topics).
- Response MUST be ≤3 sentences.
- If a question is ambiguous, ask one clarifying question instead of guessing.
- If a question is off-topic, politely decline and redirect.

Every answer must cite the deal room context you were given. Never invent facts.`;

export const COPILOT_RESPONSE_SYSTEM = `You are a real-estate buyer copilot. You are rendering the output of a specialized engine into a short, friendly answer.

Rules:
- Use ONLY the engine output provided. Never invent numbers or claims.
- Cite the engine output explicitly in your answer (e.g. "Based on the pricing engine…").
- Keep the answer ≤4 sentences.
- End with a one-line next step if one is appropriate.
- Never give legal, tax, or financial advice.`;

export const COPILOT_PROMPTS: ReadonlyArray<CopilotPromptTemplate> = [
  {
    id: "copilot_classifier_v1",
    intent: "classifier",
    purpose: "classify",
    systemPrompt: COPILOT_CLASSIFIER_SYSTEM,
    userTemplate: "Question: {{question}}\n\nIntent:",
  },
  {
    id: "copilot_guarded_general_v1",
    intent: "other",
    purpose: "guard",
    systemPrompt: COPILOT_GUARDED_GENERAL_SYSTEM,
    userTemplate:
      "Deal room context: {{dealContext}}\n\nBuyer question: {{question}}\n\nAnswer (≤3 sentences):",
  },
  {
    id: "copilot_response_pricing_v1",
    intent: "pricing",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate:
      "Buyer question: {{question}}\n\nPricing engine output: {{engineOutput}}\n\nRender a short answer the buyer will understand.",
  },
  {
    id: "copilot_response_comps_v1",
    intent: "comps",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate:
      "Buyer question: {{question}}\n\nComps engine output: {{engineOutput}}\n\nRender a short answer that names ≤3 specific comps.",
  },
  {
    id: "copilot_response_costs_v1",
    intent: "costs",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate:
      "Buyer question: {{question}}\n\nCost engine output: {{engineOutput}}\n\nRender the monthly cost breakdown in plain language.",
  },
  {
    id: "copilot_response_leverage_v1",
    intent: "leverage",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate:
      "Buyer question: {{question}}\n\nLeverage engine output: {{engineOutput}}\n\nName the top 2 negotiation signals and the score.",
  },
  {
    id: "copilot_response_offer_v1",
    intent: "offer",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate:
      "Buyer question: {{question}}\n\nOffer engine output: {{engineOutput}}\n\nRecommend the best of the 3 scenarios with a one-line reason.",
  },
];

export const COPILOT_PROMPTS_BY_INTENT: ReadonlyMap<string, CopilotPromptTemplate> =
  new Map(COPILOT_PROMPTS.map((p) => [p.id, p]));

function djb2(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  return `v-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function hashPrompt(template: CopilotPromptTemplate): string {
  return djb2(
    `${template.systemPrompt.length}:${template.systemPrompt}|${template.userTemplate.length}:${template.userTemplate}`,
  );
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
