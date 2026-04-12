/**
 * convex/opsQueues.ts — KIN-798 Ops review queues backend.
 *
 * Typed Convex queries + mutations for internal review queues. Every
 * read is role-gated (broker or admin only). Every mutation writes one
 * row to `auditLog` so ops actions are auditable.
 *
 * Queue key, status, and priority are the closed sets declared on
 * `opsReviewQueueItems` in `convex/schema.ts`. The filter/sort logic is
 * duplicated at `src/lib/admin/queueFilters.ts` so tests can cover it
 * without Convex — keep the two in sync.
 */

import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { type Doc, type Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";

const queueKeyValidator = v.union(
  v.literal("intake_review"),
  v.literal("offer_review"),
  v.literal("contract_review"),
  v.literal("tour_dispute"),
  v.literal("payout_dispute"),
  v.literal("escalation"),
);

const statusValidator = v.union(
  v.literal("open"),
  v.literal("in_review"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

const priorityValidator = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

const ageBucketValidator = v.union(
  v.literal("all"),
  v.literal("last_hour"),
  v.literal("last_24h"),
  v.literal("last_week"),
  v.literal("older_than_week"),
);

const queueItemValidator = v.object({
  _id: v.id("opsReviewQueueItems"),
  _creationTime: v.number(),
  queueKey: queueKeyValidator,
  subjectType: v.string(),
  subjectId: v.string(),
  priority: priorityValidator,
  status: statusValidator,
  summary: v.string(),
  assignedTo: v.optional(v.id("users")),
  resolvedAt: v.optional(v.string()),
  resolvedBy: v.optional(v.id("users")),
  resolutionNotes: v.optional(v.string()),
  openedAt: v.string(),
  updatedAt: v.string(),
});

type QueueKey = Doc<"opsReviewQueueItems">["queueKey"];
type QueueStatus = Doc<"opsReviewQueueItems">["status"];
type QueuePriority = Doc<"opsReviewQueueItems">["priority"];

// ─── helpers ────────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function inAgeBucket(
  openedAt: string,
  bucket: "all" | "last_hour" | "last_24h" | "last_week" | "older_than_week",
  nowMs: number,
): boolean {
  if (bucket === "all") return true;
  const opened = new Date(openedAt).getTime();
  if (Number.isNaN(opened)) return false;
  const age = nowMs - opened;
  if (age < 0) return false;
  switch (bucket) {
    case "last_hour":
      return age <= HOUR_MS;
    case "last_24h":
      return age <= DAY_MS;
    case "last_week":
      return age <= WEEK_MS;
    case "older_than_week":
      return age > WEEK_MS;
  }
}

const PRIORITY_WEIGHT: Readonly<Record<QueuePriority, number>> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

async function requireInternalUser(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.role !== "broker" && user.role !== "admin") {
    throw new Error("Internal console access required");
  }
  return user;
}

async function writeAudit(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    action: string;
    entityId: Id<"opsReviewQueueItems">;
    details: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLog", {
    userId: params.userId,
    action: params.action,
    entityType: "opsReviewQueueItems",
    entityId: params.entityId,
    details: JSON.stringify(params.details),
    timestamp: new Date().toISOString(),
  });
}

// ─── queries ────────────────────────────────────────────────────────────────

/**
 * List queue items matching the given filter. `status` defaults to
 * "open" since triage always starts there; explicit "all" returns every
 * status. Results are sorted for triage: urgent first, then oldest.
 */
export const listQueueItems = query({
  args: {
    queueKey: v.optional(v.union(queueKeyValidator, v.literal("all"))),
    status: v.optional(v.union(statusValidator, v.literal("all"))),
    priority: v.optional(v.union(priorityValidator, v.literal("all"))),
    age: v.optional(ageBucketValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(queueItemValidator),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);

    const status = args.status ?? "open";
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);

    // We scan a bounded window. The schema's `by_status_and_priority`
    // index narrows the scan to the requested status when possible.
    let rows: Doc<"opsReviewQueueItems">[];
    if (status === "all") {
      rows = await ctx.db.query("opsReviewQueueItems").collect();
    } else {
      rows = await ctx.db
        .query("opsReviewQueueItems")
        .withIndex("by_status_and_priority", (q) => q.eq("status", status))
        .collect();
    }

    const nowMs = Date.now();
    const queueKey = args.queueKey ?? "all";
    const priority = args.priority ?? "all";
    const age = args.age ?? "all";

    const filtered = rows.filter((row) => {
      if (queueKey !== "all" && row.queueKey !== queueKey) return false;
      if (priority !== "all" && row.priority !== priority) return false;
      if (!inAgeBucket(row.openedAt, age, nowMs)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const w = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (w !== 0) return w;
      const tA = new Date(a.openedAt).getTime();
      const tB = new Date(b.openedAt).getTime();
      if (Number.isNaN(tA) && Number.isNaN(tB)) return 0;
      if (Number.isNaN(tA)) return 1;
      if (Number.isNaN(tB)) return -1;
      return tA - tB;
    });

    return filtered.slice(0, limit);
  },
});

/**
 * Per-queue counts by status + a top-level urgent count. Powers the
 * queue index cards and the shell topbar without fetching full rows.
 */
export const getQueueCounts = query({
  args: {},
  returns: v.object({
    byQueue: v.array(
      v.object({
        queueKey: queueKeyValidator,
        open: v.number(),
        inReview: v.number(),
        urgent: v.number(),
      }),
    ),
    totalOpen: v.number(),
    totalUrgent: v.number(),
  }),
  handler: async (ctx) => {
    await requireInternalUser(ctx);

    const openRows = await ctx.db
      .query("opsReviewQueueItems")
      .withIndex("by_status_and_priority", (q) => q.eq("status", "open"))
      .collect();
    const inReviewRows = await ctx.db
      .query("opsReviewQueueItems")
      .withIndex("by_status_and_priority", (q) => q.eq("status", "in_review"))
      .collect();

    const counts = new Map<
      QueueKey,
      { open: number; inReview: number; urgent: number }
    >();
    const bump = (key: QueueKey, bucket: "open" | "inReview") => {
      const existing = counts.get(key) ?? { open: 0, inReview: 0, urgent: 0 };
      existing[bucket]++;
      counts.set(key, existing);
    };
    for (const row of openRows) {
      bump(row.queueKey, "open");
      if (row.priority === "urgent") {
        const e = counts.get(row.queueKey)!;
        e.urgent++;
      }
    }
    for (const row of inReviewRows) bump(row.queueKey, "inReview");

    const QUEUE_ORDER: QueueKey[] = [
      "intake_review",
      "offer_review",
      "contract_review",
      "tour_dispute",
      "payout_dispute",
      "escalation",
    ];
    const byQueue = QUEUE_ORDER.map((queueKey) => ({
      queueKey,
      open: counts.get(queueKey)?.open ?? 0,
      inReview: counts.get(queueKey)?.inReview ?? 0,
      urgent: counts.get(queueKey)?.urgent ?? 0,
    }));

    return {
      byQueue,
      totalOpen: openRows.length,
      totalUrgent: openRows.filter((r) => r.priority === "urgent").length,
    };
  },
});

/** Single-row lookup for detail drawers. Role-gated. */
export const getQueueItem = query({
  args: { itemId: v.id("opsReviewQueueItems") },
  returns: v.union(queueItemValidator, v.null()),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);
    const row = await ctx.db.get(args.itemId);
    if (!row) return null;
    return row;
  },
});

// ─── mutations ──────────────────────────────────────────────────────────────

/**
 * Claim an open item for the current user and transition it to
 * `in_review`. No-op if the row is already in a terminal state.
 */
export const claimForReview = mutation({
  args: { itemId: v.id("opsReviewQueueItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const row = await ctx.db.get(args.itemId);
    if (!row) throw new Error("Queue item not found");
    if (row.status === "resolved" || row.status === "dismissed") {
      throw new Error("Cannot claim a resolved or dismissed item");
    }
    const nowIso = new Date().toISOString();
    await ctx.db.patch(args.itemId, {
      status: "in_review",
      assignedTo: user._id,
      updatedAt: nowIso,
    });
    await writeAudit(ctx, {
      userId: user._id,
      action: "ops_queue_claimed",
      entityId: args.itemId,
      details: {
        queueKey: row.queueKey,
        previousStatus: row.status,
        previousAssignedTo: row.assignedTo ?? null,
      },
    });
    return null;
  },
});

/**
 * Resolve an item. Requires a non-empty resolution note so the audit
 * trail has ops-visible context. Terminal — cannot be re-opened without
 * a new row.
 */
export const resolveItem = mutation({
  args: {
    itemId: v.id("opsReviewQueueItems"),
    notes: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const trimmed = args.notes.trim();
    if (trimmed.length === 0) {
      throw new Error("Resolution notes required");
    }
    if (trimmed.length > 2000) {
      throw new Error("Resolution notes are capped at 2000 characters");
    }
    const row = await ctx.db.get(args.itemId);
    if (!row) throw new Error("Queue item not found");
    if (row.status === "resolved" || row.status === "dismissed") {
      throw new Error("Item is already resolved or dismissed");
    }
    const nowIso = new Date().toISOString();
    await ctx.db.patch(args.itemId, {
      status: "resolved",
      resolvedAt: nowIso,
      resolvedBy: user._id,
      resolutionNotes: trimmed,
      updatedAt: nowIso,
    });
    await writeAudit(ctx, {
      userId: user._id,
      action: "ops_queue_resolved",
      entityId: args.itemId,
      details: {
        queueKey: row.queueKey,
        previousStatus: row.status,
        notesLength: trimmed.length,
      },
    });
    return null;
  },
});

/**
 * Dismiss an item — the opposite of resolve. Used when ops determined
 * the review was unnecessary (false positive). Requires a reason.
 */
export const dismissItem = mutation({
  args: {
    itemId: v.id("opsReviewQueueItems"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const trimmed = args.reason.trim();
    if (trimmed.length === 0) {
      throw new Error("Dismissal reason required");
    }
    if (trimmed.length > 2000) {
      throw new Error("Dismissal reason capped at 2000 characters");
    }
    const row = await ctx.db.get(args.itemId);
    if (!row) throw new Error("Queue item not found");
    if (row.status === "resolved" || row.status === "dismissed") {
      throw new Error("Item is already resolved or dismissed");
    }
    const nowIso = new Date().toISOString();
    await ctx.db.patch(args.itemId, {
      status: "dismissed",
      resolvedAt: nowIso,
      resolvedBy: user._id,
      resolutionNotes: trimmed,
      updatedAt: nowIso,
    });
    await writeAudit(ctx, {
      userId: user._id,
      action: "ops_queue_dismissed",
      entityId: args.itemId,
      details: {
        queueKey: row.queueKey,
        previousStatus: row.status,
        reasonLength: trimmed.length,
      },
    });
    return null;
  },
});

/**
 * Update priority on an existing item. Used when ops escalates a normal
 * item to urgent, or de-escalates a false alarm.
 */
export const updatePriority = mutation({
  args: {
    itemId: v.id("opsReviewQueueItems"),
    priority: priorityValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const row = await ctx.db.get(args.itemId);
    if (!row) throw new Error("Queue item not found");
    if (row.priority === args.priority) return null;
    const nowIso = new Date().toISOString();
    await ctx.db.patch(args.itemId, {
      priority: args.priority,
      updatedAt: nowIso,
    });
    await writeAudit(ctx, {
      userId: user._id,
      action: "ops_queue_priority_changed",
      entityId: args.itemId,
      details: {
        queueKey: row.queueKey,
        previousPriority: row.priority,
        newPriority: args.priority,
      },
    });
    return null;
  },
});
