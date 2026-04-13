/**
 * Showing coordination filters + stale detection (KIN-803).
 *
 * Pure functions for the internal showing-coordination workspace. Given
 * a flat list of tour requests, these helpers compute:
 *   - Filtered views (by status, age, agent, geography)
 *   - Stale detection (stuck in submitted/blocked too long)
 *   - Prerequisite failure classification (missing agreement,
 *     incomplete buyer data, no coverage)
 *
 * No IO, no Convex dependencies — this is the deterministic layer the
 * Convex query handlers call into so the filter logic is unit-testable
 * without a database.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/** Minimal shape the filters operate on. Decoupled from Convex Doc. */
export interface CoordinationTourRequest {
  _id: string;
  dealRoomId: string;
  propertyId: string;
  buyerId: string;
  agentId?: string;
  status:
    | "draft"
    | "submitted"
    | "blocked"
    | "assigned"
    | "confirmed"
    | "completed"
    | "canceled"
    | "failed";
  submittedAt?: string;
  assignedAt?: string;
  createdAt: string;
  blockingReason?: string;
  agreementStateSnapshot: {
    type: "none" | "tour_pass" | "full_representation";
    status: "none" | "draft" | "sent" | "signed" | "replaced" | "canceled";
  };
}

/** Reasons a request might be flagged as missing a prerequisite. */
export const PREREQUISITE_FAILURES = [
  "missing_agreement",
  "incomplete_buyer_data",
  "no_agent_coverage",
  "stale_submission",
  "stale_blocked",
  "stale_assigned",
] as const;

export type PrerequisiteFailure = (typeof PREREQUISITE_FAILURES)[number];

/** Filters for the coordination workspace. */
export interface CoordinationFilters {
  /** Limit to these statuses. If empty, all active statuses are returned. */
  statuses?: Array<CoordinationTourRequest["status"]>;
  /** Limit to requests assigned to this agent. */
  agentId?: string;
  /** Limit to requests with no assigned agent. */
  unassignedOnly?: boolean;
  /** Limit to requests older than this many hours. */
  minAgeHours?: number;
  /** Limit to requests newer than this many hours. */
  maxAgeHours?: number;
  /** Only return requests with at least one prerequisite failure. */
  hasPrerequisiteFailure?: boolean;
}

/** The active (non-terminal) statuses by default. */
export const ACTIVE_STATUSES: Array<CoordinationTourRequest["status"]> = [
  "submitted",
  "blocked",
  "assigned",
  "confirmed",
];

/** Terminal statuses — excluded from the ops queue by default. */
export const TERMINAL_STATUSES: Array<CoordinationTourRequest["status"]> = [
  "completed",
  "canceled",
  "failed",
];

// ───────────────────────────────────────────────────────────────────────────
// Stale detection
// ───────────────────────────────────────────────────────────────────────────

/**
 * Thresholds for flagging a request as stale based on how long it's
 * been sitting in each state. Kept short because showing coordination
 * is a time-sensitive surface.
 */
export const STALE_THRESHOLDS_HOURS = {
  submitted: 24, // Broker should triage within a day
  blocked: 48, // Blockers should be resolved within 2 days
  assigned: 12, // Assigned requests should be confirmed within half a day
} as const;

/**
 * Determine whether a tour request is stale for its current status.
 * Stale means it has been in its current state longer than the threshold.
 * Uses the status-specific timestamp (submittedAt, assignedAt, or
 * createdAt fallback for blocked).
 */
export function isStale(
  request: CoordinationTourRequest,
  nowIso: string,
): boolean {
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) return false;

  const threshold = (hours: number) => hours * 60 * 60 * 1000;

  if (request.status === "submitted") {
    const refMs = Date.parse(request.submittedAt ?? request.createdAt);
    if (Number.isNaN(refMs)) return false;
    return nowMs - refMs > threshold(STALE_THRESHOLDS_HOURS.submitted);
  }
  if (request.status === "blocked") {
    // Blocked requests don't have a dedicated timestamp; use submittedAt
    // as the anchor since blocking follows submission.
    const refMs = Date.parse(request.submittedAt ?? request.createdAt);
    if (Number.isNaN(refMs)) return false;
    return nowMs - refMs > threshold(STALE_THRESHOLDS_HOURS.blocked);
  }
  if (request.status === "assigned") {
    const refMs = Date.parse(request.assignedAt ?? request.createdAt);
    if (Number.isNaN(refMs)) return false;
    return nowMs - refMs > threshold(STALE_THRESHOLDS_HOURS.assigned);
  }
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// Prerequisite failure classification
// ───────────────────────────────────────────────────────────────────────────

/**
 * Inspect a tour request and return all prerequisite failures detected.
 * A request can have multiple failures simultaneously — e.g., missing
 * agreement AND stale blocked. Each failure is a stable code the UI
 * can map to localized messaging.
 */
export function detectPrerequisiteFailures(
  request: CoordinationTourRequest,
  nowIso: string,
): PrerequisiteFailure[] {
  const failures: PrerequisiteFailure[] = [];

  // Agreement failure — snapshot doesn't show a signed tour pass or
  // full representation. Note: the submit mutation re-derives at
  // submission time, so this should only trigger if the agreement was
  // canceled AFTER submission but BEFORE triage.
  const snap = request.agreementStateSnapshot;
  if (
    (snap.type !== "tour_pass" && snap.type !== "full_representation") ||
    snap.status !== "signed"
  ) {
    failures.push("missing_agreement");
  }

  // Unassigned submitted requests without an agent are "no_agent_coverage"
  // only when they've aged past the submitted-stale threshold.
  if (
    request.status === "submitted" &&
    !request.agentId &&
    isStale(request, nowIso)
  ) {
    failures.push("no_agent_coverage");
  }

  // Stale-in-state flags
  if (request.status === "submitted" && isStale(request, nowIso)) {
    failures.push("stale_submission");
  }
  if (request.status === "blocked" && isStale(request, nowIso)) {
    failures.push("stale_blocked");
  }
  if (request.status === "assigned" && isStale(request, nowIso)) {
    failures.push("stale_assigned");
  }

  return failures;
}

// ───────────────────────────────────────────────────────────────────────────
// Filtering
// ───────────────────────────────────────────────────────────────────────────

/**
 * Apply coordination filters to a flat list of tour requests. Pure
 * function that returns a NEW array — does not mutate input.
 */
export function applyCoordinationFilters(
  requests: CoordinationTourRequest[],
  filters: CoordinationFilters,
  nowIso: string,
): CoordinationTourRequest[] {
  const nowMs = Date.parse(nowIso);

  const statusSet =
    filters.statuses && filters.statuses.length > 0
      ? new Set(filters.statuses)
      : new Set(ACTIVE_STATUSES);

  return requests.filter((r) => {
    if (!statusSet.has(r.status)) return false;

    if (filters.unassignedOnly && r.agentId) return false;
    if (filters.agentId && r.agentId !== filters.agentId) return false;

    // Age filters based on createdAt
    if (
      typeof filters.minAgeHours === "number" &&
      !Number.isNaN(nowMs)
    ) {
      const createdMs = Date.parse(r.createdAt);
      if (Number.isNaN(createdMs)) return false;
      const ageMs = nowMs - createdMs;
      if (ageMs < filters.minAgeHours * 60 * 60 * 1000) return false;
    }
    if (
      typeof filters.maxAgeHours === "number" &&
      !Number.isNaN(nowMs)
    ) {
      const createdMs = Date.parse(r.createdAt);
      if (Number.isNaN(createdMs)) return false;
      const ageMs = nowMs - createdMs;
      if (ageMs > filters.maxAgeHours * 60 * 60 * 1000) return false;
    }

    if (filters.hasPrerequisiteFailure) {
      const failures = detectPrerequisiteFailures(r, nowIso);
      if (failures.length === 0) return false;
    }

    return true;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Queue composition helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Group filtered requests into the canonical queue buckets the ops UI
 * renders:
 *   - incoming: submitted + no agent
 *   - blocked: status = "blocked"
 *   - assigned: status = "assigned"
 *   - confirmed: status = "confirmed"
 *   - stale: any status, but past the stale threshold
 */
export interface CoordinationQueueBuckets {
  incoming: CoordinationTourRequest[];
  blocked: CoordinationTourRequest[];
  assigned: CoordinationTourRequest[];
  confirmed: CoordinationTourRequest[];
  stale: CoordinationTourRequest[];
  totalActive: number;
}

export function bucketizeQueue(
  requests: CoordinationTourRequest[],
  nowIso: string,
): CoordinationQueueBuckets {
  const incoming: CoordinationTourRequest[] = [];
  const blocked: CoordinationTourRequest[] = [];
  const assigned: CoordinationTourRequest[] = [];
  const confirmed: CoordinationTourRequest[] = [];
  const stale: CoordinationTourRequest[] = [];

  for (const r of requests) {
    if (TERMINAL_STATUSES.includes(r.status)) continue;

    if (isStale(r, nowIso)) stale.push(r);

    if (r.status === "submitted" && !r.agentId) {
      incoming.push(r);
    } else if (r.status === "blocked") {
      blocked.push(r);
    } else if (r.status === "assigned") {
      assigned.push(r);
    } else if (r.status === "confirmed") {
      confirmed.push(r);
    }
  }

  return {
    incoming,
    blocked,
    assigned,
    confirmed,
    stale,
    totalActive: incoming.length + blocked.length + assigned.length + confirmed.length,
  };
}

/**
 * Sort requests by coordination priority: stale first, then oldest
 * createdAt first. Used by the queue view to surface the most urgent
 * items at the top.
 */
export function sortByCoordinationPriority(
  requests: CoordinationTourRequest[],
  nowIso: string,
): CoordinationTourRequest[] {
  return [...requests].sort((a, b) => {
    const aStale = isStale(a, nowIso) ? 1 : 0;
    const bStale = isStale(b, nowIso) ? 1 : 0;
    if (aStale !== bStale) return bStale - aStale; // stale first
    // Then oldest createdAt first
    return a.createdAt.localeCompare(b.createdAt);
  });
}
