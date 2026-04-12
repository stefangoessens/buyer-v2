import type { GatewayConfig, GatewayRequest, GatewayResult } from "./types";
import { callAnthropic, callOpenAI } from "./providers";

const DEFAULT_CONFIG: GatewayConfig = {
  primaryProvider: "anthropic",
  fallbackProvider: "openai",
  primaryModel: "claude-sonnet-4-20250514",
  fallbackModel: "gpt-4o",
  maxRetries: 1,
  timeoutMs: 30000,
};

/** Per-engine config overrides */
const ENGINE_CONFIGS: Partial<Record<string, Partial<GatewayConfig>>> = {
  copilot: { primaryModel: "claude-sonnet-4-20250514", timeoutMs: 15000 },
  doc_parser: { primaryModel: "claude-sonnet-4-20250514", timeoutMs: 60000 },
};

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("rate limit") ||
      msg.includes("429") ||
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

async function callProvider(
  provider: "anthropic" | "openai",
  model: string,
  messages: GatewayRequest["messages"],
  maxTokens: number,
  temperature: number
) {
  if (provider === "anthropic") {
    return callAnthropic(messages, model, maxTokens, temperature);
  }
  return callOpenAI(messages, model, maxTokens, temperature);
}

/**
 * Send a request through the AI gateway.
 * Routes to primary provider, fails over to fallback on retryable errors.
 * Returns typed result with usage/cost tracking.
 */
export async function gateway(request: GatewayRequest): Promise<GatewayResult> {
  const engineOverrides = ENGINE_CONFIGS[request.engineType] ?? {};
  const config = { ...DEFAULT_CONFIG, ...engineOverrides, ...request.config };

  const maxTokens = request.maxTokens ?? 4096;
  const temperature = request.temperature ?? 0;

  // Try primary provider
  try {
    const response = await callProvider(
      config.primaryProvider,
      config.primaryModel,
      request.messages,
      maxTokens,
      temperature
    );
    return { success: true, data: response };
  } catch (primaryError) {
    // If not retryable or no fallback, fail immediately
    if (
      !isRetryableError(primaryError) ||
      !config.fallbackProvider ||
      !config.fallbackModel
    ) {
      return {
        success: false,
        error: {
          code: "provider_error",
          message:
            primaryError instanceof Error
              ? primaryError.message
              : "Unknown error",
          provider: config.primaryProvider,
        },
      };
    }

    // Try fallback provider
    try {
      const response = await callProvider(
        config.fallbackProvider,
        config.fallbackModel,
        request.messages,
        maxTokens,
        temperature
      );
      response.usage.fallbackUsed = true;
      return { success: true, data: response };
    } catch (fallbackError) {
      return {
        success: false,
        error: {
          code: "all_providers_failed",
          message: `Primary (${config.primaryProvider}): ${primaryError instanceof Error ? primaryError.message : "unknown"}. Fallback (${config.fallbackProvider}): ${fallbackError instanceof Error ? fallbackError.message : "unknown"}`,
        },
      };
    }
  }
}

export { DEFAULT_CONFIG, ENGINE_CONFIGS };
