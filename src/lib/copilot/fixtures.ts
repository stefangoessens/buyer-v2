/**
 * Intent classification fixtures for the copilot eval harness.
 *
 * The acceptance criterion for KIN-858 is ≥90% intent-routing accuracy
 * on this fixture set. The fixtures are hand-curated to cover:
 *  - Each of the 10 intents with 2–4 phrasing variants
 *  - Common buyer vocabulary (comps, DOM, flood zone, contingencies)
 *  - Edge cases: off-topic, ambiguous between intents, short phrasings
 *
 * Keep the file pure TS — no imports from Convex or the gateway so the
 * eval runner can be called from tests without any setup.
 */

import type { CopilotIntent } from "./intents";

export interface IntentFixture {
  id: string;
  question: string;
  expectedIntent: CopilotIntent;
  notes?: string;
}

export const INTENT_FIXTURES: ReadonlyArray<IntentFixture> = [
  // pricing
  {
    id: "pricing-1",
    question: "How much is this house really worth?",
    expectedIntent: "pricing",
  },
  {
    id: "pricing-2",
    question: "What's the fair value of this property?",
    expectedIntent: "pricing",
  },
  {
    id: "pricing-3",
    question: "Is the list price overpriced?",
    expectedIntent: "pricing",
  },
  {
    id: "pricing-4",
    question: "What's the Zestimate on this?",
    expectedIntent: "pricing",
  },

  // comps
  {
    id: "comps-1",
    question: "What have similar houses sold for nearby?",
    expectedIntent: "comps",
  },
  {
    id: "comps-2",
    question: "Show me the comps for this property.",
    expectedIntent: "comps",
  },
  {
    id: "comps-3",
    question: "Any recently sold comparables in the neighborhood?",
    expectedIntent: "comps",
  },

  // costs
  {
    id: "costs-1",
    question: "How much will this cost me per month?",
    expectedIntent: "costs",
  },
  {
    id: "costs-2",
    question: "What are the property taxes and HOA fees?",
    expectedIntent: "costs",
  },
  {
    id: "costs-3",
    question: "Can you break down the monthly mortgage payment?",
    expectedIntent: "costs",
  },
  {
    id: "costs-4",
    question: "What will my closing costs be?",
    expectedIntent: "costs",
  },

  // leverage
  {
    id: "leverage-1",
    question: "Why would the seller accept less than asking?",
    expectedIntent: "leverage",
  },
  {
    id: "leverage-2",
    question: "What leverage do I have on this deal?",
    expectedIntent: "leverage",
  },
  {
    id: "leverage-3",
    question: "How many days on market has this listing been?",
    expectedIntent: "leverage",
  },
  {
    id: "leverage-4",
    question: "Has the seller done any price reductions?",
    expectedIntent: "leverage",
  },

  // risks
  {
    id: "risks-1",
    question: "What are the biggest risks with this property?",
    expectedIntent: "risks",
  },
  {
    id: "risks-2",
    question: "Any red flags on this house?",
    expectedIntent: "risks",
  },
  {
    id: "risks-3",
    question: "Is this in a flood zone?",
    expectedIntent: "risks",
  },

  // documents
  {
    id: "docs-1",
    question: "What does the seller disclosure say?",
    expectedIntent: "documents",
  },
  {
    id: "docs-2",
    question: "Can I see the HOA docs?",
    expectedIntent: "documents",
  },
  {
    id: "docs-3",
    question: "Is there an inspection report I can read?",
    expectedIntent: "documents",
  },

  // offer
  {
    id: "offer-1",
    question: "How much should I offer on this house?",
    expectedIntent: "offer",
  },
  {
    id: "offer-2",
    question: "Should I waive the appraisal contingency?",
    expectedIntent: "offer",
  },
  {
    id: "offer-3",
    question: "How much earnest money is standard?",
    expectedIntent: "offer",
  },
  {
    id: "offer-4",
    question: "Am I going to end up in a bidding war?",
    expectedIntent: "offer",
  },

  // scheduling
  {
    id: "scheduling-1",
    question: "Can we tour this house on Saturday?",
    expectedIntent: "scheduling",
  },
  {
    id: "scheduling-2",
    question: "When can I see the property?",
    expectedIntent: "scheduling",
  },
  {
    id: "scheduling-3",
    question: "Is there an open house scheduled?",
    expectedIntent: "scheduling",
  },

  // agreement
  {
    id: "agreement-1",
    question: "Do I need to sign a buyer agreement?",
    expectedIntent: "agreement",
  },
  {
    id: "agreement-2",
    question: "What's a tour pass?",
    expectedIntent: "agreement",
  },
  {
    id: "agreement-3",
    question: "What am I signing in the representation agreement?",
    expectedIntent: "agreement",
  },

  // other / off-topic
  {
    id: "other-1",
    question: "What's the weather in Miami today?",
    expectedIntent: "other",
  },
  {
    id: "other-2",
    question: "Write me a poem about this house.",
    expectedIntent: "other",
  },
  {
    id: "other-3",
    question: "Who is the president of the United States?",
    expectedIntent: "other",
  },
];

export function countByExpected(): Record<CopilotIntent, number> {
  const counts: Record<CopilotIntent, number> = {
    pricing: 0,
    comps: 0,
    costs: 0,
    leverage: 0,
    risks: 0,
    documents: 0,
    offer: 0,
    scheduling: 0,
    agreement: 0,
    other: 0,
  };
  for (const f of INTENT_FIXTURES) {
    counts[f.expectedIntent]++;
  }
  return counts;
}
