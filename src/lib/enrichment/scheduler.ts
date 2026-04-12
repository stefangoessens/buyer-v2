import { isFresh, sortedSources } from "./sources";
import {
  SOURCE_MAX_ATTEMPTS,
  SOURCE_PRIORITY,
  buildDedupeKey,
  type EnrichmentSource,
} from "./types";

export interface ScheduleDecision {
  source: EnrichmentSource;
  priority: number;
  maxAttempts: number;
  dedupeKey: string;
  shouldSkip: boolean;
  skipReason?: string;
}

export interface ScheduleInput {
  propertyId: string;
  freshSources: ReadonlyMap<EnrichmentSource, { lastRefreshedAt: string }>;
  inFlightSources: ReadonlySet<EnrichmentSource>;
  forceRefresh?: boolean;
  now?: Date;
}

export function buildSchedule(input: ScheduleInput): ScheduleDecision[] {
  const now = input.now ?? new Date();
  const decisions: ScheduleDecision[] = [];

  for (const source of sortedSources()) {
    const priority = SOURCE_PRIORITY[source];
    const maxAttempts = SOURCE_MAX_ATTEMPTS[source];
    const dedupeKey = buildDedupeKey(
      input.propertyId,
      source,
      bucketHint(now),
    );

    if (input.inFlightSources.has(source)) {
      decisions.push({
        source,
        priority,
        maxAttempts,
        dedupeKey,
        shouldSkip: true,
        skipReason: "in_flight",
      });
      continue;
    }

    const cached = input.freshSources.get(source);
    if (
      !input.forceRefresh &&
      cached &&
      isFresh(cached.lastRefreshedAt, source, now)
    ) {
      decisions.push({
        source,
        priority,
        maxAttempts,
        dedupeKey,
        shouldSkip: true,
        skipReason: "fresh_cache",
      });
      continue;
    }

    decisions.push({
      source,
      priority,
      maxAttempts,
      dedupeKey,
      shouldSkip: false,
    });
  }

  return decisions;
}

export function retryDelaySeconds(attempt: number): number {
  const clamped = Math.max(0, attempt);
  const base = 10;
  const cap = 3600;
  const delay = base * Math.pow(2, clamped);
  return Math.min(delay, cap);
}

export function shouldRetry(args: {
  attempt: number;
  maxAttempts: number;
  retryable: boolean;
}): boolean {
  if (!args.retryable) return false;
  return args.attempt < args.maxAttempts;
}

function bucketHint(now: Date): string {
  // Hour-bucket keeps the dedupe key stable for retries within the same
  // hour but lets a fresh refresh request through after the bucket rolls.
  const iso = now.toISOString();
  return iso.slice(0, 13);
}
