/**
 * Browser Use fallback escalation logic (KIN-784).
 *
 * Pure deterministic rules for deciding whether a deterministic-extraction
 * failure should escalate to Browser Use. Centralizing the rules here so
 * the Convex layer, the Python worker, and tests all agree on when the
 * fallback fires.
 *
 * CORE RULE: Fallback only triggers under explicit failure conditions.
 * "Explicit" means: the extractor returned a typed error code we know
 * maps to a fallback-eligible reason, OR an operator manually requested
 * it. Unknown errors do NOT auto-escalate — they go to the failed queue
 * and wait for operator triage.
 */

import {
  type EnrichmentErrorCode,
  type FallbackReason,
  type PortalName,
  buildDedupeKey,
} from "./types";

/**
 * Result of asking "should this failure escalate to Browser Use?".
 * `eligible = false` cases carry a `reason` string for audit.
 */
export type EscalationDecision =
  | {
      eligible: true;
      fallbackReason: FallbackReason;
      /** Dedupe key to use when enqueueing the fallback job. */
      dedupeKey: string;
    }
  | {
      eligible: false;
      skipReason: string;
    };

export interface EscalationInput {
  propertyId: string;
  sourceUrl: string;
  portal: PortalName | "unknown";
  extractorErrorCode: EnrichmentErrorCode;
  /** How many fallback attempts have already been made for this property + url. */
  priorFallbackAttempts: number;
  /** Max permitted fallback attempts — usually 2. */
  maxFallbackAttempts: number;
  /** Set to true to override auto-decision for manual operator runs. */
  manualOverride?: boolean;
  /** Set to true when the portal is on our known-unsupported list. */
  unsupportedPortal?: boolean;
  now?: Date;
}

/**
 * Decide whether a given extraction failure should escalate to Browser
 * Use fallback. Pure function; caller applies the result.
 */
export function decideEscalation(input: EscalationInput): EscalationDecision {
  if (input.priorFallbackAttempts >= input.maxFallbackAttempts) {
    return {
      eligible: false,
      skipReason: "max_fallback_attempts_exceeded",
    };
  }

  if (input.manualOverride) {
    return {
      eligible: true,
      fallbackReason: "manual_override",
      dedupeKey: buildFallbackDedupeKey(
        input.propertyId,
        input.sourceUrl,
        input.priorFallbackAttempts,
        input.now,
      ),
    };
  }

  if (input.unsupportedPortal) {
    return {
      eligible: true,
      fallbackReason: "unsupported_portal",
      dedupeKey: buildFallbackDedupeKey(
        input.propertyId,
        input.sourceUrl,
        input.priorFallbackAttempts,
        input.now,
      ),
    };
  }

  const reason = errorCodeToFallbackReason(input.extractorErrorCode);
  if (!reason) {
    return {
      eligible: false,
      skipReason: `no_mapping_for_error_code:${input.extractorErrorCode}`,
    };
  }

  return {
    eligible: true,
    fallbackReason: reason,
    dedupeKey: buildFallbackDedupeKey(
      input.propertyId,
      input.sourceUrl,
      input.priorFallbackAttempts,
      input.now,
    ),
  };
}

/**
 * Map extractor error codes to fallback reasons. Returns null when the
 * error is not one we auto-escalate (e.g., `not_found`, `parse_error`
 * when unrelated to page structure). Operators can still force a run
 * via `manualOverride`.
 */
export function errorCodeToFallbackReason(
  code: EnrichmentErrorCode,
): FallbackReason | null {
  switch (code) {
    case "parse_error":
      return "parser_schema_drift";
    case "rate_limited":
    case "unauthorized":
      return "anti_bot_block";
    case "network_error":
    case "timeout":
      return "vendor_unavailable";
    case "not_found":
    case "unknown":
      return null;
    default: {
      const _exhaustive: never = code;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Dedupe key for a Browser Use fallback job. Scoped by
 * (propertyId, sourceUrl, attempt-bucket) so retries of the same failure
 * collapse into the same job within a single hour, but successive attempts
 * (prior_attempts=0 → 1 → 2) get fresh keys.
 */
export function buildFallbackDedupeKey(
  propertyId: string,
  sourceUrl: string,
  priorAttempts: number,
  now: Date = new Date(),
): string {
  const hourBucket = now.toISOString().slice(0, 13);
  const urlHash = simpleHash(sourceUrl);
  return buildDedupeKey(
    propertyId,
    "browser_use_fallback",
    `${urlHash}::${priorAttempts}::${hourBucket}`,
  );
}

/**
 * Cheap non-crypto hash. We only need a stable short string per URL so
 * two identical URLs produce the same dedupe key. FNV-1a 32-bit.
 */
function simpleHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Operator-facing labels for the skip reasons so UIs can render them
 * without reaching back into this module.
 */
export const ESCALATION_SKIP_LABELS: Record<string, string> = {
  max_fallback_attempts_exceeded:
    "Max Browser Use fallback attempts reached — escalate to manual ops",
  "no_mapping_for_error_code:not_found":
    "Extractor returned not_found — fallback will not help, triage manually",
  "no_mapping_for_error_code:unknown":
    "Extractor returned unknown error — operator review required",
};
