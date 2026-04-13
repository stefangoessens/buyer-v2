import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

/**
 * Convex queries + mutations for the buyer watchlist (KIN-849).
 *
 * Every surface is scoped to the authenticated buyer — a buyer
 * can only add/remove/reorder/read their own watchlist. There is
 * no broker/admin surface here because buyer notes are explicitly
 * buyer-private.
 *
 * Pure decision logic lives in `src/lib/watchlist/logic.ts`.
 * Convex files cannot import from `src/`, so transition helpers
 * are duplicated inline. Keep the two aligned; tests on the pure
 * module prevent drift.
 */

const MAX_WATCHLIST_SIZE = 50;
const MAX_NOTE_LENGTH = 280;

// MARK: - Query

/**
 * List the authenticated buyer's watchlist, ordered by position.
 */
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("watchlistEntries"),
      _creationTime: v.number(),
      buyerId: v.id("users"),
      propertyId: v.id("properties"),
      position: v.number(),
      note: v.optional(v.string()),
      addedAt: v.string(),
      updatedAt: v.string(),
    })
  ),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const rows = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_position", (q) =>
        q.eq("buyerId", user._id)
      )
      .collect();
    // Explicit sort — Convex returns by index order, but we
    // want deterministic position ascending in case positions
    // get temporarily non-contiguous during a multi-step
    // reorder.
    return rows.sort((a, b) => a.position - b.position);
  },
});

// MARK: - Add

/**
 * Add a property to the buyer's watchlist. Idempotent — adding a
 * property that's already there returns `alreadyInList`. Enforces
 * the 50-entry capacity cap.
 */
export const addToWatchlist = mutation({
  args: {
    propertyId: v.id("properties"),
    note: v.optional(v.string()),
  },
  returns: v.object({
    kind: v.union(
      v.literal("added"),
      v.literal("alreadyInList"),
      v.literal("full")
    ),
    entryId: v.optional(v.id("watchlistEntries")),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const existing = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_propertyId", (q) =>
        q.eq("buyerId", user._id).eq("propertyId", args.propertyId)
      )
      .unique();
    if (existing) {
      return { kind: "alreadyInList" as const, entryId: existing._id };
    }

    const current = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_position", (q) =>
        q.eq("buyerId", user._id)
      )
      .collect();
    if (current.length >= MAX_WATCHLIST_SIZE) {
      return { kind: "full" as const, entryId: undefined };
    }

    const trimmedNote = args.note?.trim();
    if (trimmedNote && trimmedNote.length > MAX_NOTE_LENGTH) {
      throw new Error(
        `watchlist note exceeds ${MAX_NOTE_LENGTH} char budget`
      );
    }

    const now = new Date().toISOString();
    const inserted = await ctx.db.insert("watchlistEntries", {
      buyerId: user._id,
      propertyId: args.propertyId,
      position: current.length,
      note:
        trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined,
      addedAt: now,
      updatedAt: now,
    });
    return { kind: "added" as const, entryId: inserted };
  },
});

// MARK: - Remove

/**
 * Remove a property from the buyer's watchlist. Recomputes
 * positions so the list stays contiguous 0..N-1. Returns a typed
 * verdict so the UI can distinguish "removed" from "not in list."
 */
export const removeFromWatchlist = mutation({
  args: { propertyId: v.id("properties") },
  returns: v.object({
    kind: v.union(v.literal("removed"), v.literal("notFound")),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const target = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_propertyId", (q) =>
        q.eq("buyerId", user._id).eq("propertyId", args.propertyId)
      )
      .unique();
    if (!target) {
      return { kind: "notFound" as const };
    }

    await ctx.db.delete(target._id);

    // Recompute positions on every remaining entry so the list
    // stays contiguous.
    const remaining = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_position", (q) =>
        q.eq("buyerId", user._id)
      )
      .collect();
    remaining.sort((a, b) => a.position - b.position);
    const now = new Date().toISOString();
    for (let i = 0; i < remaining.length; i++) {
      const entry = remaining[i];
      if (entry && entry.position !== i) {
        await ctx.db.patch(entry._id, {
          position: i,
          updatedAt: now,
        });
      }
    }
    return { kind: "removed" as const };
  },
});

// MARK: - Reorder

/**
 * Reorder the buyer's watchlist. `orderedEntryIds` must be a
 * permutation of the buyer's current entry ids — missing, extra,
 * or duplicate ids fail the mutation with a typed error so the
 * caller can retry with a fresh snapshot.
 */
export const reorderWatchlist = mutation({
  args: {
    orderedEntryIds: v.array(v.id("watchlistEntries")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const current = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_position", (q) =>
        q.eq("buyerId", user._id)
      )
      .collect();

    // Duplicate detection in the new order
    const newIds = new Set(args.orderedEntryIds);
    if (newIds.size !== args.orderedEntryIds.length) {
      throw new Error("reorderWatchlist: duplicate ids in orderedEntryIds");
    }

    // Missing: current has ids not in new order
    const currentIds = new Set(current.map((e) => e._id));
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        throw new Error(
          "reorderWatchlist: missing id(s) — expected a permutation of current entries"
        );
      }
    }
    // Extra: new order has ids not in current
    for (const id of args.orderedEntryIds) {
      if (!currentIds.has(id)) {
        throw new Error(
          "reorderWatchlist: extra id(s) not owned by the current buyer"
        );
      }
    }

    const now = new Date().toISOString();
    for (let i = 0; i < args.orderedEntryIds.length; i++) {
      const id = args.orderedEntryIds[i];
      if (!id) continue;
      await ctx.db.patch(id, { position: i, updatedAt: now });
    }
    return null;
  },
});

// MARK: - Set note

/**
 * Update the note on a watchlist entry. Passing an empty string
 * or undefined clears the note.
 */
export const setNote = mutation({
  args: {
    propertyId: v.id("properties"),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const target = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_propertyId", (q) =>
        q.eq("buyerId", user._id).eq("propertyId", args.propertyId)
      )
      .unique();
    if (!target) {
      throw new Error("watchlist entry not found for this property");
    }

    const trimmed = args.note?.trim();
    if (trimmed !== undefined && trimmed.length > MAX_NOTE_LENGTH) {
      throw new Error(
        `watchlist note exceeds ${MAX_NOTE_LENGTH} char budget`
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(target._id, {
      note: trimmed && trimmed.length > 0 ? trimmed : undefined,
      updatedAt: now,
    });
    return null;
  },
});
