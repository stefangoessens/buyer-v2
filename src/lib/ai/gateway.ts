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

async function callWithTimeout(
  provider: "anthropic" | "openai",
  model: string,
  messages: GatewayRequest["messages"],
  maxTokens: number,
  temperature: number,
  timeoutMs: number
) {
  const call = provider === "anthropic"
    ? callAnthropic(messages, model, maxTokens, temperature)
    : callOpenAI(messages, model, maxTokens, temperature);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
  );

  return Promise.race([call, timeout]);
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
  const timeoutMs = config.timeoutMs ?? 30000;
  const maxRetries = config.maxRetries ?? 1;

  // Try primary provider with retries
  let lastPrimaryError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await callWithTimeout(
        config.primaryProvider,
        config.primaryModel,
        request.messages,
        maxTokens,
        temperature,
        timeoutMs
      );
      return { success: true, data: response };
    } catch (err) {
      lastPrimaryError = err;
      if (!isRetryableError(err) || attempt === maxRetries) break;
    }
  }

  // If no fallback configured, fail
  if (!config.fallbackProvider || !config.fallbackModel) {
    return {
      success: false,
      error: {
        code: "provider_error",
        message: lastPrimaryError instanceof Error ? lastPrimaryError.message : "Unknown error",
        provider: config.primaryProvider,
      },
    };
  }

  // Try fallback provider
  try {
    const response = await callWithTimeout(
      config.fallbackProvider,
      config.fallbackModel,
      request.messages,
      maxTokens,
      temperature,
      timeoutMs
    );
    response.usage.fallbackUsed = true;
    return { success: true, data: response };
  } catch (fallbackError) {
    return {
      success: false,
      error: {
        code: "all_providers_failed",
        message: `Primary (${config.primaryProvider}): ${lastPrimaryError instanceof Error ? lastPrimaryError.message : "unknown"}. Fallback (${config.fallbackProvider}): ${fallbackError instanceof Error ? fallbackError.message : "unknown"}`,
      },
    };
  }
}

export { DEFAULT_CONFIG, ENGINE_CONFIGS };
