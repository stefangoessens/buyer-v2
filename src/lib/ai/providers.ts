import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { GatewayMessage, GatewayResponse } from "./types";
import { MODEL_COSTS } from "./types";

// Lazy-init clients — only created when first used
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model] ?? { input: 5.0, output: 15.0 };
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

export async function callAnthropic(
  messages: GatewayMessage[],
  model: string,
  maxTokens: number,
  temperature: number
): Promise<GatewayResponse> {
  const client = getAnthropicClient();
  const start = Date.now();

  // Separate system message from user/assistant messages
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemMsg?.content,
    messages: chatMsgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const latencyMs = Date.now() - start;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const content =
    response.content[0].type === "text" ? response.content[0].text : "";

  return {
    content,
    usage: {
      inputTokens,
      outputTokens,
      model,
      provider: "anthropic",
      latencyMs,
      estimatedCost: estimateCost(model, inputTokens, outputTokens),
      fallbackUsed: false,
    },
  };
}

export async function callOpenAI(
  messages: GatewayMessage[],
  model: string,
  maxTokens: number,
  temperature: number
): Promise<GatewayResponse> {
  const client = getOpenAIClient();
  const start = Date.now();

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const latencyMs = Date.now() - start;
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const content = response.choices[0]?.message?.content ?? "";

  return {
    content,
    usage: {
      inputTokens,
      outputTokens,
      model,
      provider: "openai",
      latencyMs,
      estimatedCost: estimateCost(model, inputTokens, outputTokens),
      fallbackUsed: false,
    },
  };
}
