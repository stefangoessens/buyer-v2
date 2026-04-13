import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import { availabilityOwnerType, availabilityStatus } from "./lib/validators";
import { assertValidRange } from "./lib/scheduling";
import {
  applyAvailabilityWindowPatch,
  buildAvailabilityWindowState,
  type AvailabilityWindowState,
} from "./lib/availability";

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
//   - All create/update calls that touch time bounds are normalized into
//     requested + UTC window state so bad ISO strings, inverted or zero
//     windows, unknown timezones, and invalid constraints are rejected
//     before persistence.
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
const recurringSpecValidator = v.object({
  daysOfWeek: v.array(v.number()),
  until: v.optional(v.string()),
});

const schedulingConstraintsValidator = v.object({
  minimumNoticeMinutes: v.optional(v.number()),
  bufferBeforeMinutes: v.optional(v.number()),
  bufferAfterMinutes: v.optional(v.number()),
  maximumDurationMinutes: v.optional(v.number()),
});

const requestedWindowValidator = v.object({
  startAt: v.string(),
  endAt: v.string(),
  timezone: v.string(),
});

const normalizedWindowValidator = v.object({
  startUtc: v.string(),
  endUtc: v.string(),
  durationMs: v.number(),
});

const availabilityWindowViewValidator = v.object({
  id: v.id("availabilityWindows"),
  ownerType: availabilityOwnerType,
  ownerId: v.string(),
  requestedWindow: requestedWindowValidator,
  normalizedWindow: normalizedWindowValidator,
  recurring: v.optional(recurringSpecValidator),
  constraints: v.optional(schedulingConstraintsValidator),
  status: availabilityStatus,
  notes: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

function validateRecurring(
  recurring: Doc<"availabilityWindows">["recurring"] | undefined,
): void {
  if (recurring?.until !== undefined) {
    const untilDate = new Date(recurring.until);
    if (Number.isNaN(untilDate.getTime())) {
      throw new Error(`Invalid recurring.until ISO date: ${recurring.until}`);
    }
  }

  if (!recurring) return;

  for (const day of recurring.daysOfWeek) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error(
        `Invalid recurring.daysOfWeek entry: ${day} (must be integer 0..6)`,
      );
    }
  }
}

function hydrateAvailabilityState(
  row: Pick<
    Doc<"availabilityWindows">,
    | "startAt"
    | "endAt"
    | "timezone"
    | "requestedWindow"
    | "normalizedWindow"
    | "constraints"
  >,
): AvailabilityWindowState {
  if (row.requestedWindow && row.normalizedWindow) {
    return {
      requestedWindow: row.requestedWindow,
      normalizedWindow: row.normalizedWindow,
      constraints: row.constraints,
    };
  }

  const state = buildAvailabilityWindowState(
    {
      startAt: row.startAt,
      endAt: row.endAt,
      timezone: row.timezone,
    },
    row.constraints,
  );

  if (!state.valid) {
    const details = state.errors.map((error) => error.message).join("; ");
    throw new Error(`Availability window is stored in an invalid state: ${details}`);
  }

  return state.state;
}

function serializeAvailabilityWindow(row: Doc<"availabilityWindows">) {
  const state = hydrateAvailabilityState(row);
  return {
    id: row._id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    requestedWindow: state.requestedWindow,
    normalizedWindow: state.normalizedWindow,
    recurring: row.recurring,
    constraints: state.constraints,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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
  returns: v.array(availabilityWindowViewValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!canAccessOwner(user, args.ownerType, args.ownerId)) return [];

    const windows = await ctx.db
      .query("availabilityWindows")
      .withIndex("by_ownerType_and_ownerId", (q) =>
        q.eq("ownerType", args.ownerType).eq("ownerId", args.ownerId)
      )
      .collect();

    const filtered = args.status
      ? windows.filter((window) => window.status === args.status)
      : windows;

    return filtered.map(serializeAvailabilityWindow);
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
  returns: v.array(availabilityWindowViewValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!canAccessOwner(user, args.ownerType, args.ownerId)) return [];

    // Validate the range — relaxed rules (no 1-week cap) since callers
    // legitimately fetch month-wide calendar views. Still rejects bad ISO,
    // missing timezone designators, and reversed/zero ranges.
    const range = assertValidRange(args.rangeStartUtc, args.rangeEndUtc);

    const windows = await ctx.db
      .query("availabilityWindows")
      .withIndex("by_ownerType_and_ownerId", (q) =>
        q.eq("ownerType", args.ownerType).eq("ownerId", args.ownerId)
      )
      .collect();

    return windows
      .filter((window) => {
        const state = hydrateAvailabilityState(window);
        return (
          state.normalizedWindow.startUtc < range.endUtc &&
          range.startUtc < state.normalizedWindow.endUtc
        );
      })
      .map(serializeAvailabilityWindow);
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
    recurring: v.optional(recurringSpecValidator),
    constraints: v.optional(schedulingConstraintsValidator),
    status: availabilityStatus,
    notes: v.optional(v.string()),
  },
  returns: v.id("availabilityWindows"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (!canAccessOwner(user, args.ownerType, args.ownerId)) {
      throw new Error("Not authorized to create availability for this owner");
    }

    const schedulingState = buildAvailabilityWindowState(
      {
        startAt: args.startAt,
        endAt: args.endAt,
        timezone: args.timezone,
      },
      args.constraints,
    );
    if (!schedulingState.valid) {
      const details = schedulingState.errors
        .map((error) => `${error.code}: ${error.message}`)
        .join("; ");
      throw new Error(`Invalid availability window — ${details}`);
    }
    validateRecurring(args.recurring);

    const now = new Date().toISOString();

    const windowId = await ctx.db.insert("availabilityWindows", {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      startAt: args.startAt,
      endAt: args.endAt,
      timezone: args.timezone,
      requestedWindow: schedulingState.state.requestedWindow,
      normalizedWindow: schedulingState.state.normalizedWindow,
      recurring: args.recurring,
      constraints: schedulingState.state.constraints,
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
        hasConstraints: schedulingState.state.constraints !== undefined,
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
    recurring: v.optional(recurringSpecValidator),
    constraints: v.optional(schedulingConstraintsValidator),
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

    const schedulingState = applyAvailabilityWindowPatch(
      hydrateAvailabilityState(existing),
      {
        startAt: args.startAt,
        endAt: args.endAt,
        timezone: args.timezone,
        constraints: args.constraints,
      },
    );
    if (!schedulingState.valid) {
      const details = schedulingState.errors
        .map((error) => `${error.code}: ${error.message}`)
        .join("; ");
      throw new Error(`Invalid availability window — ${details}`);
    }
    validateRecurring(args.recurring ?? existing.recurring);

    const now = new Date().toISOString();

    const patch: Partial<Doc<"availabilityWindows">> = { updatedAt: now };
    if (args.startAt !== undefined) patch.startAt = args.startAt;
    if (args.endAt !== undefined) patch.endAt = args.endAt;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (
      args.startAt !== undefined ||
      args.endAt !== undefined ||
      args.timezone !== undefined ||
      args.constraints !== undefined
    ) {
      patch.requestedWindow = schedulingState.state.requestedWindow;
      patch.normalizedWindow = schedulingState.state.normalizedWindow;
    }
    if (args.recurring !== undefined) patch.recurring = args.recurring;
    if (args.constraints !== undefined) {
      patch.constraints = schedulingState.state.constraints;
    }
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
