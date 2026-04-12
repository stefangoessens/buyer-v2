/**
 * Display labels + ordering for ops review queues (KIN-798).
 *
 * The canonical queue keys, priorities, and statuses are defined in
 * `convex/schema.ts > opsReviewQueueItems`. This file provides the
 * matching UI strings in one place so labels stay consistent across
 * the sidebar badge, queue detail page, and row tables.
 */

export const QUEUE_KEYS = [
  "intake_review",
  "offer_review",
  "contract_review",
  "tour_dispute",
  "payout_dispute",
  "escalation",
] as const;
export type QueueKey = (typeof QUEUE_KEYS)[number];

export const QUEUE_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QUEUE_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number];

export const QUEUE_KEY_LABELS: Readonly<Record<QueueKey, string>> = {
  intake_review: "Intake review",
  offer_review: "Offer review",
  contract_review: "Contract review",
  tour_dispute: "Tour dispute",
  payout_dispute: "Payout dispute",
  escalation: "Escalation",
};

export const QUEUE_KEY_DESCRIPTIONS: Readonly<Record<QueueKey, string>> = {
  intake_review: "Ambiguous property pastes that need a human to disambiguate",
  offer_review: "Offers flagged by policy or confidence thresholds",
  contract_review: "Contract clauses or milestones that need manual verification",
  tour_dispute: "Tour or showing disputes raised by buyers or cooperating brokers",
  payout_dispute: "Showing payouts and compensation disputes needing reconciliation",
  escalation: "Anything else escalated to ops for review",
};

export const QUEUE_STATUS_LABELS: Readonly<Record<QueueStatus, string>> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const QUEUE_PRIORITY_LABELS: Readonly<Record<QueuePriority, string>> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** Sort order for priorities — urgent first, low last. Stable weights. */
export const QUEUE_PRIORITY_WEIGHT: Readonly<Record<QueuePriority, number>> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Tailwind tone classes for each priority pill. */
export const QUEUE_PRIORITY_TONE: Readonly<Record<QueuePriority, string>> = {
  urgent: "bg-error-100 text-error-700",
  high: "bg-warning-100 text-warning-700",
  normal: "bg-primary-50 text-primary-700",
  low: "bg-neutral-100 text-neutral-600",
};

/** Tailwind tone classes for each status pill. */
export const QUEUE_STATUS_TONE: Readonly<Record<QueueStatus, string>> = {
  open: "bg-warning-100 text-warning-700",
  in_review: "bg-primary-50 text-primary-700",
  resolved: "bg-success-100 text-success-700",
  dismissed: "bg-neutral-100 text-neutral-600",
};

/** Type guard for queue key strings coming in from URL params. */
export function isQueueKey(value: string): value is QueueKey {
  return (QUEUE_KEYS as readonly string[]).includes(value);
}

/** Type guard for queue status strings. */
export function isQueueStatus(value: string): value is QueueStatus {
  return (QUEUE_STATUSES as readonly string[]).includes(value);
}

/** Type guard for queue priority strings. */
export function isQueuePriority(value: string): value is QueuePriority {
  return (QUEUE_PRIORITIES as readonly string[]).includes(value);
}
