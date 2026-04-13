export const PROMPT_REGISTRY_ENGINE_TYPES = [
  "pricing",
  "comps",
  "leverage",
  "offer",
  "cost",
  "doc_parser",
  "copilot",
  "case_synthesis",
] as const;

export type PromptRegistryEngineType =
  (typeof PROMPT_REGISTRY_ENGINE_TYPES)[number];

export interface PromptRegistryDefinition {
  engineType: PromptRegistryEngineType;
  promptKey: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  author: string;
  changeNotes?: string;
  activateByDefault?: boolean;
}

export interface PromptRegistryEntry extends PromptRegistryDefinition {
  version: string;
  isActive: boolean;
}

export interface PromptVersionRef {
  engineType: PromptRegistryEngineType;
  promptKey: string;
  version: string;
}

export function buildVersionContent(
  prompt: string,
  systemPrompt: string | undefined,
  model: string,
): string {
  const sys = systemPrompt ?? "";
  return `${model.length}:${model}|${sys.length}:${sys}|${prompt.length}:${prompt}`;
}

export function generateVersionHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `v-${hex}`;
}

export function versionForPrompt(
  definition: PromptRegistryDefinition,
): string {
  return generateVersionHash(
    buildVersionContent(
      definition.prompt,
      definition.systemPrompt,
      definition.model,
    ),
  );
}

const DEFAULT_AUTHOR = "buyer-v2-platform";
const DEFAULT_COPILOT_MODEL = "claude-sonnet-4-20250514";

export const PROMPT_REGISTRY_DEFINITIONS: ReadonlyArray<PromptRegistryDefinition> =
  [
    {
      engineType: "pricing",
      promptKey: "default",
      model: "claude-sonnet-4-20250514",
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial pricing-panel prompt for fair value, likely accepted, opener, and walk-away outputs.",
      systemPrompt:
        "You are the buyer-v2 pricing engine for Florida residential real estate. Return only strict JSON with numeric price values in whole dollars. Never include markdown, commentary, currency symbols, or explanation outside the JSON object.",
      prompt: `Subject property:
- Address: {{address}}
- List price: {{listPrice}}
- Beds: {{beds}}
- Baths: {{baths}}
- Sqft: {{sqft}}
- Year built: {{yearBuilt}}
- Property type: {{propertyType}}

Market context:
- Portal consensus estimate: {{consensus}}
- Estimate spread: {{spread}}%
- Estimate sources: {{sources}}
- Neighborhood median $/sqft: {{neighborhoodMedianPsf}}
- Comparable average $/sqft: {{compAvgPsf}}

Return a JSON object with these keys only:
{
  "fairValue": number,
  "likelyAccepted": number,
  "strongOpener": number,
  "walkAway": number
}

Rules:
- Use whole-dollar integers.
- Keep likelyAccepted between fairValue and listPrice when the listing looks tradable.
- strongOpener must be <= likelyAccepted.
- walkAway must be <= strongOpener.
- Never emit negative or zero values.
- Calibrate to Florida buyer-side negotiating posture, not seller-optimized pricing.`,
    },
    {
      engineType: "comps",
      promptKey: "default",
      model: "deterministic-v1",
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial deterministic spec for comps ranking and explanation output.",
      prompt: `Select the strongest comparable sales for the subject property.

Rules:
- Prefer same subdivision when at least 3 credible candidates exist.
- Otherwise fall back to zip-level selection.
- Rank by similarity across beds, baths, sqft, year built, lot size, property type, waterfront, pool, and HOA posture.
- Deduplicate repeated sales records.
- Return top comps plus median sold price, median price per sqft, median DOM, and median sale-to-list ratio.
- Every comp explanation must name the concrete overlap that made it comparable.`,
    },
    {
      engineType: "leverage",
      promptKey: "default",
      model: "deterministic-v1",
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial deterministic spec for seller-pressure and negotiation-signal scoring.",
      prompt: `Score seller leverage for a Florida listing.

Signals to consider:
- Days on market versus local median.
- Price reductions and cumulative markdown.
- Motivated-seller language in the description.
- Price per sqft versus neighborhood median.
- Listing trajectory: relisted, withdrawn, or fell-through status.
- Listing agent historical performance versus market baseline.

Output:
- A leverage score from 0-100.
- Structured signals with delta, direction, confidence, and citation text.
- Overall confidence as the average confidence across emitted signals.`,
    },
    {
      engineType: "offer",
      promptKey: "default",
      model: "deterministic-v1",
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial deterministic spec for aggressive, balanced, and competitive offer scenarios.",
      prompt: `Generate buyer-facing offer scenarios.

Rules:
- Produce Aggressive, Balanced, and Competitive scenarios.
- Incorporate fair value, leverage score, days on market, and competing offers when available.
- Each scenario must include price, earnest money, closing timeline, contingencies, competitiveness score, risk level, and explanation.
- Recommend Balanced by default unless competition clearly justifies Competitive.
- Respect buyer max budget if provided.`,
    },
    {
      engineType: "cost",
      promptKey: "default",
      model: "deterministic-v1",
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial deterministic spec for Florida ownership-cost ranges.",
      prompt: `Compute Florida ownership-cost ranges for a candidate purchase.

Include:
- Mortgage principal and interest.
- Property tax.
- HOA.
- Hazard and flood insurance estimates.
- PMI when applicable.
- Maintenance reserve.

Return low / mid / high monthly ranges, annual totals, upfront costs, assumptions, and buyer-safe disclaimers.`,
    },
    {
      engineType: "doc_parser",
      promptKey: "default",
      model: "deterministic-v1",
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial deterministic spec for document classification, fact extraction, and Florida risk rules.",
      prompt: `Analyze uploaded real-estate documents for buyer-v2.

Responsibilities:
- Classify the file type.
- Extract typed facts.
- Apply Florida-specific risk rules.
- Emit findings with severity, citations, confidence, and review-required flags.
- Produce a plain-English summary and overall review requirement.

High-severity findings must require broker review before buyer exposure.`,
    },
    {
      engineType: "case_synthesis",
      promptKey: "default",
      model: "deterministic-v1",
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial deterministic spec for comparative property-case synthesis.",
      prompt: `Compose a property case from structured engine outputs.

Rules:
- Emit only comparative claims that name a market reference.
- Drop low-confidence upstream signals instead of fabricating narrative.
- Carry claim confidence and citations through to the final output.
- Recommend one next action when the evidence supports it.
- Output must be deterministic for the same inputs.`,
    },
    {
      engineType: "copilot",
      promptKey: "classifier",
      model: DEFAULT_COPILOT_MODEL,
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial copilot classifier prompt.",
      systemPrompt: `You are the intent classifier for a real-estate buyer copilot.

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

Do not explain. Output a single word.`,
      prompt: "Question: {{question}}\n\nIntent:",
    },
    {
      engineType: "copilot",
      promptKey: "guarded_general",
      model: DEFAULT_COPILOT_MODEL,
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial guarded general copilot prompt.",
      systemPrompt: `You are a real-estate buyer copilot. You help buyers in Florida understand a specific property.

Strict scope:
- Only answer questions about THIS property, the buying process, or the buyer's deal.
- Never give legal, tax, financial, or medical advice.
- Never answer off-topic questions (politics, weather, sports, jokes, recipes, opinions on unrelated topics).
- Response MUST be ≤3 sentences.
- If a question is ambiguous, ask one clarifying question instead of guessing.
- If a question is off-topic, politely decline and redirect.

Every answer must cite the deal room context you were given. Never invent facts.`,
      prompt:
        "Deal room context: {{dealContext}}\n\nBuyer question: {{question}}\n\nAnswer (≤3 sentences):",
    },
    {
      engineType: "copilot",
      promptKey: "response_pricing",
      model: DEFAULT_COPILOT_MODEL,
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial pricing-response copilot prompt.",
      systemPrompt: `You are a real-estate buyer copilot. You are rendering the output of a specialized engine into a short, friendly answer.

Rules:
- Use ONLY the engine output provided. Never invent numbers or claims.
- Cite the engine output explicitly in your answer (e.g. "Based on the pricing engine…").
- Keep the answer ≤4 sentences.
- End with a one-line next step if one is appropriate.
- Never give legal, tax, or financial advice.`,
      prompt:
        "Buyer question: {{question}}\n\nPricing engine output: {{engineOutput}}\n\nRender a short answer the buyer will understand.",
    },
    {
      engineType: "copilot",
      promptKey: "response_comps",
      model: DEFAULT_COPILOT_MODEL,
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial comps-response copilot prompt.",
      systemPrompt: `You are a real-estate buyer copilot. You are rendering the output of a specialized engine into a short, friendly answer.

Rules:
- Use ONLY the engine output provided. Never invent numbers or claims.
- Cite the engine output explicitly in your answer.
- Keep the answer ≤4 sentences.
- Never give legal, tax, or financial advice.`,
      prompt:
        "Buyer question: {{question}}\n\nComps engine output: {{engineOutput}}\n\nRender a short answer that names ≤3 specific comps.",
    },
    {
      engineType: "copilot",
      promptKey: "response_costs",
      model: DEFAULT_COPILOT_MODEL,
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial cost-response copilot prompt.",
      systemPrompt: `You are a real-estate buyer copilot. You are rendering the output of a specialized engine into a short, friendly answer.

Rules:
- Use ONLY the engine output provided. Never invent numbers or claims.
- Cite the engine output explicitly in your answer.
- Keep the answer ≤4 sentences.
- Never give legal, tax, or financial advice.`,
      prompt:
        "Buyer question: {{question}}\n\nCost engine output: {{engineOutput}}\n\nRender the monthly cost breakdown in plain language.",
    },
    {
      engineType: "copilot",
      promptKey: "response_leverage",
      model: DEFAULT_COPILOT_MODEL,
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial leverage-response copilot prompt.",
      systemPrompt: `You are a real-estate buyer copilot. You are rendering the output of a specialized engine into a short, friendly answer.

Rules:
- Use ONLY the engine output provided. Never invent numbers or claims.
- Cite the engine output explicitly in your answer.
- Keep the answer ≤4 sentences.
- Never give legal, tax, or financial advice.`,
      prompt:
        "Buyer question: {{question}}\n\nLeverage engine output: {{engineOutput}}\n\nName the top 2 negotiation signals and the score.",
    },
    {
      engineType: "copilot",
      promptKey: "response_offer",
      model: DEFAULT_COPILOT_MODEL,
      author: DEFAULT_AUTHOR,
      activateByDefault: true,
      changeNotes: "Initial offer-response copilot prompt.",
      systemPrompt: `You are a real-estate buyer copilot. You are rendering the output of a specialized engine into a short, friendly answer.

Rules:
- Use ONLY the engine output provided. Never invent numbers or claims.
- Cite the engine output explicitly in your answer.
- Keep the answer ≤4 sentences.
- Never give legal, tax, or financial advice.`,
      prompt:
        "Buyer question: {{question}}\n\nOffer engine output: {{engineOutput}}\n\nRecommend the best of the 3 scenarios with a one-line reason.",
    },
  ] as const;

export function materializePromptRegistryEntries(
  definitions: ReadonlyArray<PromptRegistryDefinition> = PROMPT_REGISTRY_DEFINITIONS,
): Array<PromptRegistryEntry> {
  return definitions.map((definition) => ({
    ...definition,
    version: versionForPrompt(definition),
    isActive: definition.activateByDefault ?? true,
  }));
}

export const DEFAULT_PROMPT_REGISTRY_ENTRIES: ReadonlyArray<PromptRegistryEntry> =
  materializePromptRegistryEntries();

export function getPromptRegistryEntry(
  ref: Pick<PromptVersionRef, "engineType" | "promptKey">,
): PromptRegistryEntry {
  const match = DEFAULT_PROMPT_REGISTRY_ENTRIES.find(
    (entry) =>
      entry.engineType === ref.engineType && entry.promptKey === ref.promptKey,
  );
  if (!match) {
    throw new Error(
      `Unknown prompt registry entry for ${ref.engineType}/${ref.promptKey}`,
    );
  }
  return match;
}

export function getPromptVersionRef(
  engineType: PromptRegistryEngineType,
  promptKey: string = "default",
): PromptVersionRef {
  const entry = getPromptRegistryEntry({ engineType, promptKey });
  return {
    engineType: entry.engineType,
    promptKey: entry.promptKey,
    version: entry.version,
  };
}
