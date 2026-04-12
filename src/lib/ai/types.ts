export interface GatewayConfig {
  primaryProvider: "anthropic" | "openai";
  fallbackProvider?: "anthropic" | "openai";
  primaryModel: string;
  fallbackModel?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GatewayRequest {
  messages: GatewayMessage[];
  engineType: string;
  maxTokens?: number;
  temperature?: number;
  config?: Partial<GatewayConfig>;
}

export interface GatewayUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: "anthropic" | "openai";
  latencyMs: number;
  estimatedCost: number;
  fallbackUsed: boolean;
}

export interface GatewayResponse {
  content: string;
  usage: GatewayUsage;
}

export interface GatewayError {
  code: "provider_error" | "rate_limit" | "timeout" | "all_providers_failed";
  message: string;
  provider?: string;
  statusCode?: number;
}

export type GatewayResult =
  | { success: true; data: GatewayResponse }
  | { success: false; error: GatewayError };

/** Cost per 1M tokens (approximate) */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};
