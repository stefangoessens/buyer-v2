import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

/**
 * Device token registration for push notifications (KIN-826).
 *
 * The iOS app registers its APNS device token here so the backend can
 * deliver push notifications. Supports upsert (register or replace),
 * explicit invalidation, and cleanup-on-signout.
 *
 * Resolution logic is mirrored in `src/lib/deviceTokens.ts` for unit
 * testing in Vitest (Convex files cannot import from `src/`, so the
 * two implementations must stay in sync).
 */

const platformValidator = v.union(v.literal("ios"), v.literal("android"));
const environmentValidator = v.union(
  v.literal("development"),
  v.literal("production")
);

/**
 * Upsert the caller's device token.
 *
 * Flow:
 *   1. Require auth → get user
 *   2. Look for an existing row for this user by deviceId (preferred) or
 *      by exact token match (fallback).
 *   3. If found and not invalidated → update token and metadata.
 *   4. If found but invalidated → reactivate (clear invalidatedAt).
 *   5. Otherwise → insert a new row.
 *   6. After the upsert, invalidate any OTHER rows for this user that
 *      share the same token but a different rowId — covers the rare
 *      case where APNS re-issues a token across logical devices.
 */
export const registerToken = mutation({
  args: {
    token: v.string(),
    platform: platformValidator,
    environment: environmentValidator,
    deviceId: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    osVersion: v.optional(v.string()),
  },
  returns: v.id("deviceTokens"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    // Load all rows for this user once — we need them for both the
    // match lookup and the post-upsert cross-device invalidation.
    const existing = await ctx.db
      .query("deviceTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // --- Match lookup: deviceId first, then token fallback ---
    let match = undefined;
    if (args.deviceId) {
      match = existing.find((row) => row.deviceId === args.deviceId);
    }
    if (!match) {
      match = existing.find((row) => row.token === args.token);
    }

    let rowId;
    if (match) {
      // Replace or reactivate — same row, updated token + metadata.
      // Clearing invalidatedAt handles the "reactivate" case; on a
      // simple replace it's already undefined so this is a no-op.
      //
      // Preserve existing optional metadata when the caller omits it —
      // clients may send a light-weight registration (e.g. after a token
      // rotation) without re-sending deviceId/appVersion/osVersion, and
      // we don't want to clear the device binding in that case.
      await ctx.db.patch(match._id, {
        token: args.token,
        platform: args.platform,
        environment: args.environment,
        deviceId: args.deviceId ?? match.deviceId,
        appVersion: args.appVersion ?? match.appVersion,
        osVersion: args.osVersion ?? match.osVersion,
        lastSeenAt: now,
        invalidatedAt: undefined,
        updatedAt: now,
      });
      rowId = match._id;
    } else {
      // Insert a fresh row.
      rowId = await ctx.db.insert("deviceTokens", {
        userId: user._id,
        token: args.token,
        platform: args.platform,
        environment: args.environment,
        deviceId: args.deviceId,
        appVersion: args.appVersion,
        osVersion: args.osVersion,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // --- Cross-device cleanup ---
    // Invalidate any OTHER rows for this user that share the same token
    // string but a different rowId (e.g. token reassigned by APNS).
    for (const row of existing) {
      if (row._id !== rowId && row.token === args.token) {
        await ctx.db.patch(row._id, {
          invalidatedAt: now,
          updatedAt: now,
        });
      }
    }

    return rowId;
  },
});

/**
 * Mark one of the caller's tokens as invalidated.
 *
 * Invoked when APNS reports a token as no longer deliverable, or when
 * the client proactively revokes a token. No-op if the token doesn't
 * belong to the caller (defensive — never leak state across users).
 */
export const invalidateToken = mutation({
  args: {
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const rows = await ctx.db
      .query("deviceTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const row of rows) {
      if (row.token === args.token && !row.invalidatedAt) {
        await ctx.db.patch(row._id, {
          invalidatedAt: now,
          updatedAt: now,
        });
      }
    }

    return null;
  },
});

/**
 * Delete device token rows for the caller on sign-out.
 *
 * IMPORTANT: Scoped to the current device only, not all rows for the user.
 * Bulk-deleting every token on sign-out would silently stop notifications
 * on other devices where the user is still signed in. The caller must
 * identify its device via `deviceId` (preferred) or the exact `token`
 * string. Returns the number of rows actually deleted (0 if none match).
 */
export const cleanupForUser = mutation({
  args: {
    deviceId: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Require at least one identifier so we can scope the deletion.
    if (!args.deviceId && !args.token) {
      return 0;
    }

    const rows = await ctx.db
      .query("deviceTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Match by deviceId (preferred) first, then fall back to exact token.
    // If the client sent both, we delete rows where EITHER matches —
    // covers the case where the row's deviceId field was never set.
    const toDelete = rows.filter((row) => {
      if (args.deviceId && row.deviceId === args.deviceId) return true;
      if (args.token && row.token === args.token) return true;
      return false;
    });

    for (const row of toDelete) {
      await ctx.db.delete(row._id);
    }

    return toDelete.length;
  },
});

/**
 * List the caller's active (non-invalidated) device tokens.
 *
 * Used by the iOS client to verify its token is still registered and
 * by the web app settings page to show registered devices.
 */
export const listForCurrentUser = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("deviceTokens"),
      _creationTime: v.number(),
      userId: v.id("users"),
      token: v.string(),
      platform: platformValidator,
      environment: environmentValidator,
      deviceId: v.optional(v.string()),
      appVersion: v.optional(v.string()),
      osVersion: v.optional(v.string()),
      lastSeenAt: v.string(),
      invalidatedAt: v.optional(v.string()),
      createdAt: v.string(),
      updatedAt: v.string(),
    })
  ),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const rows = await ctx.db
      .query("deviceTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return rows.filter((row) => !row.invalidatedAt);
  },
});
