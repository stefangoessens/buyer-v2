// ═══════════════════════════════════════════════════════════════════════════
// Close Tasks (KIN-847)
//
// Typed task state for the close phase. Buyers see buyer_visible tasks
// with a projected (buyer-safe) row shape; broker/admin see all tasks
// with the full internal row including internal notes and blocked
// reasons. Status transitions flow through the pure helper in
// convex/lib/closeTasks.ts so backend and tests share the same rules.
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth, requireRole } from "./lib/session";
import { validateTransition } from "./lib/closeTasks";

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

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * List close tasks for a deal room. Buyers see only buyer_visible rows;
 * broker/admin see everything. Returns rows in their raw shape — the
 * frontend applies projection via the shared pure helper so the same
 * code path runs in both tests and production.
 */
export const listByDealRoom = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    status: v.optional(closeTaskStatusValidator),
  },
  returns: v.array(v.any()),
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

    // Filter buyer-visible only for buyer role.
    if (user.role === "buyer") {
      return tasks.filter((t) => t.visibility === "buyer_visible");
    }
    return tasks;
  },
});

/** Get a single task by id with the same visibility rules. */
export const getById = query({
  args: { taskId: v.id("closeTasks") },
  returns: v.union(v.null(), v.any()),
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

    const id = await ctx.db.insert("closeTasks", {
      dealRoomId: args.dealRoomId,
      contractId: args.contractId,
      title: args.title,
      description: args.description,
      category: args.category,
      status: "pending" as const,
      visibility: args.visibility,
      ownerRole: args.ownerRole,
      ownerUserId: args.ownerUserId,
      ownerDisplayName: args.ownerDisplayName,
      dueDate: args.dueDate,
      internalNotes: args.internalNotes,
      createdAt: now,
      updatedAt: now,
    });

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

    const result = validateTransition(task.status, args.newStatus);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    const patch: Partial<Doc<"closeTasks">> = {
      status: args.newStatus,
      updatedAt: now,
    };
    if (args.newStatus === "completed") {
      patch.completedAt = now;
    }
    if (args.newStatus === "blocked") {
      patch.blockedReason = args.blockedReason;
    }
    // Leaving blocked — clear the blocked reason.
    if (task.status === "blocked" && args.newStatus !== "blocked") {
      patch.blockedReason = undefined;
    }

    await ctx.db.patch(args.taskId, patch);

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
 * ownerDisplayName, internalNotes. Visibility and category are
 * intentionally immutable post-creation — if you need to change them,
 * create a new task.
 */
export const update = mutation({
  args: {
    taskId: v.id("closeTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    ownerDisplayName: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const now = new Date().toISOString();

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const patch: Partial<Doc<"closeTasks">> = { updatedAt: now };
    const changed: string[] = [];
    if (args.title !== undefined) {
      patch.title = args.title;
      changed.push("title");
    }
    if (args.description !== undefined) {
      patch.description = args.description;
      changed.push("description");
    }
    if (args.dueDate !== undefined) {
      patch.dueDate = args.dueDate;
      changed.push("dueDate");
    }
    if (args.ownerDisplayName !== undefined) {
      patch.ownerDisplayName = args.ownerDisplayName;
      changed.push("ownerDisplayName");
    }
    if (args.internalNotes !== undefined) {
      patch.internalNotes = args.internalNotes;
      changed.push("internalNotes");
    }

    if (changed.length === 0) return null;

    await ctx.db.patch(args.taskId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_updated",
      entityType: "closeTasks",
      entityId: args.taskId,
      details: JSON.stringify({ changed }),
      timestamp: now,
    });

    return null;
  },
});
