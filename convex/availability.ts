import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import { availabilityOwnerType, availabilityStatus } from "./lib/validators";
import { assertValidWindow, windowsOverlap } from "./lib/scheduling";

// ═══════════════════════════════════════════════════════════════════════════
// KIN-836 — Availability and scheduling utility model
//
// This module exposes typed read/write functions for the
// `availabilityWindows` table. Scheduling state lives here so that tour
// coordination, buyer intake, and agent-assignment flows all read from the
// same canonical data instead of duplicating calendar state in UI code.
//
// Access rules:
//   - Buyers can read and create windows only for themselves
//     (ownerType = "buyer", ownerId = their own user id as a string).
//   - Brokers/admins can read and mutate any window.
//   - `tour_request` owners are broker/admin scoped — buyers cannot touch
//     them directly; they are mediated through tour mutations.
//
// Validation:
//   - All create/update calls that touch time bounds are run through
//     `assertValidWindow` to catch bad ISO strings, inverted or zero
//     windows, unknown timezones, and absurd (multi-week) durations.
//
// Audit:
//   - Every mutation writes an auditLog entry keyed to the window id.
// ═══════════════════════════════════════════════════════════════════════════

// ═══ Shared helpers ═════════════════════════════════════════════════════════

/**
 * Return true if the given user is allowed to read/write windows for the
 * given (ownerType, ownerId). Buyers can only touch their own buyer-scoped
 * windows; brokers/admins can touch anything.
 */
function canAccessOwner(
  user: Doc<"users">,
  ownerType: "buyer" | "agent" | "tour_request",
  ownerId: string
): boolean {
  if (user.role === "broker" || user.role === "admin") return true;
  if (user.role === "buyer") {
    return ownerType === "buyer" && ownerId === user._id;
  }
  return false;
}

/**
 * Recurring spec for availability windows. daysOfWeek uses 0 = Sunday
 * through 6 = Saturday, matching JS Date.getDay().
 */
const recurringSpec = v.object({
  daysOfWeek: v.array(v.number()),
  until: v.optional(v.string()),
});

// ═══ Queries ═════════════════════════════════════════════════════════════════

/**
 * Get availability windows for a specific owner. Buyers can only see their
 * own windows; brokers/admins see all. Returns an empty array on auth or
 * access failure instead of throwing, so client UIs can render cleanly.
 */
export const getByOwner = query({
  args: {
    ownerType: availabilityOwnerType,
    ownerId: v.string(),
    status: v.optional(availabilityStatus),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!canAccessOwner(user, args.ownerType, args.ownerId)) return [];

    const windows = await ctx.db
      .query("availabilityWindows")
      .withIndex("by_ownerType_and_ownerId", (q) =>
        q.eq("ownerType", args.ownerType).eq("ownerId", args.ownerId)
      )
      .collect();

    if (args.status) {
      return windows.filter((w) => w.status === args.status);
    }
    return windows;
  },
});

/**
 * Get availability windows for an owner that overlap a given UTC date
 * range. Range bounds are ISO-8601 UTC strings (Z suffix). The overlap
 * check is strict — windows that only touch the range at a single instant
 * are excluded (matches calendar "back-to-back" semantics).
 *
 * Filtering is done client-side after the index scan because Convex does
 * not support range-overlap queries directly.
 */
export const getByOwnerRange = query({
  args: {
    ownerType: availabilityOwnerType,
    ownerId: v.string(),
    rangeStartUtc: v.string(),
    rangeEndUtc: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!canAccessOwner(user, args.ownerType, args.ownerId)) return [];

    // Validate that the range itself is sane — we only need the UTC strings
    // here, so pass UTC as the timezone to the validator. This catches
    // reversed ranges and bad ISO.
    const rangeNormalized = assertValidWindow(
      args.rangeStartUtc,
      args.rangeEndUtc,
      "UTC"
    );

    const windows = await ctx.db
      .query("availabilityWindows")
      .withIndex("by_ownerType_and_ownerId", (q) =>
        q.eq("ownerType", args.ownerType).eq("ownerId", args.ownerId)
      )
      .collect();

    return windows.filter((w) => {
      // Build a lightweight normalized view of each window for the overlap
      // check. Storage format is ISO with offset, so new Date() → iso is
      // sufficient to compute UTC strings here.
      const wStartUtc = new Date(w.startAt).toISOString();
      const wEndUtc = new Date(w.endAt).toISOString();
      return windowsOverlap(
        {
          startUtc: wStartUtc,
          endUtc: wEndUtc,
          startLocal: w.startAt,
          endLocal: w.endAt,
          timezone: w.timezone,
          durationMs:
            new Date(w.endAt).getTime() - new Date(w.startAt).getTime(),
        },
        rangeNormalized
      );
    });
  },
});

// ═══ Mutations ═══════════════════════════════════════════════════════════════

/**
 * Create a new availability window. Validates time bounds + timezone,
 * enforces owner access rules, and writes an audit entry.
 *
 * Access:
 *   - Buyers can create only for themselves (ownerType="buyer",
 *     ownerId = their own userId as a string).
 *   - Brokers/admins can create for any owner.
 */
export const createWindow = mutation({
  args: {
    ownerType: availabilityOwnerType,
    ownerId: v.string(),
    startAt: v.string(),
    endAt: v.string(),
    timezone: v.string(),
    recurring: v.optional(recurringSpec),
    status: availabilityStatus,
    notes: v.optional(v.string()),
  },
  returns: v.id("availabilityWindows"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!canAccessOwner(user, args.ownerType, args.ownerId)) {
      throw new Error(
        "Not authorized to create availability for this owner"
      );
    }

    // Validates ISO parsing, ordering, duration, and IANA timezone.
    assertValidWindow(args.startAt, args.endAt, args.timezone);

    // If a recurring.until date is provided, sanity-check it is parseable.
    if (args.recurring?.until !== undefined) {
      const untilDate = new Date(args.recurring.until);
      if (Number.isNaN(untilDate.getTime())) {
        throw new Error(
          `Invalid recurring.until ISO date: ${args.recurring.until}`
        );
      }
    }
    // Sanity-check daysOfWeek are in range 0..6 (Sun..Sat).
    if (args.recurring) {
      for (const d of args.recurring.daysOfWeek) {
        if (!Number.isInteger(d) || d < 0 || d > 6) {
          throw new Error(
            `Invalid recurring.daysOfWeek entry: ${d} (must be integer 0..6)`
          );
        }
      }
    }

    const now = new Date().toISOString();

    const windowId = await ctx.db.insert("availabilityWindows", {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      startAt: args.startAt,
      endAt: args.endAt,
      timezone: args.timezone,
      recurring: args.recurring,
      status: args.status,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "availability_window_created",
      entityType: "availabilityWindows",
      entityId: windowId,
      details: JSON.stringify({
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        status: args.status,
        recurring: args.recurring !== undefined,
      }),
      timestamp: now,
    });

    return windowId;
  },
});

/**
 * Update an existing availability window. Any combination of fields may be
 * patched; only those that are explicitly provided are touched. If either
 * time bound or timezone is provided, the final (post-patch) triple is
 * revalidated.
 *
 * Access: same as createWindow — buyers can only touch their own buyer-
 * scoped windows; brokers/admins can touch anything.
 */
export const updateWindow = mutation({
  args: {
    windowId: v.id("availabilityWindows"),
    startAt: v.optional(v.string()),
    endAt: v.optional(v.string()),
    timezone: v.optional(v.string()),
    recurring: v.optional(recurringSpec),
    status: v.optional(availabilityStatus),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const existing = await ctx.db.get(args.windowId);
    if (!existing) throw new Error("Availability window not found");

    if (!canAccessOwner(user, existing.ownerType, existing.ownerId)) {
      throw new Error("Not authorized to update this availability window");
    }

    // Compute effective values after patch, for validation purposes.
    const nextStart = args.startAt ?? existing.startAt;
    const nextEnd = args.endAt ?? existing.endAt;
    const nextTz = args.timezone ?? existing.timezone;

    // Only revalidate if any time field is provided. Storing valid data
    // today guarantees stored data is valid, so we don't need to re-run
    // the validator on every unrelated patch.
    if (
      args.startAt !== undefined ||
      args.endAt !== undefined ||
      args.timezone !== undefined
    ) {
      assertValidWindow(nextStart, nextEnd, nextTz);
    }

    if (args.recurring !== undefined) {
      if (args.recurring.until !== undefined) {
        const untilDate = new Date(args.recurring.until);
        if (Number.isNaN(untilDate.getTime())) {
          throw new Error(
            `Invalid recurring.until ISO date: ${args.recurring.until}`
          );
        }
      }
      for (const d of args.recurring.daysOfWeek) {
        if (!Number.isInteger(d) || d < 0 || d > 6) {
          throw new Error(
            `Invalid recurring.daysOfWeek entry: ${d} (must be integer 0..6)`
          );
        }
      }
    }

    const now = new Date().toISOString();

    const patch: Partial<Doc<"availabilityWindows">> = { updatedAt: now };
    if (args.startAt !== undefined) patch.startAt = args.startAt;
    if (args.endAt !== undefined) patch.endAt = args.endAt;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.recurring !== undefined) patch.recurring = args.recurring;
    if (args.status !== undefined) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = args.notes;

    await ctx.db.patch(args.windowId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "availability_window_updated",
      entityType: "availabilityWindows",
      entityId: args.windowId,
      details: JSON.stringify({
        changedFields: Object.keys(patch).filter((k) => k !== "updatedAt"),
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Soft-delete an availability window by setting its status to
 * "unavailable". We preserve the row for audit + reporting purposes
 * instead of calling ctx.db.delete, matching how we handle other
 * regulated lifecycle state in this codebase.
 */
export const deleteWindow = mutation({
  args: { windowId: v.id("availabilityWindows") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const existing = await ctx.db.get(args.windowId);
    if (!existing) throw new Error("Availability window not found");

    if (!canAccessOwner(user, existing.ownerType, existing.ownerId)) {
      throw new Error("Not authorized to delete this availability window");
    }

    const now = new Date().toISOString();

    await ctx.db.patch(args.windowId, {
      status: "unavailable",
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "availability_window_deleted",
      entityType: "availabilityWindows",
      entityId: args.windowId,
      details: JSON.stringify({
        previousStatus: existing.status,
        ownerType: existing.ownerType,
        ownerId: existing.ownerId,
      }),
      timestamp: now,
    });

    return null;
  },
});
