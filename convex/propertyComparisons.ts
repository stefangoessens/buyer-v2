// ═══════════════════════════════════════════════════════════════════════════
// Property Comparisons (KIN-843)
//
// Typed backend state for the dashboard property-comparison surface.
// Buyers can build an ordered list of up to MAX_COMPARISON_SIZE properties
// to compare side-by-side. Pure comparison logic lives in
// `convex/lib/comparison.ts` (mirrored at `src/lib/dashboard/comparison.ts`)
// so operations stay deterministic and testable without a DB.
//
// All mutations apply via the pure helpers so error codes, validation, and
// state transitions are consistent across backend and tests. Audit log on
// every mutation captures the before/after count and the action taken.
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  addToComparison,
  buildComparisonRows,
  MAX_COMPARISON_SIZE,
  removeFromComparison,
  reorderComparison,
  resetComparison,
  type ComparisonPropertyInput,
  type ComparisonState,
} from "./lib/comparison";

// ───────────────────────────────────────────────────────────────────────────
// Return value shapes
// ───────────────────────────────────────────────────────────────────────────

const comparisonRowValidator = v.object({
  propertyId: v.string(),
  addressLine: v.string(),
  primaryPhotoUrl: v.union(v.string(), v.null()),
  listPrice: v.union(v.number(), v.null()),
  beds: v.union(v.number(), v.null()),
  baths: v.union(v.number(), v.null()),
  sqft: v.union(v.number(), v.null()),
  lotSize: v.union(v.number(), v.null()),
  yearBuilt: v.union(v.number(), v.null()),
  pricePerSqft: v.union(v.number(), v.null()),
  propertyType: v.union(v.string(), v.null()),
  hoaFee: v.union(v.number(), v.null()),
  hasPool: v.boolean(),
  waterfront: v.boolean(),
  order: v.number(),
});

const comparisonResultValidator = v.object({
  comparisonId: v.union(v.id("propertyComparisons"), v.null()),
  rows: v.array(comparisonRowValidator),
  propertyCount: v.number(),
  maxSize: v.number(),
  hasSkipped: v.boolean(),
  updatedAt: v.union(v.string(), v.null()),
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/** Shape a property doc into the pure-lib input shape. */
function toComparisonInput(p: Doc<"properties">): ComparisonPropertyInput {
  return {
    _id: p._id,
    canonicalId: p.canonicalId,
    address: {
      street: p.address.street,
      unit: p.address.unit,
      city: p.address.city,
      state: p.address.state,
      zip: p.address.zip,
      formatted: p.address.formatted,
    },
    listPrice: p.listPrice,
    beds: p.beds,
    bathsFull: p.bathsFull,
    bathsHalf: p.bathsHalf,
    sqftLiving: p.sqftLiving,
    lotSize: p.lotSize,
    yearBuilt: p.yearBuilt,
    photoUrls: p.photoUrls,
    propertyType: p.propertyType,
    hoaFee: p.hoaFee,
    pool: p.pool,
    waterfrontType: p.waterfrontType,
  };
}

/** Lift a stored comparison doc into the pure-lib state shape. */
function toState(doc: Doc<"propertyComparisons">): ComparisonState {
  return {
    buyerId: doc.buyerId,
    propertyIds: doc.propertyIds,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Project a comparison state + property lookup into the API result.
 * Uses the VISIBLE row count (not the stored-ID count) so the buyer
 * doesn't see stale slot reservations from properties deleted in
 * another tab. Mutations prune missing IDs from the persisted state
 * via `pruneMissingProperties()`; this read path just reports the
 * current visible truth.
 */
async function buildResult(
  ctx: { db: { get: (id: Id<"properties">) => Promise<Doc<"properties"> | null> } },
  doc: Doc<"propertyComparisons"> | null,
) {
  if (!doc) {
    return {
      comparisonId: null as null,
      rows: [],
      propertyCount: 0,
      maxSize: MAX_COMPARISON_SIZE,
      hasSkipped: false,
      updatedAt: null as null,
    };
  }
  const state = toState(doc);
  const propertyById = new Map<string, ComparisonPropertyInput>();
  for (const propId of state.propertyIds) {
    const p = await ctx.db.get(propId as Id<"properties">);
    if (p) propertyById.set(p._id, toComparisonInput(p));
  }
  const rows = buildComparisonRows(state, propertyById);
  return {
    comparisonId: doc._id,
    rows,
    // Report the VISIBLE count so the UI stays consistent with what's
    // displayed. Stored IDs may still contain stale references until
    // a mutation prunes them.
    propertyCount: rows.length,
    maxSize: MAX_COMPARISON_SIZE,
    hasSkipped: rows.length !== state.propertyIds.length,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Remove any stored property IDs that no longer resolve to a real
 * property document. Called at the top of every mutation so the
 * persisted state self-heals — otherwise a stale ID could block
 * a subsequent `addProperty` as `comparison_full` even though the
 * buyer sees an open slot.
 *
 * Returns the pruned ID list and whether anything was removed.
 */
async function pruneMissingProperties(
  ctx: { db: { get: (id: Id<"properties">) => Promise<Doc<"properties"> | null> } },
  propertyIds: Id<"properties">[],
): Promise<{ pruned: Id<"properties">[]; removed: number }> {
  const kept: Id<"properties">[] = [];
  for (const id of propertyIds) {
    const p = await ctx.db.get(id);
    if (p) kept.push(id);
  }
  return { pruned: kept, removed: propertyIds.length - kept.length };
}

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * Get the current comparison for the authenticated buyer. Returns an
 * empty result if no comparison exists yet — callers can use that as
 * a signal to render the empty state.
 */
export const getComparison = query({
  args: {},
  returns: comparisonResultValidator,
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const doc = await ctx.db
      .query("propertyComparisons")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .unique();
    return await buildResult(ctx, doc);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

/** Add a property to the comparison; creates the record if missing. */
export const addProperty = mutation({
  args: {
    propertyId: v.id("properties"),
    position: v.optional(v.number()),
  },
  returns: comparisonResultValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    // Verify the property exists before adding — don't let callers add
    // dangling references.
    const property = await ctx.db.get(args.propertyId);
    if (!property) {
      throw new Error(`Property ${args.propertyId} not found`);
    }

    const existing = await ctx.db
      .query("propertyComparisons")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .unique();

    if (!existing) {
      // First-time create — still run it through the pure helper so
      // position bounds are validated identically to the update path.
      // addToComparison will reject an out-of-range position on a
      // length-0 list, matching the behavior callers get post-create.
      const emptySeed: ComparisonState = {
        buyerId: user._id,
        propertyIds: [],
        createdAt: now,
        updatedAt: now,
      };
      const createResult = addToComparison(
        emptySeed,
        args.propertyId,
        now,
        args.position,
      );
      if (!createResult.ok) {
        throw new Error(
          `${createResult.error.code}: ${createResult.error.message}`,
        );
      }

      const id = await ctx.db.insert("propertyComparisons", {
        buyerId: user._id,
        propertyIds: createResult.state.propertyIds as Id<"properties">[],
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "property_comparison_created",
        entityType: "propertyComparisons",
        entityId: id,
        details: JSON.stringify({ propertyId: args.propertyId }),
        timestamp: now,
      });

      const fresh = await ctx.db.get(id);
      return await buildResult(ctx, fresh);
    }

    // Self-heal: prune any stale IDs (properties deleted in another tab)
    // BEFORE running the add logic, otherwise a stale ID could block
    // this call as comparison_full even though the UI shows an open slot.
    const { pruned, removed } = await pruneMissingProperties(
      ctx,
      existing.propertyIds,
    );
    const state: ComparisonState = {
      ...toState(existing),
      propertyIds: pruned,
    };

    const result = addToComparison(state, args.propertyId, now, args.position);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    await ctx.db.patch(existing._id, {
      propertyIds: result.state.propertyIds as Id<"properties">[],
      updatedAt: now,
    });

    if (removed > 0) {
      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "property_comparison_self_healed",
        entityType: "propertyComparisons",
        entityId: existing._id,
        details: JSON.stringify({ removedStaleIds: removed }),
        timestamp: now,
      });
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "property_comparison_add",
      entityType: "propertyComparisons",
      entityId: existing._id,
      details: JSON.stringify({
        propertyId: args.propertyId,
        position: args.position,
        newCount: result.state.propertyIds.length,
      }),
      timestamp: now,
    });

    const updated = await ctx.db.get(existing._id);
    return await buildResult(ctx, updated);
  },
});

/** Remove a property from the comparison. */
export const removeProperty = mutation({
  args: { propertyId: v.id("properties") },
  returns: comparisonResultValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("propertyComparisons")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .unique();
    if (!existing) {
      throw new Error("No comparison exists for this buyer");
    }

    // Self-heal stale IDs before applying the remove.
    const { pruned } = await pruneMissingProperties(ctx, existing.propertyIds);
    const state: ComparisonState = {
      ...toState(existing),
      propertyIds: pruned,
    };
    const result = removeFromComparison(state, args.propertyId, now);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    await ctx.db.patch(existing._id, {
      propertyIds: result.state.propertyIds as Id<"properties">[],
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "property_comparison_remove",
      entityType: "propertyComparisons",
      entityId: existing._id,
      details: JSON.stringify({
        propertyId: args.propertyId,
        newCount: result.state.propertyIds.length,
      }),
      timestamp: now,
    });

    const updated = await ctx.db.get(existing._id);
    return await buildResult(ctx, updated);
  },
});

/** Reorder the comparison list by moving a property from one position to another. */
export const reorder = mutation({
  args: {
    fromPosition: v.number(),
    toPosition: v.number(),
  },
  returns: comparisonResultValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("propertyComparisons")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .unique();
    if (!existing) {
      throw new Error("No comparison exists for this buyer");
    }

    // Self-heal stale IDs before reordering — otherwise the from/to
    // positions could reference stale entries that no longer display.
    const { pruned } = await pruneMissingProperties(ctx, existing.propertyIds);
    const state: ComparisonState = {
      ...toState(existing),
      propertyIds: pruned,
    };
    const result = reorderComparison(
      state,
      args.fromPosition,
      args.toPosition,
      now,
    );
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    await ctx.db.patch(existing._id, {
      propertyIds: result.state.propertyIds as Id<"properties">[],
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "property_comparison_reorder",
      entityType: "propertyComparisons",
      entityId: existing._id,
      details: JSON.stringify({
        fromPosition: args.fromPosition,
        toPosition: args.toPosition,
      }),
      timestamp: now,
    });

    const updated = await ctx.db.get(existing._id);
    return await buildResult(ctx, updated);
  },
});

/** Reset the comparison — clears all properties but keeps the record. */
export const reset = mutation({
  args: {},
  returns: comparisonResultValidator,
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("propertyComparisons")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .unique();
    if (!existing) {
      // No-op: nothing to reset.
      return {
        comparisonId: null as null,
        rows: [],
        propertyCount: 0,
        maxSize: MAX_COMPARISON_SIZE,
        hasSkipped: false,
        updatedAt: null as null,
      };
    }

    const nextState = resetComparison(toState(existing), now);
    await ctx.db.patch(existing._id, {
      propertyIds: nextState.propertyIds as Id<"properties">[],
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "property_comparison_reset",
      entityType: "propertyComparisons",
      entityId: existing._id,
      details: JSON.stringify({
        previousCount: existing.propertyIds.length,
      }),
      timestamp: now,
    });

    const updated = await ctx.db.get(existing._id);
    return await buildResult(ctx, updated);
  },
});
