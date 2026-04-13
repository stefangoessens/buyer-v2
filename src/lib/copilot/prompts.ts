import {
  DEFAULT_PROMPT_REGISTRY_ENTRIES,
  getPromptVersionRef,
} from "../../../packages/shared/src/prompt-registry";
import type { CopilotIntent } from "./intents";

export interface CopilotPromptTemplate {
  id: string;
  intent: CopilotIntent | "classifier" | "global";
  purpose: "classify" | "respond" | "guard";
  systemPrompt: string;
  userTemplate: string;
}

function getCopilotEntry(promptKey: string) {
  const entry = DEFAULT_PROMPT_REGISTRY_ENTRIES.find(
    (candidate) =>
      candidate.engineType === "copilot" && candidate.promptKey === promptKey,
  );
  if (!entry) {
    throw new Error(`Missing copilot prompt registry entry: ${promptKey}`);
  }
  return entry;
}

const CLASSIFIER_ENTRY = getCopilotEntry("classifier");
const GUARDED_GENERAL_ENTRY = getCopilotEntry("guarded_general");
const RESPONSE_PRICING_ENTRY = getCopilotEntry("response_pricing");
const RESPONSE_COMPS_ENTRY = getCopilotEntry("response_comps");
const RESPONSE_COSTS_ENTRY = getCopilotEntry("response_costs");
const RESPONSE_LEVERAGE_ENTRY = getCopilotEntry("response_leverage");
const RESPONSE_OFFER_ENTRY = getCopilotEntry("response_offer");

export const COPILOT_CLASSIFIER_SYSTEM = CLASSIFIER_ENTRY.systemPrompt ?? "";
export const COPILOT_GUARDED_GENERAL_SYSTEM =
  GUARDED_GENERAL_ENTRY.systemPrompt ?? "";
export const COPILOT_RESPONSE_SYSTEM =
  RESPONSE_PRICING_ENTRY.systemPrompt ?? "";

export const COPILOT_PROMPT_VERSION_REFS = {
  classifier: getPromptVersionRef("copilot", "classifier"),
  guardedGeneral: getPromptVersionRef("copilot", "guarded_general"),
  responsePricing: getPromptVersionRef("copilot", "response_pricing"),
  responseComps: getPromptVersionRef("copilot", "response_comps"),
  responseCosts: getPromptVersionRef("copilot", "response_costs"),
  responseLeverage: getPromptVersionRef("copilot", "response_leverage"),
  responseOffer: getPromptVersionRef("copilot", "response_offer"),
} as const;

export const COPILOT_PROMPTS: ReadonlyArray<CopilotPromptTemplate> = [
  {
    id: `copilot_classifier_${COPILOT_PROMPT_VERSION_REFS.classifier.version}`,
    intent: "classifier",
    purpose: "classify",
    systemPrompt: COPILOT_CLASSIFIER_SYSTEM,
    userTemplate: CLASSIFIER_ENTRY.prompt,
  },
  {
    id: `copilot_guarded_general_${COPILOT_PROMPT_VERSION_REFS.guardedGeneral.version}`,
    intent: "other",
    purpose: "guard",
    systemPrompt: COPILOT_GUARDED_GENERAL_SYSTEM,
    userTemplate: GUARDED_GENERAL_ENTRY.prompt,
  },
  {
    id: `copilot_response_pricing_${COPILOT_PROMPT_VERSION_REFS.responsePricing.version}`,
    intent: "pricing",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate: RESPONSE_PRICING_ENTRY.prompt,
  },
  {
    id: `copilot_response_comps_${COPILOT_PROMPT_VERSION_REFS.responseComps.version}`,
    intent: "comps",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate: RESPONSE_COMPS_ENTRY.prompt,
  },
  {
    id: `copilot_response_costs_${COPILOT_PROMPT_VERSION_REFS.responseCosts.version}`,
    intent: "costs",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate: RESPONSE_COSTS_ENTRY.prompt,
  },
  {
    id: `copilot_response_leverage_${COPILOT_PROMPT_VERSION_REFS.responseLeverage.version}`,
    intent: "leverage",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate: RESPONSE_LEVERAGE_ENTRY.prompt,
  },
  {
    id: `copilot_response_offer_${COPILOT_PROMPT_VERSION_REFS.responseOffer.version}`,
    intent: "offer",
    purpose: "respond",
    systemPrompt: COPILOT_RESPONSE_SYSTEM,
    userTemplate: RESPONSE_OFFER_ENTRY.prompt,
  },
];

export const COPILOT_PROMPTS_BY_INTENT: ReadonlyMap<string, CopilotPromptTemplate> =
  new Map(COPILOT_PROMPTS.map((p) => [p.id, p]));

const COPILOT_PROMPT_HASH_BY_ID = new Map<string, string>([
  [COPILOT_PROMPTS[0].id, COPILOT_PROMPT_VERSION_REFS.classifier.version],
  [COPILOT_PROMPTS[1].id, COPILOT_PROMPT_VERSION_REFS.guardedGeneral.version],
  [COPILOT_PROMPTS[2].id, COPILOT_PROMPT_VERSION_REFS.responsePricing.version],
  [COPILOT_PROMPTS[3].id, COPILOT_PROMPT_VERSION_REFS.responseComps.version],
  [COPILOT_PROMPTS[4].id, COPILOT_PROMPT_VERSION_REFS.responseCosts.version],
  [COPILOT_PROMPTS[5].id, COPILOT_PROMPT_VERSION_REFS.responseLeverage.version],
  [COPILOT_PROMPTS[6].id, COPILOT_PROMPT_VERSION_REFS.responseOffer.version],
]);

export function hashPrompt(template: CopilotPromptTemplate): string {
  const version = COPILOT_PROMPT_HASH_BY_ID.get(template.id);
  if (!version) {
    throw new Error(`Unknown copilot template id: ${template.id}`);
  }
  return version;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
