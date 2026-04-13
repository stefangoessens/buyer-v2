import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  buildBuyerWatchlistRows,
  MAX_NOTE_LENGTH,
  MAX_WATCHLIST_SIZE,
  type WatchlistEntry,
  type WatchlistPropertyInput,
} from "./lib/watchlist";

/**
 * Convex queries + mutations for the buyer watchlist (KIN-849).
 *
 * Every surface is scoped to the authenticated buyer — a buyer
 * can only add/remove/reorder/read their own watchlist. There is
 * no broker/admin surface here because buyer notes are explicitly
 * buyer-private.
 *
 * Buyer-safe row projection lives in `convex/lib/watchlist.ts`, which
 * mirrors the pure testable logic in `src/lib/watchlist/logic.ts`.
 */

const watchlistStatusValidator = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("contingent"),
  v.literal("sold"),
  v.literal("withdrawn"),
);

const watchlistMissingFieldValidator = v.union(
  v.literal("listPrice"),
  v.literal("beds"),
  v.literal("baths"),
  v.literal("sqft"),
  v.literal("primaryPhoto"),
);

const buyerWatchlistRowValidator = v.object({
  entryId: v.id("watchlistEntries"),
  propertyId: v.id("properties"),
  position: v.number(),
  note: v.optional(v.string()),
  addedAt: v.string(),
  updatedAt: v.string(),
  addressLine: v.string(),
  status: watchlistStatusValidator,
  listPrice: v.union(v.number(), v.null()),
  beds: v.union(v.number(), v.null()),
  baths: v.union(v.number(), v.null()),
  sqft: v.union(v.number(), v.null()),
  primaryPhotoUrl: v.union(v.string(), v.null()),
  propertyType: v.union(v.string(), v.null()),
  detailState: v.union(v.literal("partial"), v.literal("complete")),
  missingFields: v.array(watchlistMissingFieldValidator),
});

function toWatchlistEntry(doc: Doc<"watchlistEntries">): WatchlistEntry {
  return {
    id: doc._id,
    buyerId: doc.buyerId,
    propertyId: doc.propertyId,
    position: doc.position,
    note: doc.note,
    addedAt: doc.addedAt,
    updatedAt: doc.updatedAt,
  };
}

function toWatchlistPropertyInput(
  doc: Doc<"properties">,
): WatchlistPropertyInput {
  return {
    _id: doc._id,
    canonicalId: doc.canonicalId,
    address: {
      street: doc.address.street,
      unit: doc.address.unit,
      city: doc.address.city,
      state: doc.address.state,
      zip: doc.address.zip,
      formatted: doc.address.formatted,
    },
    status: doc.status,
    listPrice: doc.listPrice,
    beds: doc.beds,
    bathsFull: doc.bathsFull,
    bathsHalf: doc.bathsHalf,
    sqftLiving: doc.sqftLiving,
    photoUrls: doc.photoUrls,
    propertyType: doc.propertyType,
  };
}

// MARK: - Query

/**
 * List the authenticated buyer's watchlist as buyer-safe rows derived from
 * shared canonical property data.
 */
export const listMine = query({
  args: {},
  returns: v.array(buyerWatchlistRowValidator),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const rows = await ctx.db
      .query("watchlistEntries")
      .withIndex("by_buyerId_and_position", (q) =>
        q.eq("buyerId", user._id),
      )
      .collect();
    const entries = rows.map(toWatchlistEntry);
    const propertyById: Map<string, WatchlistPropertyInput> = new Map();

    for (const entry of entries) {
      const property = await ctx.db.get(entry.propertyId as Id<"properties">);
      if (!property) {
        continue;
      }
      propertyById.set(property._id, toWatchlistPropertyInput(property));
    }

    return buildBuyerWatchlistRows(entries, propertyById).map((row) => ({
      ...row,
      entryId: row.entryId as Id<"watchlistEntries">,
      propertyId: row.propertyId as Id<"properties">,
    }));
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
    const property = await ctx.db.get(args.propertyId);
    if (!property) {
      throw new Error("Property not found");
    }

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

    // Only patch entries whose position actually changed. The
    // pure `reorderWatchlist` helper already makes this
    // optimization; the Convex mirror matches it to avoid write
    // amplification on no-op reorders. Codex P2 from PR #109.
    const currentById = new Map(current.map((e) => [e._id, e]));
    const now = new Date().toISOString();
    for (let i = 0; i < args.orderedEntryIds.length; i++) {
      const id = args.orderedEntryIds[i];
      if (!id) continue;
      const existing = currentById.get(id);
      if (existing && existing.position === i) continue;
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
