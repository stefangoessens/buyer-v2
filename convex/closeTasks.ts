// ═══════════════════════════════════════════════════════════════════════════
// Close Tasks (KIN-867)
//
// Typed task state for the close phase. Buyers see buyer_visible tasks
// with a projected (buyer-safe) row shape; broker/admin see all tasks
// with the full internal row including internal notes and blocked
// reasons. Status transitions flow through the pure helper in
// convex/lib/closeTasks.ts so backend and tests share the same rules.
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuth, requireRole } from "./lib/session";
import {
  buildCloseTaskTransitionPatch,
  buildCloseTaskUpdatePatch,
  buildCreateCloseTask,
  type RawCloseTask,
} from "./lib/closeTasks";

/**
 * Strip internal-only fields from a task before returning it to a buyer.
 * Buyers should never see internalNotes, blockedReason, ownerUserId, or
 * contractId — even on tasks marked buyer_visible. This is the server-
 * side choke point; the frontend can further project for display but
 * must not rely on the client to strip secrets.
 */
function toBuyerSafeTask(task: Doc<"closeTasks">): Omit<
  Doc<"closeTasks">,
  "internalNotes" | "blockedReason" | "ownerUserId" | "contractId"
> {
  const {
    internalNotes: _internalNotes,
    blockedReason: _blockedReason,
    ownerUserId: _ownerUserId,
    contractId: _contractId,
    ...rest
  } = task;
  return rest;
}

// ───────────────────────────────────────────────────────────────────────────
// Validators
// ───────────────────────────────────────────────────────────────────────────

const closeTaskStatusValidator = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("blocked"),
  v.literal("canceled"),
);

const closeTaskCategoryValidator = v.union(
  v.literal("inspection"),
  v.literal("financing"),
  v.literal("title"),
  v.literal("insurance"),
  v.literal("appraisal"),
  v.literal("disclosure"),
  v.literal("walkthrough"),
  v.literal("other"),
);

const closeTaskVisibilityValidator = v.union(
  v.literal("buyer_visible"),
  v.literal("internal_only"),
);

const closeTaskOwnerRoleValidator = v.union(
  v.literal("buyer"),
  v.literal("broker"),
  v.literal("lender"),
  v.literal("title_company"),
  v.literal("inspector"),
  v.literal("other"),
);

const closeTaskRecordValidator = v.object({
  _id: v.id("closeTasks"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  contractId: v.optional(v.id("contracts")),
  title: v.string(),
  description: v.optional(v.string()),
  category: closeTaskCategoryValidator,
  status: closeTaskStatusValidator,
  visibility: closeTaskVisibilityValidator,
  ownerRole: closeTaskOwnerRoleValidator,
  ownerUserId: v.optional(v.id("users")),
  ownerDisplayName: v.optional(v.string()),
  dueDate: v.optional(v.string()),
  blockedReason: v.optional(v.string()),
  internalNotes: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  completedAt: v.optional(v.string()),
});

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * List close tasks for a deal room. Buyers see only buyer_visible rows
 * AND get the buyer-safe projection (internal fields stripped server-
 * side). Broker/admin see everything as-is. Stripping happens at the
 * boundary — not in the frontend — so a buyer calling the Convex
 * endpoint directly can never read internal notes.
 */
export const listByDealRoom = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    status: v.optional(closeTaskStatusValidator),
  },
  returns: v.array(closeTaskRecordValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Access check: buyers can only read their own deal rooms.
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];
    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return [];
    }

    const query =
      args.status !== undefined
        ? ctx.db
            .query("closeTasks")
            .withIndex("by_dealRoomId_and_status", (q) =>
              q.eq("dealRoomId", args.dealRoomId).eq("status", args.status!),
            )
        : ctx.db
            .query("closeTasks")
            .withIndex("by_dealRoomId", (q) =>
              q.eq("dealRoomId", args.dealRoomId),
            );

    const tasks = await query.collect();

    // Buyer: filter to buyer_visible AND strip internal fields at the
    // server boundary. The frontend never sees internalNotes or
    // blockedReason on any buyer query, even on rows marked visible.
    if (user.role === "buyer") {
      return tasks
        .filter((t) => t.visibility === "buyer_visible")
        .map(toBuyerSafeTask);
    }

    // Broker/admin: return raw documents for the full internal view.
    return tasks;
  },
});

/** Get a single task by id with the same visibility + projection rules. */
export const getById = query({
  args: { taskId: v.id("closeTasks") },
  returns: v.union(v.null(), closeTaskRecordValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const dealRoom = await ctx.db.get(task.dealRoomId);
    if (!dealRoom) return null;

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return null;
    }

    if (user.role === "buyer" && task.visibility !== "buyer_visible") {
      return null;
    }

    // Buyer: strip internal fields before returning.
    if (user.role === "buyer") {
      return toBuyerSafeTask(task);
    }

    return task;
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

/** Create a new close task. Broker/admin only. */
export const create = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    contractId: v.optional(v.id("contracts")),
    title: v.string(),
    description: v.optional(v.string()),
    category: closeTaskCategoryValidator,
    visibility: closeTaskVisibilityValidator,
    ownerRole: closeTaskOwnerRoleValidator,
    ownerUserId: v.optional(v.id("users")),
    ownerDisplayName: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
  },
  returns: v.id("closeTasks"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const now = new Date().toISOString();

    // Verify the deal room exists before creating a task for it.
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) {
      throw new Error("Deal room not found");
    }

    if (args.contractId) {
      const contract = await ctx.db.get(args.contractId);
      if (!contract) {
        throw new Error("Contract not found");
      }
      if (contract.dealRoomId !== args.dealRoomId) {
        throw new Error("Contract does not belong to this deal room");
      }
    }

    if (args.ownerUserId) {
      const owner = await ctx.db.get(args.ownerUserId);
      if (!owner) {
        throw new Error("Task owner not found");
      }
    }

    const id = await ctx.db.insert(
      "closeTasks",
      buildCreateCloseTask(
        {
          dealRoomId: args.dealRoomId as unknown as string,
          contractId: args.contractId as unknown as string | undefined,
          title: args.title,
          description: args.description,
          category: args.category,
          visibility: args.visibility,
          ownerRole: args.ownerRole,
          ownerUserId: args.ownerUserId as unknown as string | undefined,
          ownerDisplayName: args.ownerDisplayName,
          dueDate: args.dueDate,
          internalNotes: args.internalNotes,
        },
        now,
      ) as Omit<Doc<"closeTasks">, "_id" | "_creationTime">,
    );

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_created",
      entityType: "closeTasks",
      entityId: id,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        category: args.category,
        ownerRole: args.ownerRole,
      }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Transition a task status. Runs the pure validator so invalid
 * transitions throw with a clear error before any DB write happens.
 */
export const transitionStatus = mutation({
  args: {
    taskId: v.id("closeTasks"),
    newStatus: closeTaskStatusValidator,
    blockedReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const now = new Date().toISOString();

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    await ctx.db.patch(
      args.taskId,
      buildCloseTaskTransitionPatch(
        task as unknown as RawCloseTask,
        {
          newStatus: args.newStatus,
          blockedReason: args.blockedReason,
        },
        now,
      ) as Partial<Doc<"closeTasks">>,
    );

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_transitioned",
      entityType: "closeTasks",
      entityId: args.taskId,
      details: JSON.stringify({
        from: task.status,
        to: args.newStatus,
        blockedReason: args.blockedReason,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Update mutable fields on a task: title, description, dueDate,
 * owner assignment, and internalNotes. Visibility and category are
 * intentionally immutable post-creation — if you need to change them,
 * create a new task.
 */
export const update = mutation({
  args: {
    taskId: v.id("closeTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    ownerRole: v.optional(closeTaskOwnerRoleValidator),
    ownerUserId: v.optional(v.id("users")),
    ownerDisplayName: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const now = new Date().toISOString();

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (args.ownerUserId) {
      const owner = await ctx.db.get(args.ownerUserId);
      if (!owner) {
        throw new Error("Task owner not found");
      }
    }

    const { changedFields, patch } = buildCloseTaskUpdatePatch(
      task as unknown as RawCloseTask,
      {
        title: args.title,
        description: args.description,
        dueDate: args.dueDate,
        ownerRole: args.ownerRole,
        ownerUserId: args.ownerUserId as unknown as string | undefined,
        ownerDisplayName: args.ownerDisplayName,
        internalNotes: args.internalNotes,
      },
      now,
    );

    if (changedFields.length === 0) return null;

    await ctx.db.patch(args.taskId, patch as Partial<Doc<"closeTasks">>);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_updated",
      entityType: "closeTasks",
      entityId: args.taskId,
      details: JSON.stringify({ changed: changedFields }),
      timestamp: now,
    });

    return null;
  },
});
