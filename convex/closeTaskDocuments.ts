/**
 * Close task documents — sibling table for closeTasks (KIN-1080).
 *
 * Attachments uploaded to a specific closing task. Visibility mirrors
 * closeTasks: buyer_visible rows surface to the buyer, internal_only
 * rows are broker/admin-only. Filtering is enforced server-side.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./lib/session";

const visibilityValidator = v.union(
  v.literal("buyer_visible"),
  v.literal("internal_only"),
);

const documentRecordValidator = v.object({
  _id: v.id("closeTaskDocuments"),
  _creationTime: v.number(),
  taskId: v.id("closeTasks"),
  dealRoomId: v.id("dealRooms"),
  storageId: v.id("_storage"),
  fileName: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  uploadedBy: v.id("users"),
  visibility: visibilityValidator,
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),
  // Short-lived signed download URL for the stored blob, resolved at
  // read time. Null when Convex storage can't produce a URL (blob
  // missing / expired).
  downloadUrl: v.union(v.string(), v.null()),
});

/**
 * List attachments for a task. Buyers see only buyer_visible rows and
 * every row carries a freshly-signed `downloadUrl` so the UI can render
 * a working download link without a second round-trip.
 */
export const listByTaskId = query({
  args: { taskId: v.id("closeTasks") },
  returns: v.array(documentRecordValidator),
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
      .query("closeTaskDocuments")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .collect();

    const live = rows.filter((r) => r.deletedAt === undefined);
    const scoped =
      user.role === "buyer"
        ? live.filter((r) => r.visibility === "buyer_visible")
        : live;

    const withUrls = [];
    for (const row of scoped) {
      const downloadUrl = await ctx.storage.getUrl(row.storageId);
      withUrls.push({ ...row, downloadUrl: downloadUrl ?? null });
    }
    return withUrls;
  },
});

/**
 * Generate a short-lived upload URL for a closing-task attachment.
 * Buyers can upload to their own deal room's buyer_visible tasks;
 * brokers and admins can upload anywhere. The caller uses the URL to
 * POST the blob, then calls `create` with the returned storage id.
 */
export const generateUploadUrl = mutation({
  args: { taskId: v.id("closeTasks") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    const dealRoom = await ctx.db.get(task.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const allowed =
      user.role === "admin" ||
      user.role === "broker" ||
      (dealRoom.buyerId === user._id && task.visibility === "buyer_visible");
    if (!allowed) {
      throw new Error("Not authorized to upload to this task");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** Attach an already-uploaded storage file to a close task. */
export const create = mutation({
  args: {
    taskId: v.id("closeTasks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    visibility: visibilityValidator,
  },
  returns: v.id("closeTaskDocuments"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    const dealRoom = await ctx.db.get(task.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const isBuyer = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isBuyer && !isStaff) {
      throw new Error("Not authorized to attach documents to this task");
    }
    // Buyers may only attach to buyer-visible tasks AND only as buyer-visible
    // attachments. The task-visibility gate keeps internal-only workflow
    // threads private even if a buyer were to call the mutation directly.
    if (isBuyer && !isStaff) {
      if (task.visibility !== "buyer_visible") {
        throw new Error("Buyers cannot attach documents to internal-only tasks");
      }
      if (args.visibility !== "buyer_visible") {
        throw new Error("Buyers cannot create internal-only attachments");
      }
    }

    const createdAt = Date.now();
    const id = await ctx.db.insert("closeTaskDocuments", {
      taskId: args.taskId,
      dealRoomId: task.dealRoomId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      uploadedBy: user._id,
      visibility: args.visibility,
      createdAt,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_document_attached",
      entityType: "closeTaskDocuments",
      entityId: id,
      details: JSON.stringify({
        taskId: args.taskId,
        fileName: args.fileName,
        visibility: args.visibility,
      }),
      timestamp: new Date(createdAt).toISOString(),
    });

    return id;
  },
});

/** Soft-delete an attachment. Broker/admin only. */
export const remove = mutation({
  args: { documentId: v.id("closeTaskDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    const now = Date.now();
    await ctx.db.patch(args.documentId, { deletedAt: now });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "close_task_document_removed",
      entityType: "closeTaskDocuments",
      entityId: args.documentId,
      details: JSON.stringify({
        taskId: doc.taskId,
        fileName: doc.fileName,
      }),
      timestamp: new Date(now).toISOString(),
    });

    return null;
  },
});
