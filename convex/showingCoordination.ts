/**
 * Showing coordination workspace — Convex module (KIN-803).
 *
 * Backend queries + mutations for the internal ops workspace that
 * triages and advances tour requests. Consumes the tourRequests table
 * from KIN-802 and adds:
 *   - Queue views with filters (by status, agent, age, prerequisite
 *     failures) and stale detection
 *   - Bucket composition (incoming / blocked / assigned / confirmed /
 *     stale) for the canonical ops surface
 *   - Internal coordinator notes mutations (hidden from buyers)
 *
 * The pure filter logic is in `src/lib/tours/coordinationFilters.ts` —
 * this module mirrors the essential helpers inline to keep Convex
 * self-contained.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Doc } from "./_generated/dataModel";

// ═══ Inline filter helpers (mirror src/lib/tours/coordinationFilters.ts) ═══

type TourRequest = Doc<"tourRequests">;

const STALE_THRESHOLDS_HOURS = {
  submitted: 24,
  blocked: 48,
  assigned: 12,
};

function isStaleInternal(request: TourRequest, nowIso: string): boolean {
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) return false;
  const threshold = (h: number) => h * 60 * 60 * 1000;

  if (request.status === "submitted") {
    const refMs = Date.parse(request.submittedAt ?? request.createdAt);
    if (Number.isNaN(refMs)) return false;
    return nowMs - refMs > threshold(STALE_THRESHOLDS_HOURS.submitted);
  }
  if (request.status === "blocked") {
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

function detectPrereqFailuresInternal(
  request: TourRequest,
  nowIso: string,
): string[] {
  const failures: string[] = [];
  const snap = request.agreementStateSnapshot;
  if (
    (snap.type !== "tour_pass" && snap.type !== "full_representation") ||
    snap.status !== "signed"
  ) {
    failures.push("missing_agreement");
  }
  if (
    request.status === "submitted" &&
    !request.agentId &&
    isStaleInternal(request, nowIso)
  ) {
    failures.push("no_agent_coverage");
  }
  if (request.status === "submitted" && isStaleInternal(request, nowIso)) {
    failures.push("stale_submission");
  }
  if (request.status === "blocked" && isStaleInternal(request, nowIso)) {
    failures.push("stale_blocked");
  }
  if (request.status === "assigned" && isStaleInternal(request, nowIso)) {
    failures.push("stale_assigned");
  }
  return failures;
}

const ACTIVE_STATUSES: Array<TourRequest["status"]> = [
  "submitted",
  "blocked",
  "assigned",
  "confirmed",
];

// ═══ Auth helper ═══

async function requireInternalUser(
  ctx: { auth: unknown; db: unknown } & Parameters<typeof requireAuth>[0],
): Promise<Doc<"users">> {
  const user = await requireAuth(ctx);
  if (user.role !== "broker" && user.role !== "admin") {
    throw new Error("Showing coordination is internal — broker/admin only");
  }
  return user;
}

// ═══ Queries ═══

/**
 * Bucketize the active queue into incoming / blocked / assigned /
 * confirmed / stale for the ops workspace. Broker/admin only.
 */
export const getQueueBuckets = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireInternalUser(ctx);

    // Fetch all non-terminal tour requests. In production this could be
    // paginated or bounded by a date window; for now we expect the
    // active queue to stay small (< a few hundred rows).
    const all = await ctx.db.query("tourRequests").collect();
    const active = all.filter((r) => ACTIVE_STATUSES.includes(r.status));

    const nowIso = new Date().toISOString();
    const incoming: TourRequest[] = [];
    const blocked: TourRequest[] = [];
    const assigned: TourRequest[] = [];
    const confirmed: TourRequest[] = [];
    const stale: TourRequest[] = [];

    for (const r of active) {
      if (isStaleInternal(r, nowIso)) stale.push(r);

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
      totalActive:
        incoming.length + blocked.length + assigned.length + confirmed.length,
      generatedAt: nowIso,
    };
  },
});

/**
 * List requests with filters. Used by the detail search view where
 * ops can query across all statuses, agents, ages, and prereq states.
 */
export const listFiltered = query({
  args: {
    statuses: v.optional(
      v.array(
        v.union(
          v.literal("draft"),
          v.literal("submitted"),
          v.literal("blocked"),
          v.literal("assigned"),
          v.literal("confirmed"),
          v.literal("completed"),
          v.literal("canceled"),
          v.literal("failed"),
        ),
      ),
    ),
    agentId: v.optional(v.id("users")),
    unassignedOnly: v.optional(v.boolean()),
    minAgeHours: v.optional(v.number()),
    maxAgeHours: v.optional(v.number()),
    hasPrerequisiteFailure: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);

    const all = await ctx.db.query("tourRequests").collect();
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);

    const statusSet =
      args.statuses && args.statuses.length > 0
        ? new Set(args.statuses)
        : new Set(ACTIVE_STATUSES);

    const filtered = all.filter((r) => {
      if (!statusSet.has(r.status)) return false;
      if (args.unassignedOnly && r.agentId) return false;
      if (args.agentId && r.agentId !== args.agentId) return false;

      if (typeof args.minAgeHours === "number") {
        const createdMs = Date.parse(r.createdAt);
        if (Number.isNaN(createdMs)) return false;
        if (nowMs - createdMs < args.minAgeHours * 60 * 60 * 1000) return false;
      }
      if (typeof args.maxAgeHours === "number") {
        const createdMs = Date.parse(r.createdAt);
        if (Number.isNaN(createdMs)) return false;
        if (nowMs - createdMs > args.maxAgeHours * 60 * 60 * 1000) return false;
      }

      if (args.hasPrerequisiteFailure) {
        const failures = detectPrereqFailuresInternal(r, nowIso);
        if (failures.length === 0) return false;
      }

      return true;
    });

    // Sort: stale first, then oldest createdAt first
    const sorted = filtered.sort((a, b) => {
      const aStale = isStaleInternal(a, nowIso) ? 1 : 0;
      const bStale = isStaleInternal(b, nowIso) ? 1 : 0;
      if (aStale !== bStale) return bStale - aStale;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const limit = args.limit ?? 100;
    return sorted.slice(0, limit);
  },
});

/**
 * Get a single request with its prerequisite failure analysis.
 * Used by the detail view so ops can see what's wrong in one query.
 */
export const getWithPrereqAnalysis = query({
  args: { requestId: v.id("tourRequests") },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) return null;

    const nowIso = new Date().toISOString();
    return {
      request,
      prerequisiteFailures: detectPrereqFailuresInternal(request, nowIso),
      isStale: isStaleInternal(request, nowIso),
      analyzedAt: nowIso,
    };
  },
});

/**
 * List all coordinator notes for a tour request, newest first.
 * Broker/admin only — these are internal-only notes.
 */
export const listCoordinatorNotes = query({
  args: { requestId: v.id("tourRequests") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);

    const notes = await ctx.db
      .query("showingCoordinatorNotes")
      .withIndex("by_tourRequestId", (q) => q.eq("tourRequestId", args.requestId))
      .collect();

    return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

// ═══ Mutations ═══

/**
 * Add a coordinator note to a tour request. Notes are internal-only and
 * never surfaced to buyers. Used to capture broker triage context and
 * hand-offs between coordinators.
 */
export const addCoordinatorNote = mutation({
  args: {
    tourRequestId: v.id("tourRequests"),
    body: v.string(),
    category: v.optional(
      v.union(
        v.literal("triage"),
        v.literal("coverage"),
        v.literal("handoff"),
        v.literal("escalation"),
        v.literal("other"),
      ),
    ),
  },
  returns: v.id("showingCoordinatorNotes"),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);

    const request = await ctx.db.get(args.tourRequestId);
    if (!request) throw new Error("Tour request not found");

    const body = args.body.trim();
    if (body.length === 0) {
      throw new Error("Coordinator note body cannot be empty");
    }
    if (body.length > 4000) {
      throw new Error("Coordinator note must be ≤4000 characters");
    }

    const now = new Date().toISOString();
    const id = await ctx.db.insert("showingCoordinatorNotes", {
      tourRequestId: args.tourRequestId,
      dealRoomId: request.dealRoomId,
      authorId: user._id,
      authorRole: user.role,
      category: args.category ?? "other",
      body,
      createdAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "showing_coordinator_note_added",
      entityType: "showingCoordinatorNotes",
      entityId: id,
      details: JSON.stringify({
        tourRequestId: args.tourRequestId,
        category: args.category ?? "other",
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Bulk-escalate a set of stale/blocked requests. Broker/admin only.
 * Records each escalation as an auditLog row and (optionally) adds a
 * coordinator note summarizing the reason.
 */
export const escalateBatch = mutation({
  args: {
    requestIds: v.array(v.id("tourRequests")),
    escalationReason: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);

    if (args.requestIds.length === 0) return 0;
    if (args.requestIds.length > 100) {
      throw new Error("Batch size limited to 100 requests");
    }

    const now = new Date().toISOString();
    let escalated = 0;
    for (const requestId of args.requestIds) {
      const request = await ctx.db.get(requestId);
      if (!request) continue;

      // Only escalate active requests
      if (!ACTIVE_STATUSES.includes(request.status)) continue;

      await ctx.db.insert("showingCoordinatorNotes", {
        tourRequestId: requestId,
        dealRoomId: request.dealRoomId,
        authorId: user._id,
        authorRole: user.role,
        category: "escalation",
        body: `Escalated: ${args.escalationReason}`,
        createdAt: now,
      });

      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "showing_request_escalated",
        entityType: "tourRequests",
        entityId: requestId,
        details: JSON.stringify({ reason: args.escalationReason }),
        timestamp: now,
      });

      escalated++;
    }

    return escalated;
  },
});
