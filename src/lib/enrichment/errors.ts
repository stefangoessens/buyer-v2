import { isRetryable } from "./sources";
import type {
  EnrichmentError,
  EnrichmentErrorCode,
  EnrichmentSource,
} from "./types";

export class EnrichmentFailure extends Error {
  readonly code: EnrichmentErrorCode;
  readonly source: EnrichmentSource;
  readonly propertyId: string;
  readonly retryable: boolean;

  constructor(args: {
    code: EnrichmentErrorCode;
    source: EnrichmentSource;
    propertyId: string;
    message: string;
  }) {
    super(args.message);
    this.name = "EnrichmentFailure";
    this.code = args.code;
    this.source = args.source;
    this.propertyId = args.propertyId;
    this.retryable = isRetryable(args.code);
  }

  toResult(): EnrichmentError {
    return {
      source: this.source,
      propertyId: this.propertyId,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ENETUNREACH",
  "EAI_AGAIN",
  "EPIPE",
  "ECONNABORTED",
]);

function classifyErrorMessage(
  code: string | undefined,
  message: string,
): EnrichmentErrorCode {
  if (code && NETWORK_CODES.has(code)) return "network_error";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "timeout";
  const lower = `${message} ${code ?? ""}`.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  if (
    lower.includes("econnreset") ||
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("socket hang up")
  ) {
    return "network_error";
  }
  if (lower.includes("rate limit") || lower.includes("429")) return "rate_limited";
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
    return "unauthorized";
  }
  if (lower.includes("not found") || lower.includes("404")) return "not_found";
  return "unknown";
}

export function wrapUnknownError(
  err: unknown,
  source: EnrichmentSource,
  propertyId: string,
): EnrichmentFailure {
  if (err instanceof EnrichmentFailure) return err;
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;
    return new EnrichmentFailure({
      code: classifyErrorMessage(code, err.message),
      source,
      propertyId,
      message: err.message,
    });
  }
  return new EnrichmentFailure({
    code: "unknown",
    source,
    propertyId,
    message: typeof err === "string" ? err : "Unknown enrichment failure",
  });
}

export function httpStatusToErrorCode(status: number): EnrichmentErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status < 600) return "network_error";
  if (status >= 400 && status < 500) return "parse_error";
  return "unknown";
}
