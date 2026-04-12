import {
  type QueueKey,
  type QueuePriority,
  type QueueStatus,
  QUEUE_PRIORITY_WEIGHT,
  isQueueKey,
  isQueuePriority,
  isQueueStatus,
} from "./queueLabels";

/**
 * Pure filter + sort logic for ops review queues (KIN-798). All rules
 * live here so they can be unit-tested without spinning up Convex.
 *
 * The Convex query uses the same rules server-side — when it ships a
 * list of rows to the client, the client can re-filter client-side
 * (e.g. for toolbar UX) without issuing a new request.
 */

export type AgeBucket =
  | "all"
  | "last_hour"
  | "last_24h"
  | "last_week"
  | "older_than_week";

export const AGE_BUCKETS: readonly AgeBucket[] = [
  "all",
  "last_hour",
  "last_24h",
  "last_week",
  "older_than_week",
];

export const AGE_BUCKET_LABELS: Readonly<Record<AgeBucket, string>> = {
  all: "Any age",
  last_hour: "Last hour",
  last_24h: "Last 24 hours",
  last_week: "Last 7 days",
  older_than_week: "Older than 7 days",
};

export function isAgeBucket(value: string): value is AgeBucket {
  return (AGE_BUCKETS as readonly string[]).includes(value);
}

export interface QueueItemLike {
  queueKey: QueueKey;
  status: QueueStatus;
  priority: QueuePriority;
  openedAt: string;
}

export interface QueueFilterState {
  queueKey: QueueKey | "all";
  status: QueueStatus | "all";
  priority: QueuePriority | "all";
  age: AgeBucket;
}

export const DEFAULT_FILTER_STATE: QueueFilterState = {
  queueKey: "all",
  status: "open",
  priority: "all",
  age: "all",
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * True iff a row's `openedAt` timestamp falls inside the named age
 * bucket when evaluated against `now`. `now` is injected so tests can
 * pin a deterministic clock.
 */
export function isInAgeBucket(
  openedAt: string,
  bucket: AgeBucket,
  now: Date,
): boolean {
  if (bucket === "all") return true;
  const opened = new Date(openedAt).getTime();
  if (Number.isNaN(opened)) return false;
  const ageMs = now.getTime() - opened;
  if (ageMs < 0) return false; // future timestamps never match
  switch (bucket) {
    case "last_hour":
      return ageMs <= HOUR_MS;
    case "last_24h":
      return ageMs <= DAY_MS;
    case "last_week":
      return ageMs <= WEEK_MS;
    case "older_than_week":
      return ageMs > WEEK_MS;
  }
}

/** Apply every filter dimension to a single row. */
export function matchesFilter(
  row: QueueItemLike,
  filter: QueueFilterState,
  now: Date,
): boolean {
  if (filter.queueKey !== "all" && row.queueKey !== filter.queueKey) return false;
  if (filter.status !== "all" && row.status !== filter.status) return false;
  if (filter.priority !== "all" && row.priority !== filter.priority) return false;
  if (!isInAgeBucket(row.openedAt, filter.age, now)) return false;
  return true;
}

/** Apply filter to a full list, preserving input order for ties. */
export function filterQueueItems<T extends QueueItemLike>(
  rows: readonly T[],
  filter: QueueFilterState,
  now: Date,
): T[] {
  return rows.filter((row) => matchesFilter(row, filter, now));
}

/**
 * Sort queue items: urgent first, then oldest within the same priority.
 * Used to drive the "what should I triage next?" order consistently.
 */
export function sortQueueItemsForTriage<T extends QueueItemLike>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const weightDiff =
      QUEUE_PRIORITY_WEIGHT[a.priority] - QUEUE_PRIORITY_WEIGHT[b.priority];
    if (weightDiff !== 0) return weightDiff;
    const tA = new Date(a.openedAt).getTime();
    const tB = new Date(b.openedAt).getTime();
    if (Number.isNaN(tA) && Number.isNaN(tB)) return 0;
    if (Number.isNaN(tA)) return 1;
    if (Number.isNaN(tB)) return -1;
    return tA - tB;
  });
}

/** Group a flat list into buckets keyed by queueKey for dashboards. */
export function groupByQueueKey<T extends QueueItemLike>(
  rows: readonly T[],
): Map<QueueKey, T[]> {
  const out = new Map<QueueKey, T[]>();
  for (const row of rows) {
    const bucket = out.get(row.queueKey) ?? [];
    bucket.push(row);
    out.set(row.queueKey, bucket);
  }
  return out;
}

/**
 * Age string shown on queue rows: "2m", "3h", "4d". We go short because
 * tables pack hundreds of rows and fine-grained precision has no value
 * at triage time.
 */
export function shortAge(openedAt: string, now: Date): string {
  const opened = new Date(openedAt).getTime();
  if (Number.isNaN(opened)) return "—";
  const ageMs = Math.max(0, now.getTime() - opened);
  if (ageMs < 60 * 1000) return "now";
  if (ageMs < HOUR_MS) return `${Math.floor(ageMs / (60 * 1000))}m`;
  if (ageMs < DAY_MS) return `${Math.floor(ageMs / HOUR_MS)}h`;
  return `${Math.floor(ageMs / DAY_MS)}d`;
}

/** Parse filter state from URL search params, with strict validation. */
export function parseFilterFromSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): QueueFilterState {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      const raw = params.get(key);
      return raw ?? undefined;
    }
    const raw = params[key];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  };
  const queueKeyRaw = get("queue");
  const statusRaw = get("status");
  const priorityRaw = get("priority");
  const ageRaw = get("age");
  return {
    queueKey:
      queueKeyRaw && isQueueKey(queueKeyRaw) ? queueKeyRaw : DEFAULT_FILTER_STATE.queueKey,
    status:
      statusRaw === "all"
        ? "all"
        : statusRaw && isQueueStatus(statusRaw)
          ? statusRaw
          : DEFAULT_FILTER_STATE.status,
    priority:
      priorityRaw === "all"
        ? "all"
        : priorityRaw && isQueuePriority(priorityRaw)
          ? priorityRaw
          : DEFAULT_FILTER_STATE.priority,
    age:
      ageRaw && isAgeBucket(ageRaw) ? ageRaw : DEFAULT_FILTER_STATE.age,
  };
}

/** Serialize filter back to a plain object we can hand to Link hrefs. */
export function filterToSearchParams(
  filter: QueueFilterState,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (filter.queueKey !== DEFAULT_FILTER_STATE.queueKey) out.queue = filter.queueKey;
  if (filter.status !== DEFAULT_FILTER_STATE.status) out.status = filter.status;
  if (filter.priority !== DEFAULT_FILTER_STATE.priority) out.priority = filter.priority;
  if (filter.age !== DEFAULT_FILTER_STATE.age) out.age = filter.age;
  return out;
}
