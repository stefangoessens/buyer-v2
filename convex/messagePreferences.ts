import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

/**
 * Message delivery preferences (KIN-829).
 *
 * Buyer-scoped typed state that governs which channels + categories
 * receive platform messages. The delivery layer always consults this
 * shared state via `src/lib/messagePreferences.ts` — never channel-local
 * flags. Both the web dashboard and the iOS settings screen hit these
 * same mutations.
 *
 * Pure decision logic is mirrored in `src/lib/messagePreferences.ts`
 * for Vitest unit testing; Convex files cannot import from `src/`, so
 * keep this file's merge/default logic aligned with that helper.
 */

// MARK: - Validators

const channelsValidator = v.object({
  email: v.boolean(),
  sms: v.boolean(),
  push: v.boolean(),
  inApp: v.boolean(),
});

const categoriesValidator = v.object({
  transactional: v.boolean(),
  tours: v.boolean(),
  offers: v.boolean(),
  updates: v.boolean(),
  marketing: v.boolean(),
});

const preferencesShape = {
  _id: v.id("messageDeliveryPreferences"),
  _creationTime: v.number(),
  userId: v.id("users"),
  channels: channelsValidator,
  categories: categoriesValidator,
  createdAt: v.string(),
  updatedAt: v.string(),
};

// MARK: - Defaults

/**
 * Sane defaults for a newly-seen buyer. Mirrors
 * `defaultPreferences` in `src/lib/messagePreferences.ts`.
 */
function defaultChannels() {
  return {
    email: true,
    sms: false,
    push: true,
    inApp: true,
  };
}

function defaultCategories() {
  return {
    transactional: true,
    tours: true,
    offers: true,
    updates: true,
    marketing: false,
  };
}

// MARK: - Queries

/**
 * Read the caller's delivery preferences. Returns the stored row if
 * present, otherwise the out-of-the-box defaults (no write — callers
 * should trigger a write via `upsertForCurrentUser` if they want to
 * materialize the defaults).
 *
 * Returns a shape that includes `_id: null` when the row doesn't
 * exist yet so clients can distinguish "using defaults" from
 * "explicitly set to defaults".
 */
export const getForCurrentUser = query({
  args: {},
  returns: v.object({
    hasStoredPreferences: v.boolean(),
    channels: channelsValidator,
    categories: categoriesValidator,
  }),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const row = await ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!row) {
      return {
        hasStoredPreferences: false,
        channels: defaultChannels(),
        categories: defaultCategories(),
      };
    }

    return {
      hasStoredPreferences: true,
      channels: row.channels,
      categories: row.categories,
    };
  },
});

// MARK: - Mutations

/**
 * Create-or-update the caller's preferences with a partial patch.
 *
 * Unspecified channels/categories keep their existing values. On first
 * call (no row yet), defaults are used as the baseline, the patch is
 * applied on top, and a fresh row is inserted.
 */
export const upsertForCurrentUser = mutation({
  args: {
    channels: v.optional(
      v.object({
        email: v.optional(v.boolean()),
        sms: v.optional(v.boolean()),
        push: v.optional(v.boolean()),
        inApp: v.optional(v.boolean()),
      })
    ),
    categories: v.optional(
      v.object({
        transactional: v.optional(v.boolean()),
        tours: v.optional(v.boolean()),
        offers: v.optional(v.boolean()),
        updates: v.optional(v.boolean()),
        marketing: v.optional(v.boolean()),
      })
    ),
  },
  returns: v.id("messageDeliveryPreferences"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const baseChannels = existing?.channels ?? defaultChannels();
    const baseCategories = existing?.categories ?? defaultCategories();

    const merged = {
      channels: {
        email: args.channels?.email ?? baseChannels.email,
        sms: args.channels?.sms ?? baseChannels.sms,
        push: args.channels?.push ?? baseChannels.push,
        inApp: args.channels?.inApp ?? baseChannels.inApp,
      },
      categories: {
        transactional:
          args.categories?.transactional ?? baseCategories.transactional,
        tours: args.categories?.tours ?? baseCategories.tours,
        offers: args.categories?.offers ?? baseCategories.offers,
        updates: args.categories?.updates ?? baseCategories.updates,
        marketing: args.categories?.marketing ?? baseCategories.marketing,
      },
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        channels: merged.channels,
        categories: merged.categories,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("messageDeliveryPreferences", {
      userId: user._id,
      channels: merged.channels,
      categories: merged.categories,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Global "quiet mode" — disable every delivery channel but preserve
 * category selection so the user can re-enable channels later without
 * losing their category configuration.
 *
 * If the caller has no row yet, we materialize defaults first and then
 * apply the opt-out so the next `getForCurrentUser` reflects the
 * explicit choice.
 */
export const optOutAllChannels = mutation({
  args: {},
  returns: v.id("messageDeliveryPreferences"),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const categoriesBase = existing?.categories ?? defaultCategories();
    const optedOutChannels = {
      email: false,
      sms: false,
      push: false,
      inApp: false,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        channels: optedOutChannels,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("messageDeliveryPreferences", {
      userId: user._id,
      channels: optedOutChannels,
      categories: categoriesBase,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Reset the caller's preferences to the out-of-the-box defaults.
 * Upserts the row if it doesn't exist yet.
 */
export const resetToDefaults = mutation({
  args: {},
  returns: v.id("messageDeliveryPreferences"),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        channels: defaultChannels(),
        categories: defaultCategories(),
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("messageDeliveryPreferences", {
      userId: user._id,
      channels: defaultChannels(),
      categories: defaultCategories(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Suppress unused-import warnings for shape helpers — exported types
// are consumed by downstream callers but referenced structurally here.
void preferencesShape;
