/**
 * Response composition for the buyer copilot.
 *
 * Takes engine output + a rendered template and produces a short,
 * citation-bearing answer. Pure synchronous helper: LLM calls happen in
 * the convex action layer. This module is unit-testable with no mocks.
 */

import type { CopilotIntent } from "./intents";
import type { CopilotEngineKey } from "./router";

export interface EngineOutputRef {
  engine: CopilotEngineKey;
  engineOutputId?: string;
  modelId?: string;
  generatedAt?: string;
  confidence?: number;
  snippet: string;
}

export interface ComposedResponse {
  text: string;
  citations: string[];
  intent: CopilotIntent;
  engine: CopilotEngineKey;
  stubbed: boolean;
  requiresLlm: boolean;
}

export interface ComposeInput {
  intent: CopilotIntent;
  engine: CopilotEngineKey;
  engineRef: EngineOutputRef | null;
  questionPreview: string;
}

const MISSING_ENGINE_MESSAGES: Record<
  CopilotEngineKey,
  { intentLabel: string; next: string }
> = {
  pricing: {
    intentLabel: "pricing analysis",
    next: "Your broker will run the pricing engine shortly.",
  },
  comps: {
    intentLabel: "comp selection",
    next: "Your broker will run the comps engine shortly.",
  },
  cost: {
    intentLabel: "monthly cost breakdown",
    next: "Your broker will run the cost engine shortly.",
  },
  leverage: {
    intentLabel: "leverage analysis",
    next: "Your broker will run the leverage engine shortly.",
  },
  offer: {
    intentLabel: "offer scenarios",
    next: "Your broker will generate offer scenarios shortly.",
  },
  case_synthesis: {
    intentLabel: "case synthesis",
    next: "Case synthesis is still on the way — ask your broker directly.",
  },
  docs: {
    intentLabel: "document analysis",
    next: "Document parsing is still on the way — ask your broker directly.",
  },
  scheduling: {
    intentLabel: "tour scheduling",
    next: "Scheduling is still on the way — ask your broker directly.",
  },
  agreement: {
    intentLabel: "agreement review",
    next: "Agreement review is still on the way — ask your broker directly.",
  },
  guarded_general: {
    intentLabel: "general reply",
    next: "Ask a question about this property or the buying process.",
  },
};

export function composeStubResponse(input: ComposeInput): ComposedResponse {
  const { intent, engine } = input;
  const { intentLabel, next } = MISSING_ENGINE_MESSAGES[engine];
  return {
    intent,
    engine,
    stubbed: true,
    requiresLlm: false,
    citations: [],
    text: `I don't have ${intentLabel} for this property yet. ${next}`,
  };
}

export function composeOffTopicRefusal(question: string): ComposedResponse {
  const hint =
    question.length > 0 && question.length <= 80
      ? " "
      : " I'm scoped to this property and the buying process — ";
  return {
    intent: "other",
    engine: "guarded_general",
    stubbed: true,
    requiresLlm: false,
    citations: [],
    text: `I can only help with questions about this property and the buying process.${hint}try asking about pricing, comps, offer terms, or next steps.`,
  };
}

export function composeLlmPrompt(
  input: ComposeInput,
): { requiresLlm: true; preview: ComposedResponse } {
  const { intent, engine, engineRef, questionPreview } = input;
  const citations: string[] = [];
  if (engineRef?.engineOutputId) {
    citations.push(engineRef.engineOutputId);
  }
  const preview: ComposedResponse = {
    intent,
    engine,
    stubbed: false,
    requiresLlm: true,
    citations,
    text: `Preparing a grounded answer from the ${engine} engine…`,
  };
  const hasQuestionPreview = questionPreview.length > 0;
  if (hasQuestionPreview && preview.text.length < 160) {
    // no-op: the preview text is a short status line, we expose the
    // full LLM answer once the action returns.
  }
  return { requiresLlm: true, preview };
}

export function composeGroundedAnswer(
  input: ComposeInput,
  llmText: string,
): ComposedResponse {
  const { intent, engine, engineRef } = input;
  const citations: string[] = [];
  if (engineRef?.engineOutputId) {
    citations.push(engineRef.engineOutputId);
  }
  const cleaned = llmText.trim();
  return {
    intent,
    engine,
    stubbed: false,
    requiresLlm: false,
    citations,
    text: cleaned.length > 0
      ? cleaned
      : "I received an empty response from the engine — please try rephrasing.",
  };
}

export function hasEnoughContext(engineRef: EngineOutputRef | null): boolean {
  if (!engineRef) return false;
  if (typeof engineRef.snippet !== "string") return false;
  return engineRef.snippet.trim().length > 0;
}
