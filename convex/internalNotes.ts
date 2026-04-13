/**
 * convex/internalNotes.ts — KIN-808 Internal notes flow backend.
 *
 * Typed queries + mutations for internal (buyer-hidden) notes attached
 * to any subject — deal rooms, offers, contracts, tours, buyers, etc.
 *
 * Rules baked in at the mutation layer:
 *   1. Only broker and admin can write notes (requireInternalUser).
 *   2. Notes are APPEND-ONLY. Edits create a new row that references
 *      the previous one via `parentNoteId` so history is retained.
 *   3. The `visibility` field decides who can READ: `internal` =
 *      broker + admin, `broker_only` = broker + admin, `admin_only`
 *      = admin only. Buyers NEVER see any row in this table — the
 *      only way to retrieve notes is through this query and buyers
 *      fail the `requireInternalUser` guard before any row is returned.
 *   4. Notes are never deleted. `deleteNote` is not exposed — if an
 *      entry needs to be redacted, ops writes a new note with the
 *      redacted body and parentNoteId pointing to the bad entry.
 */

import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { type Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";

// ─── validators ─────────────────────────────────────────────────────────────

const visibilityValidator = v.union(
  v.literal("internal"),
  v.literal("broker_only"),
  v.literal("admin_only"),
);

const noteValidator = v.object({
  _id: v.id("internalNotes"),
  _creationTime: v.number(),
  subjectType: v.string(),
  subjectId: v.string(),
  body: v.string(),
  authorId: v.id("users"),
  visibility: visibilityValidator,
  parentNoteId: v.optional(v.id("internalNotes")),
  pinned: v.optional(v.boolean()),
  createdAt: v.string(),
});

// ─── helpers ────────────────────────────────────────────────────────────────

const MIN_BODY = 1;
const MAX_BODY = 5000;

async function requireInternalUser(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.role !== "broker" && user.role !== "admin") {
    throw new Error("Internal console access required");
  }
  return user;
}

function canRead(
  role: "broker" | "admin",
  visibility: "internal" | "broker_only" | "admin_only",
): boolean {
  if (visibility === "admin_only") return role === "admin";
  // `internal` and `broker_only` are both readable by broker+admin.
  return true;
}

async function writeAudit(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    action: string;
    entityId: Id<"internalNotes">;
    details: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLog", {
    userId: params.userId,
    action: params.action,
    entityType: "internalNotes",
    entityId: params.entityId,
    details: JSON.stringify(params.details),
    timestamp: new Date().toISOString(),
  });
}

// ─── queries ────────────────────────────────────────────────────────────────

/**
 * List every note attached to a single subject. Results are sorted
 * newest first. Pinned notes float to the top. Notes with visibility
 * the caller cannot read are dropped server-side so the buyer app
 * cannot discover admin-only notes even if it forges queries.
 */
export const listBySubject = query({
  args: {
    subjectType: v.string(),
    subjectId: v.string(),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const role = user.role as "broker" | "admin";

    const rows = await ctx.db
      .query("internalNotes")
      .withIndex("by_subject", (q) =>
        q.eq("subjectType", args.subjectType).eq("subjectId", args.subjectId),
      )
      .collect();

    const visible = rows.filter((row) => canRead(role, row.visibility));
    visible.sort((a, b) => {
      // Pinned rows first.
      const ap = a.pinned ? 0 : 1;
      const bp = b.pinned ? 0 : 1;
      if (ap !== bp) return ap - bp;
      // Then newest first by createdAt (ISO strings compare lexicographically).
      return b.createdAt.localeCompare(a.createdAt);
    });
    return visible;
  },
});

/**
 * Fetch the full edit history for a single logical note. Follows
 * `parentNoteId` references backward until the original row is
 * reached. Returns rows from newest to oldest.
 */
export const getNoteHistory = query({
  args: { noteId: v.id("internalNotes") },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const role = user.role as "broker" | "admin";

    // Walk forward from the current id through any revisions that
    // reference this row as their parent. Then walk backward through
    // parentNoteId to capture earlier revisions.
    const history: Array<typeof noteValidator.type> = [];
    const seen = new Set<string>();

    const walkBack = async (id: Id<"internalNotes">) => {
      if (seen.has(id)) return;
      seen.add(id);
      const row = await ctx.db.get(id);
      if (!row) return;
      if (!canRead(role, row.visibility)) return;
      history.push(row);
      if (row.parentNoteId) await walkBack(row.parentNoteId);
    };
    await walkBack(args.noteId);

    // Forward walk — find any row whose parentNoteId points at the
    // requested id. We limit to the small indexed set via by_parent.
    const forward = await ctx.db
      .query("internalNotes")
      .withIndex("by_parent", (q) => q.eq("parentNoteId", args.noteId))
      .collect();
    for (const row of forward) {
      if (canRead(role, row.visibility) && !seen.has(row._id)) {
        seen.add(row._id);
        history.push(row);
      }
    }

    history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return history;
  },
});

/**
 * Recent notes across every subject. Used by the internal console
 * notes home page to show ops what's been written lately.
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const role = user.role as "broker" | "admin";
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    // Pull a generous superset first, filter by visibility, then slice.
    // The table is small (internal notes are rare) so collect() is fine.
    const rows = await ctx.db.query("internalNotes").collect();
    const visible = rows.filter((row) => canRead(role, row.visibility));
    visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return visible.slice(0, limit);
  },
});

// ─── mutations ──────────────────────────────────────────────────────────────

/**
 * Write a new note attached to a subject. Returns the new row ID.
 * Admin + broker can create `internal` and `broker_only` notes; only
 * admin can create `admin_only` notes (because a broker who later
 * loses admin privilege should not be able to redact admin-only
 * history via edits).
 */
export const createNote = mutation({
  args: {
    subjectType: v.string(),
    subjectId: v.string(),
    body: v.string(),
    visibility: visibilityValidator,
    pinned: v.optional(v.boolean()),
  },
  returns: v.id("internalNotes"),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const trimmed = args.body.trim();
    if (trimmed.length < MIN_BODY) {
      throw new Error("Note body required");
    }
    if (trimmed.length > MAX_BODY) {
      throw new Error(`Note body capped at ${MAX_BODY} characters`);
    }
    if (args.visibility === "admin_only" && user.role !== "admin") {
      throw new Error("Only admins can create admin-only notes");
    }
    if (!args.subjectType.trim() || !args.subjectId.trim()) {
      throw new Error("Subject type and ID are required");
    }
    const nowIso = new Date().toISOString();
    const id = await ctx.db.insert("internalNotes", {
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      body: trimmed,
      authorId: user._id,
      visibility: args.visibility,
      pinned: args.pinned,
      createdAt: nowIso,
    });
    await writeAudit(ctx, {
      userId: user._id,
      action: "internal_note_created",
      entityId: id,
      details: {
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        visibility: args.visibility,
        bodyLength: trimmed.length,
      },
    });
    return id;
  },
});

/**
 * Append a revision to an existing note. The new row is inserted with
 * `parentNoteId` pointing to the source row, so the full history is
 * retained. The original row is not modified — readers see the chain
 * via `getNoteHistory`.
 */
export const editNote = mutation({
  args: {
    noteId: v.id("internalNotes"),
    body: v.string(),
    visibility: v.optional(visibilityValidator),
    pinned: v.optional(v.boolean()),
  },
  returns: v.id("internalNotes"),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const source = await ctx.db.get(args.noteId);
    if (!source) throw new Error("Note not found");
    const role = user.role as "broker" | "admin";
    if (!canRead(role, source.visibility)) {
      throw new Error("You cannot see this note");
    }
    const trimmed = args.body.trim();
    if (trimmed.length < MIN_BODY) {
      throw new Error("Note body required");
    }
    if (trimmed.length > MAX_BODY) {
      throw new Error(`Note body capped at ${MAX_BODY} characters`);
    }
    const nextVisibility = args.visibility ?? source.visibility;
    if (nextVisibility === "admin_only" && user.role !== "admin") {
      throw new Error("Only admins can set admin-only visibility");
    }

    const nowIso = new Date().toISOString();
    const newId = await ctx.db.insert("internalNotes", {
      subjectType: source.subjectType,
      subjectId: source.subjectId,
      body: trimmed,
      authorId: user._id,
      visibility: nextVisibility,
      parentNoteId: args.noteId,
      pinned: args.pinned ?? source.pinned,
      createdAt: nowIso,
    });
    await writeAudit(ctx, {
      userId: user._id,
      action: "internal_note_edited",
      entityId: newId,
      details: {
        previousNoteId: args.noteId,
        subjectType: source.subjectType,
        subjectId: source.subjectId,
        previousVisibility: source.visibility,
        nextVisibility,
        bodyLength: trimmed.length,
      },
    });
    return newId;
  },
});

/**
 * Toggle the pinned flag on an existing note. Pinned notes sort to
 * the top of `listBySubject`. Unlike `editNote` this patches the row
 * in place — pinning is not versioned because it's a transient ops
 * marker, not a content change.
 */
export const setPinned = mutation({
  args: {
    noteId: v.id("internalNotes"),
    pinned: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInternalUser(ctx);
    const row = await ctx.db.get(args.noteId);
    if (!row) throw new Error("Note not found");
    const role = user.role as "broker" | "admin";
    if (!canRead(role, row.visibility)) {
      throw new Error("You cannot see this note");
    }
    await ctx.db.patch(args.noteId, { pinned: args.pinned });
    await writeAudit(ctx, {
      userId: user._id,
      action: args.pinned ? "internal_note_pinned" : "internal_note_unpinned",
      entityId: args.noteId,
      details: {
        subjectType: row.subjectType,
        subjectId: row.subjectId,
      },
    });
    return null;
  },
});
