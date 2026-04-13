import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/session";

/**
 * Convex queries + mutations for the release readiness state
 * (KIN-846).
 *
 * Auth model: every surface is ops-only (`broker` or `admin`). The
 * release checklist exposes ownership + blocker notes that are
 * explicitly internal — buyers must never see this data.
 *
 * Pure decision logic lives in `src/lib/releaseReadiness/logic.ts`
 * and is the source of truth for validation + transition rules.
 * Convex files cannot import from `src/`, so this file duplicates
 * the minimum inline logic needed. Keep the two aligned; tests in
 * `src/__tests__/lib/releaseReadiness/logic.test.ts` exercise the
 * pure module to prevent drift.
 */

// MARK: - Validators

const severityValidator = v.union(
  v.literal("p0"),
  v.literal("p1"),
  v.literal("p2")
);

const statusValidator = v.union(
  v.literal("notStarted"),
  v.literal("inProgress"),
  v.literal("blocked"),
  v.literal("atRisk"),
  v.literal("ready"),
  v.literal("deferred")
);

type ReadinessStatus =
  | "notStarted"
  | "inProgress"
  | "blocked"
  | "atRisk"
  | "ready"
  | "deferred";

/**
 * Mirror of `canTransition` from the pure module. Kept inline here
 * because Convex files cannot import from `src/`. The Vitest suite
 * on the src/ copy is authoritative — don't drift this table.
 */
const ALLOWED_TRANSITIONS: Record<ReadinessStatus, ReadinessStatus[]> = {
  notStarted: ["inProgress", "blocked", "deferred"],
  inProgress: ["atRisk", "blocked", "ready", "deferred"],
  blocked: ["inProgress", "atRisk", "deferred"],
  atRisk: ["inProgress", "blocked", "ready", "deferred"],
  ready: ["inProgress", "deferred"],
  deferred: ["notStarted", "inProgress"],
};

function canTransition(
  from: ReadinessStatus,
  to: ReadinessStatus
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Inline mirror of `isIsoDate` from `src/lib/releaseReadiness/logic.ts`.
 * Keeps Convex validation aligned with the pure module without
 * pulling a cross-package dependency.
 */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const roundTrip = parsed.toISOString().slice(0, 10);
  const inputDate = value.slice(0, 10);
  return roundTrip === inputDate;
}

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validateSharedShape(item: {
  id: string;
  title: string;
  owner: string;
  status: ReadinessStatus;
  targetDate: string;
  blockerNote?: string;
  evidenceUrl?: string;
}): void {
  if (item.id.trim() === "") {
    throw new Error("id is required");
  }
  if (item.title.trim().length < 3 || item.title.trim().length > 120) {
    throw new Error("title must be 3..120 characters");
  }
  if (item.owner.trim() === "") {
    throw new Error("owner cannot be empty or whitespace");
  }
  if (!isIsoDate(item.targetDate)) {
    throw new Error("targetDate must be an ISO-8601 date");
  }
  if (item.status === "blocked" && !normalizeOptionalString(item.blockerNote)) {
    throw new Error("blockerNote is required when status is 'blocked'");
  }
  if (item.status === "ready" && !normalizeOptionalString(item.evidenceUrl)) {
    throw new Error("evidenceUrl is required when status is 'ready'");
  }
}

function computeOverallReadiness(
  items: Array<{
    severity: "p0" | "p1" | "p2";
    status: ReadinessStatus;
  }>
):
  | { kind: "go"; total: number }
  | { kind: "atRisk"; total: number; atRiskCount: number }
  | { kind: "noGo"; total: number; blockedCount: number }
  | { kind: "empty" } {
  const active = items.filter((item) => item.status !== "deferred");
  const total = active.length;
  if (total === 0) {
    return { kind: "empty" };
  }

  const p0Blocked = active.filter(
    (item) => item.severity === "p0" && item.status === "blocked"
  );
  if (p0Blocked.length > 0) {
    return { kind: "noGo", total, blockedCount: p0Blocked.length };
  }

  const p0AtRisk = active.filter(
    (item) => item.severity === "p0" && item.status === "atRisk"
  );
  const p1Blocked = active.filter(
    (item) => item.severity === "p1" && item.status === "blocked"
  );
  if (p0AtRisk.length > 0 || p1Blocked.length > 0) {
    return {
      kind: "atRisk",
      total,
      atRiskCount: p0AtRisk.length + p1Blocked.length,
    };
  }

  return { kind: "go", total };
}

// MARK: - Create

/**
 * Insert a new readiness checklist item. Ops-only.
 *
 * Enforces:
 *   - title length 3..120
 *   - valid ISO-8601 targetDate
 *   - unique itemKey (not already taken)
 *   - blockerNote present iff status === "blocked"
 *   - evidenceUrl present iff status === "ready"
 */
export const createItem = mutation({
  args: {
    itemKey: v.string(),
    title: v.string(),
    description: v.string(),
    owner: v.string(),
    severity: severityValidator,
    status: statusValidator,
    targetDate: v.string(),
    blockerNote: v.optional(v.string()),
    evidenceUrl: v.optional(v.string()),
  },
  returns: v.id("releaseReadinessItems"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const owner = args.owner.trim();
    const title = args.title.trim();
    if (owner === "") {
      throw new Error("owner cannot be empty or whitespace");
    }
    if (title.length < 3 || title.length > 120) {
      throw new Error("title must be 3..120 characters");
    }
    if (!isIsoDate(args.targetDate)) {
      throw new Error("targetDate must be an ISO-8601 date");
    }
    if (args.status === "blocked") {
      if (!args.blockerNote || args.blockerNote.trim() === "") {
        throw new Error(
          "blockerNote is required when status is 'blocked'"
        );
      }
    }
    if (args.status === "ready") {
      if (!args.evidenceUrl || args.evidenceUrl.trim() === "") {
        throw new Error(
          "evidenceUrl is required when status is 'ready'"
        );
      }
    }

    // Enforce unique itemKey
    const existing = await ctx.db
      .query("releaseReadinessItems")
      .withIndex("by_itemKey", (q) => q.eq("itemKey", args.itemKey))
      .unique();
    if (existing) {
      throw new Error(
        `Duplicate itemKey: ${args.itemKey} already exists`
      );
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("releaseReadinessItems", {
      itemKey: args.itemKey,
      title,
      description: args.description,
      owner,
      severity: args.severity,
      status: args.status,
      targetDate: args.targetDate,
      blockerNote: normalizeOptionalString(args.blockerNote),
      evidenceUrl: normalizeOptionalString(args.evidenceUrl),
      updatedAt: now,
      updatedBy: user.email,
    });
  },
});

// MARK: - Transition

/**
 * Transition a readiness item to a new status. Ops-only.
 *
 * - `canTransition` enforces the Kanban transition graph
 * - `blockerNote` and `evidenceUrl` are enforced for blocked/ready
 *   transitions the same way `createItem` enforces them
 */
export const transitionStatus = mutation({
  args: {
    id: v.id("releaseReadinessItems"),
    nextStatus: statusValidator,
    blockerNote: v.optional(v.string()),
    evidenceUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const record = await ctx.db.get(args.id);
    if (!record) {
      throw new Error("readiness item not found");
    }
    if (!canTransition(record.status, args.nextStatus)) {
      throw new Error(
        `illegal transition ${record.status} → ${args.nextStatus}`
      );
    }

    const now = new Date().toISOString();

    if (args.nextStatus === "blocked") {
      const note = args.blockerNote ?? record.blockerNote;
      if (!note || note.trim() === "") {
        throw new Error(
          "blockerNote is required when transitioning to 'blocked'"
        );
      }
      await ctx.db.patch(args.id, {
        status: "blocked",
        blockerNote: note,
        updatedAt: now,
        updatedBy: user.email,
      });
      return null;
    }

    if (args.nextStatus === "ready") {
      const evidence = args.evidenceUrl ?? record.evidenceUrl;
      if (!evidence || evidence.trim() === "") {
        throw new Error(
          "evidenceUrl is required when transitioning to 'ready'"
        );
      }
      await ctx.db.patch(args.id, {
        status: "ready",
        evidenceUrl: evidence,
        updatedAt: now,
        updatedBy: user.email,
      });
      return null;
    }

    // All other transitions clear the blocker note if we leave the
    // blocked state — ops can re-add it later if needed. We never
    // clear evidenceUrl since a once-ready item reopened to
    // inProgress should still carry its prior evidence.
    const patch: Record<string, unknown> = {
      status: args.nextStatus,
      updatedAt: now,
      updatedBy: user.email,
    };
    if (record.status === "blocked") {
      patch.blockerNote = undefined;
    }
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

// MARK: - Update fields

/**
 * Patch mutable fields (title, description, owner, severity,
 * targetDate, evidenceUrl) on an existing item. Status transitions
 * MUST go through `transitionStatus` — this entry point intentionally
 * refuses to change `status`.
 */
export const patchFields = mutation({
  args: {
    id: v.id("releaseReadinessItems"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    owner: v.optional(v.string()),
    severity: v.optional(severityValidator),
    targetDate: v.optional(v.string()),
    evidenceUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const record = await ctx.db.get(args.id);
    if (!record) {
      throw new Error("readiness item not found");
    }

    const patch: Record<string, unknown> = {};

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length < 3 || title.length > 120) {
        throw new Error("title must be 3..120 characters");
      }
      patch.title = title;
    }
    if (args.description !== undefined) {
      patch.description = args.description;
    }
    if (args.owner !== undefined) {
      // Reject blank / whitespace-only owners — validateItem treats
      // missing owner as invalid and the ops workflow needs an
      // accountable party for every item. Codex P2 from PR #78.
      const owner = args.owner.trim();
      if (owner === "") {
        throw new Error("owner cannot be empty or whitespace");
      }
      patch.owner = owner;
    }
    if (args.severity !== undefined) {
      patch.severity = args.severity;
    }
    if (args.targetDate !== undefined) {
      if (!isIsoDate(args.targetDate)) {
        throw new Error("targetDate must be an ISO-8601 date");
      }
      patch.targetDate = args.targetDate;
    }
    if (args.evidenceUrl !== undefined) {
      // A `ready` item that loses its evidence URL would violate
      // the createItem/transitionStatus invariant. Reject clearing
      // the URL while the item is still in `ready` status.
      // Codex P1 from PR #78.
      const evidence = args.evidenceUrl.trim();
      if (evidence === "" && record.status === "ready") {
        throw new Error(
          "evidenceUrl cannot be cleared while the item is ready — transition the item off ready first"
        );
      }
      patch.evidenceUrl = evidence === "" ? undefined : evidence;
    }

    patch.updatedAt = new Date().toISOString();
    patch.updatedBy = user.email;

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

// MARK: - Queries

const itemReturnValidator = v.object({
  _id: v.id("releaseReadinessItems"),
  _creationTime: v.number(),
  itemKey: v.string(),
  title: v.string(),
  description: v.string(),
  owner: v.string(),
  severity: severityValidator,
  status: statusValidator,
  targetDate: v.string(),
  blockerNote: v.optional(v.string()),
  evidenceUrl: v.optional(v.string()),
  updatedAt: v.string(),
  updatedBy: v.string(),
});

const sharedItemValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  owner: v.string(),
  severity: severityValidator,
  status: statusValidator,
  targetDate: v.string(),
  blockerNote: v.optional(v.string()),
  evidenceUrl: v.optional(v.string()),
  updatedAt: v.string(),
  updatedBy: v.string(),
});

const overallValidator = v.union(
  v.object({
    kind: v.literal("go"),
    total: v.number(),
  }),
  v.object({
    kind: v.literal("atRisk"),
    total: v.number(),
    atRiskCount: v.number(),
  }),
  v.object({
    kind: v.literal("noGo"),
    total: v.number(),
    blockedCount: v.number(),
  }),
  v.object({
    kind: v.literal("empty"),
  })
);

function toSharedItem(record: {
  itemKey: string;
  title: string;
  description: string;
  owner: string;
  severity: "p0" | "p1" | "p2";
  status: ReadinessStatus;
  targetDate: string;
  blockerNote?: string;
  evidenceUrl?: string;
  updatedAt: string;
  updatedBy: string;
}) {
  return {
    id: record.itemKey,
    title: record.title,
    description: record.description,
    owner: record.owner,
    severity: record.severity,
    status: record.status,
    targetDate: record.targetDate,
    blockerNote: record.blockerNote,
    evidenceUrl: record.evidenceUrl,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

/**
 * List every readiness item. Ops-only.
 */
export const listAll = query({
  args: {},
  returns: v.array(itemReturnValidator),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");
    return await ctx.db.query("releaseReadinessItems").collect();
  },
});

/**
 * Shared read action for the release-readiness checklist. Returns the
 * full typed item list plus the derived overall launch verdict from
 * the same backend state so clients don't reimplement rollup logic.
 */
export const getState = query({
  args: {},
  returns: v.object({
    items: v.array(sharedItemValidator),
    overall: overallValidator,
  }),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");
    const records = await ctx.db.query("releaseReadinessItems").collect();
    const items = records.map(toSharedItem);
    return {
      items,
      overall: computeOverallReadiness(items),
    };
  },
});

/**
 * Look up a single item by its stable itemKey (the content-authored
 * identifier, not the Convex _id).
 */
export const getByKey = query({
  args: { itemKey: v.string() },
  returns: v.union(itemReturnValidator, v.null()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("releaseReadinessItems")
      .withIndex("by_itemKey", (q) => q.eq("itemKey", args.itemKey))
      .unique();
  },
});

/**
 * Shared write action for web / iOS clients. Upserts by stable item id
 * (`itemKey` in storage) and enforces the same validation + transition
 * rules as the lower-level mutations above.
 */
export const writeItem = mutation({
  args: {
    item: v.object({
      id: v.string(),
      title: v.string(),
      description: v.string(),
      owner: v.string(),
      severity: severityValidator,
      status: statusValidator,
      targetDate: v.string(),
      blockerNote: v.optional(v.string()),
      evidenceUrl: v.optional(v.string()),
    }),
  },
  returns: sharedItemValidator,
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    validateSharedShape(args.item);

    const existing = await ctx.db
      .query("releaseReadinessItems")
      .withIndex("by_itemKey", (q) => q.eq("itemKey", args.item.id))
      .unique();

    if (existing && !canTransition(existing.status, args.item.status)) {
      throw new Error(
        `illegal transition ${existing.status} → ${args.item.status}`
      );
    }

    const now = new Date().toISOString();
    const sharedItem = {
      id: args.item.id.trim(),
      title: args.item.title.trim(),
      description: args.item.description,
      owner: args.item.owner.trim(),
      severity: args.item.severity,
      status: args.item.status,
      targetDate: args.item.targetDate,
      blockerNote: normalizeOptionalString(args.item.blockerNote),
      evidenceUrl: normalizeOptionalString(args.item.evidenceUrl),
      updatedAt: now,
      updatedBy: user.email,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        itemKey: sharedItem.id,
        title: sharedItem.title,
        description: sharedItem.description,
        owner: sharedItem.owner,
        severity: sharedItem.severity,
        status: sharedItem.status,
        targetDate: sharedItem.targetDate,
        blockerNote: sharedItem.blockerNote,
        evidenceUrl: sharedItem.evidenceUrl,
        updatedAt: sharedItem.updatedAt,
        updatedBy: sharedItem.updatedBy,
      });
      return sharedItem;
    }

    await ctx.db.insert("releaseReadinessItems", {
      itemKey: sharedItem.id,
      title: sharedItem.title,
      description: sharedItem.description,
      owner: sharedItem.owner,
      severity: sharedItem.severity,
      status: sharedItem.status,
      targetDate: sharedItem.targetDate,
      blockerNote: sharedItem.blockerNote,
      evidenceUrl: sharedItem.evidenceUrl,
      updatedAt: sharedItem.updatedAt,
      updatedBy: sharedItem.updatedBy,
    });

    return sharedItem;
  },
});
