/**
 * Close task notes — sibling table for closeTasks (KIN-1080).
 *
 * Free-form comments on a closing task. Buyers can post and read
 * buyer_visible notes; brokers/admins see everything. Internal-only
 * notes are filtered at the server boundary — never rely on the
 * client to hide them.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./lib/session";

const visibilityValidator = v.union(
  v.literal("buyer_visible"),
  v.literal("internal_only"),
);

const authorRoleValidator = v.union(
  v.literal("buyer"),
  v.literal("broker"),
  v.literal("admin"),
);

const noteRecordValidator = v.object({
  _id: v.id("closeTaskNotes"),
  _creationTime: v.number(),
  taskId: v.id("closeTasks"),
  dealRoomId: v.id("dealRooms"),
  authorId: v.id("users"),
  authorRole: authorRoleValidator,
  body: v.string(),
  visibility: visibilityValidator,
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),
});

/** List notes for a task. Buyers see only buyer_visible rows. */
export const listByTaskId = query({
  args: { taskId: v.id("closeTasks") },
  returns: v.array(noteRecordValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) return [];
    const dealRoom = await ctx.db.get(task.dealRoomId);
    if (!dealRoom) return [];
    const isBuyer = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isBuyer && !isStaff) return [];

    const rows = await ctx.db
      .query("closeTaskNotes")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();

    const live = rows.filter((r) => r.deletedAt === undefined);
    if (user.role === "buyer") {
      return live.filter((r) => r.visibility === "buyer_visible");
    }
    return live;
  },
});

/** Post a note on a close task. */
export const create = mutation({
  args: {
    taskId: v.id("closeTasks"),
    body: v.string(),
    visibility: visibilityValidator,
  },
  returns: v.id("closeTaskNotes"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    const dealRoom = await ctx.db.get(task.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const isBuyer = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isBuyer && !isStaff) {
      throw new Error("Not authorized to post notes on this task");
    }
    // Buyers may only post notes on buyer-visible tasks AND only as buyer-
    // visible notes. The task-visibility gate keeps internal-only workflow
    // threads private even if a buyer were to call the mutation directly.
    if (isBuyer && !isStaff) {
      if (task.visibility !== "buyer_visible") {
        throw new Error("Buyers cannot post notes on internal-only tasks");
      }
      if (args.visibility !== "buyer_visible") {
        throw new Error("Buyers cannot post internal-only notes");
      }
    }
    if (args.body.trim().length === 0) {
      throw new Error("Note body cannot be empty");
    }

    const authorRole =
      user.role === "admin"
        ? ("admin" as const)
        : user.role === "broker"
          ? ("broker" as const)
          : ("buyer" as const);

    const createdAt = Date.now();
    const id = await ctx.db.insert("closeTaskNotes", {
      taskId: args.taskId,
      dealRoomId: task.dealRoomId,
      authorId: user._id,
      authorRole,
      body: args.body,
      visibility: args.visibility,
      createdAt,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_note_posted",
      entityType: "closeTaskNotes",
      entityId: id,
      details: JSON.stringify({
        taskId: args.taskId,
        visibility: args.visibility,
      }),
      timestamp: new Date(createdAt).toISOString(),
    });

    return id;
  },
});

/** Soft-delete a note. Broker/admin only. */
export const remove = mutation({
  args: { noteId: v.id("closeTaskNotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");

    const now = Date.now();
    await ctx.db.patch(args.noteId, { deletedAt: now });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_note_removed",
      entityType: "closeTaskNotes",
      entityId: args.noteId,
      details: JSON.stringify({ taskId: note.taskId }),
      timestamp: new Date(now).toISOString(),
    });

    return null;
  },
});
