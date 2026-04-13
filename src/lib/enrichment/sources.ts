import {
  CRITICAL_SOURCES,
  ENRICHMENT_SOURCES,
  RETRYABLE_ERRORS,
  SOURCE_CACHE_TTL_HOURS,
  SOURCE_PRIORITY,
  type EnrichmentErrorCode,
  type EnrichmentSource,
} from "./types";

export function isCriticalSource(source: EnrichmentSource): boolean {
  return CRITICAL_SOURCES.includes(source);
}

export function isFresh(
  lastRefreshedAt: string,
  source: EnrichmentSource,
  now: Date = new Date(),
): boolean {
  const last = Date.parse(lastRefreshedAt);
  if (Number.isNaN(last)) return false;
  const ttlMs = SOURCE_CACHE_TTL_HOURS[source] * 60 * 60 * 1000;
  return now.getTime() - last < ttlMs;
}

export function sortedSources(): readonly EnrichmentSource[] {
  return [...ENRICHMENT_SOURCES].sort(
    (a, b) => SOURCE_PRIORITY[a] - SOURCE_PRIORITY[b],
  );
}

export function isRetryable(code: EnrichmentErrorCode): boolean {
  return RETRYABLE_ERRORS.includes(code);
}
