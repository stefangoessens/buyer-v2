import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import {
  buyerEventPriority,
  buyerEventResolvedBy,
  buyerEventStatus,
  buyerEventType,
} from "./lib/validators";
import {
  compareEventsForDisplay,
  defaultPriorityFor,
  makeDedupeKey,
  type BuyerEventType,
} from "./lib/buyerEvents";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════════════════
// Buyer Update Events (KIN-837)
//
// Typed event records used to surface updates to buyers — tour confirmed,
// offer countered, new comp arrived, etc. Events are kept separate from
// channel-specific rendering (email / push / SMS) so any delivery surface
// can consume them without coupling to the decision logic that emits them.
//
// Public surface:
//   QUERIES
//     - getPendingForBuyer: live events for the current buyer (or any buyer,
//       if a broker/admin calls it on behalf of someone)
//     - getForDealRoom: events for a specific deal room, optionally filtered
//       by status
//     - getByBuyerId: broker/admin helper — all events for a buyer across
//       all deal rooms
//   MUTATIONS
//     - emit: broker/admin path to emit a new event with dedupe
//     - markSeen: buyer marks their own event as seen
//     - resolve: buyer or broker marks an event resolved
//   INTERNAL
//     - emitInternal: same as emit but no auth check, for use by other
//       Convex functions (agreements, tours, offers, comps emitters)
//
// Every mutation writes an auditLog entry. Dedupe behavior is driven by the
// pure helper in `convex/lib/buyerEvents.ts` so the same decision runs from
// every call site.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Shared validators ─────────────────────────────────────────────────────

/**
 * Full buyer update event row validator — shared between query returns
 * and mutation returns so callers can rely on a single shape. Includes
 * the Convex system fields.
 */
const buyerEventDocValidator = v.object({
  _id: v.id("buyerUpdateEvents"),
  _creationTime: v.number(),
  buyerId: v.id("users"),
  dealRoomId: v.id("dealRooms"),
  eventType: buyerEventType,
  title: v.string(),
  body: v.optional(v.string()),
  dedupeKey: v.string(),
  status: buyerEventStatus,
  priority: buyerEventPriority,
  context: v.optional(
    v.object({
      tourId: v.optional(v.id("tours")),
      offerId: v.optional(v.id("offers")),
      contractId: v.optional(v.id("contracts")),
      propertyId: v.optional(v.id("properties")),
      linkUrl: v.optional(v.string()),
      extra: v.optional(v.string()),
    })
  ),
  emittedAt: v.string(),
  resolvedAt: v.optional(v.string()),
  resolvedBy: v.optional(buyerEventResolvedBy),
  dedupeCount: v.number(),
  lastDedupedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

/**
 * Optional context argument validator for emit-style mutations. Matches
 * the shape of the stored `context` field.
 */
const emitContextValidator = v.optional(
  v.object({
    tourId: v.optional(v.id("tours")),
    offerId: v.optional(v.id("offers")),
    contractId: v.optional(v.id("contracts")),
    propertyId: v.optional(v.id("properties")),
    linkUrl: v.optional(v.string()),
    extra: v.optional(v.string()),
  })
);

// ─── Internal emit core ────────────────────────────────────────────────────

interface EmitInternalArgs {
  buyerId: Id<"users">;
  dealRoomId: Id<"dealRooms">;
  eventType: BuyerEventType;
  title: string;
  body?: string;
  referenceId: string;
  priority?: "low" | "normal" | "high";
  context?: {
    tourId?: Id<"tours">;
    offerId?: Id<"offers">;
    contractId?: Id<"contracts">;
    propertyId?: Id<"properties">;
    linkUrl?: string;
    extra?: string;
  };
  actorUserId: Id<"users"> | null;
}

/**
 * Emit core — used by both the public `emit` mutation and the internal
 * `emitInternal` variant. Returns the event id (either fresh-inserted
 * or bumped existing) plus a flag for auditing.
 */
async function emitCore(
  ctx: MutationCtx,
  args: EmitInternalArgs
): Promise<{ id: Id<"buyerUpdateEvents">; bumped: boolean }> {
  const now = new Date().toISOString();
  const dedupeKey = makeDedupeKey(args.eventType, args.referenceId);
  const priority = args.priority ?? defaultPriorityFor(args.eventType);

  // Validate the deal room exists and matches the buyer — guards against
  // callers emitting events into mismatched pairs.
  const dealRoom = await ctx.db.get(args.dealRoomId);
  if (!dealRoom) {
    throw new Error("Deal room not found");
  }
  if (dealRoom.buyerId !== args.buyerId) {
    throw new Error("Deal room does not belong to this buyer");
  }

  // Look for an existing record with the same dedupe key for this buyer
  // and deal room. The compound index makes this an O(1) lookup.
  const existing = await ctx.db
    .query("buyerUpdateEvents")
    .withIndex("by_buyerId_and_dealRoomId_and_dedupeKey", (q) =>
      q
        .eq("buyerId", args.buyerId)
        .eq("dealRoomId", args.dealRoomId)
        .eq("dedupeKey", dedupeKey)
    )
    .unique();

  if (existing) {
    // Bump path — coalesce into the existing row.
    //
    // Preserve existing payload fields when the caller omits them, so
    // a lightweight re-emit (e.g. just refreshing the title for a
    // reminder) doesn't wipe previously stored body/context/linkUrl.
    // Patched fields are only overwritten when the caller supplies a
    // non-undefined value.
    //
    // Also refresh `emittedAt` so the bumped event sorts back to the
    // top of buyer queues — display ordering is by emittedAt desc, so
    // a stale timestamp would bury a re-surfaced update.
    const nextCount = existing.dedupeCount + 1;

    const patch: Partial<Doc<"buyerUpdateEvents">> = {
      title: args.title,
      priority,
      dedupeCount: nextCount,
      lastDedupedAt: now,
      emittedAt: now,
      // Resurrect resolved / superseded rows so re-emits re-surface the
      // event. A buyer that dismissed "tour reminder" and then the agent
      // reschedules should see the event again.
      status: "pending" as const,
      resolvedAt: undefined,
      resolvedBy: undefined,
      updatedAt: now,
    };
    if (args.body !== undefined) {
      patch.body = args.body;
    }
    if (args.context !== undefined) {
      patch.context = args.context;
    }

    await ctx.db.patch(existing._id, patch);

    await ctx.db.insert("auditLog", {
      userId: args.actorUserId ?? undefined,
      action: "buyer_update_event_bumped",
      entityType: "buyerUpdateEvents",
      entityId: existing._id,
      details: JSON.stringify({
        buyerId: args.buyerId,
        dealRoomId: args.dealRoomId,
        eventType: args.eventType,
        dedupeKey,
        dedupeCount: nextCount,
      }),
      timestamp: now,
    });

    return { id: existing._id, bumped: true };
  }

  // Fresh insert path.
  const id = await ctx.db.insert("buyerUpdateEvents", {
    buyerId: args.buyerId,
    dealRoomId: args.dealRoomId,
    eventType: args.eventType,
    title: args.title,
    body: args.body,
    dedupeKey,
    status: "pending" as const,
    priority,
    context: args.context,
    emittedAt: now,
    dedupeCount: 1,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("auditLog", {
    userId: args.actorUserId ?? undefined,
    action: "buyer_update_event_emitted",
    entityType: "buyerUpdateEvents",
    entityId: id,
    details: JSON.stringify({
      buyerId: args.buyerId,
      dealRoomId: args.dealRoomId,
      eventType: args.eventType,
      dedupeKey,
      priority,
    }),
    timestamp: now,
  });

  return { id, bumped: false };
}

// ═══ QUERIES ═══

/**
 * Get all pending (or pending + seen) events for a buyer. Buyers may read
 * their own; broker/admin may read any. When `buyerId` is omitted we
 * resolve it from the authenticated session.
 *
 * Returns events ordered by priority (high → low) then by most recent
 * `emittedAt` first, using the shared compare helper.
 */
export const getPendingForBuyer = query({
  args: {
    buyerId: v.optional(v.id("users")),
  },
  returns: v.array(buyerEventDocValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const targetBuyerId = args.buyerId ?? user._id;

    // Only buyers-reading-themselves or staff can access.
    const isSelf = user._id === targetBuyerId;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isSelf && !isStaff) {
      throw new Error("Not authorized to read these events");
    }

    const pending = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_buyerId_and_status", (q) =>
        q.eq("buyerId", targetBuyerId).eq("status", "pending")
      )
      .collect();

    const seen = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_buyerId_and_status", (q) =>
        q.eq("buyerId", targetBuyerId).eq("status", "seen")
      )
      .collect();

    // Merge both live statuses and sort with the shared comparator so
    // the UI and backend agree on ordering.
    const live: Doc<"buyerUpdateEvents">[] = [...pending, ...seen];
    live.sort((a, b) =>
      compareEventsForDisplay(
        { priority: a.priority, emittedAt: a.emittedAt },
        { priority: b.priority, emittedAt: b.emittedAt }
      )
    );
    return live;
  },
});

/**
 * Get events for a specific deal room, optionally filtered by status.
 * Buyers may only read rooms that belong to them.
 */
export const getForDealRoom = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    status: v.optional(buyerEventStatus),
  },
  returns: v.array(buyerEventDocValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) {
      throw new Error("Deal room not found");
    }

    const isOwner = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isStaff) {
      throw new Error("Not authorized to read events for this deal room");
    }

    let rows: Doc<"buyerUpdateEvents">[];
    if (args.status) {
      rows = await ctx.db
        .query("buyerUpdateEvents")
        .withIndex("by_dealRoomId_and_status", (q) =>
          q.eq("dealRoomId", args.dealRoomId).eq("status", args.status!)
        )
        .collect();
    } else {
      rows = await ctx.db
        .query("buyerUpdateEvents")
        .withIndex("by_dealRoomId_and_status", (q) =>
          q.eq("dealRoomId", args.dealRoomId)
        )
        .collect();
    }

    rows.sort((a, b) =>
      compareEventsForDisplay(
        { priority: a.priority, emittedAt: a.emittedAt },
        { priority: b.priority, emittedAt: b.emittedAt }
      )
    );
    return rows;
  },
});

/**
 * Broker/admin helper — all events for a buyer across every deal room,
 * ordered by most recent first. Used by the broker console for a
 * per-buyer inbox view. Buyers may read their own history.
 */
export const getByBuyerId = query({
  args: {
    buyerId: v.id("users"),
  },
  returns: v.array(buyerEventDocValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const isSelf = user._id === args.buyerId;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isSelf && !isStaff) {
      throw new Error("Not authorized to read events for this buyer");
    }

    const rows = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_buyerId_and_emittedAt", (q) =>
        q.eq("buyerId", args.buyerId)
      )
      .order("desc")
      .collect();
    return rows;
  },
});

// ═══ MUTATIONS ═══

/**
 * Public emit path — broker/admin only. Computes the dedupe key from
 * eventType + referenceId, then either bumps the existing row or inserts
 * a fresh one. Returns the event id in both cases.
 */
export const emit = mutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
    eventType: buyerEventType,
    title: v.string(),
    body: v.optional(v.string()),
    referenceId: v.string(),
    priority: v.optional(buyerEventPriority),
    context: emitContextValidator,
  },
  returns: v.id("buyerUpdateEvents"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can emit buyer update events");
    }

    const result = await emitCore(ctx, {
      ...args,
      actorUserId: user._id,
    });
    return result.id;
  },
});

/**
 * Buyer marks an event as seen. Buyers can only mark their own events;
 * staff can mark on behalf of a buyer. Does nothing if the event is
 * already seen / resolved / superseded (idempotent).
 */
export const markSeen = mutation({
  args: {
    eventId: v.id("buyerUpdateEvents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    const isOwner = event.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isStaff) {
      throw new Error("Not authorized to mark this event seen");
    }

    // Idempotent — already past "pending" stays where it is.
    if (event.status !== "pending") {
      return null;
    }

    const now = new Date().toISOString();
    await ctx.db.patch(event._id, {
      status: "seen" as const,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "buyer_update_event_seen",
      entityType: "buyerUpdateEvents",
      entityId: event._id,
      details: JSON.stringify({
        buyerId: event.buyerId,
        dealRoomId: event.dealRoomId,
        eventType: event.eventType,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Mark an event resolved. `resolvedBy` distinguishes between self-dismissal
 * ("buyer"), an auto-resolver ("system"), and a broker clearing the event
 * on behalf of the buyer ("broker"). Idempotent: resolving an already
 * resolved event is a no-op.
 */
export const resolve = mutation({
  args: {
    eventId: v.id("buyerUpdateEvents"),
    resolvedBy: v.union(v.literal("buyer"), v.literal("broker")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    const isOwner = event.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";

    if (args.resolvedBy === "buyer") {
      // A buyer resolution must come from the buyer themselves or from
      // staff acting on their behalf.
      if (!isOwner && !isStaff) {
        throw new Error("Not authorized to resolve this event");
      }
    } else {
      // A broker resolution can only be recorded by staff.
      if (!isStaff) {
        throw new Error("Only brokers and admins can resolve as 'broker'");
      }
    }

    // Idempotent.
    if (event.status === "resolved" || event.status === "superseded") {
      return null;
    }

    const now = new Date().toISOString();
    await ctx.db.patch(event._id, {
      status: "resolved" as const,
      resolvedAt: now,
      resolvedBy: args.resolvedBy,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "buyer_update_event_resolved",
      entityType: "buyerUpdateEvents",
      entityId: event._id,
      details: JSON.stringify({
        buyerId: event.buyerId,
        dealRoomId: event.dealRoomId,
        eventType: event.eventType,
        resolvedBy: args.resolvedBy,
      }),
      timestamp: now,
    });

    return null;
  },
});

// ═══ INTERNAL MUTATIONS ═══

/**
 * Internal emit — no auth check. Called by other Convex modules (the
 * agreements lifecycle, tour coordination, offer engine, comp emitter)
 * when they need to surface a buyer-facing event as part of their own
 * already-authorized mutation. `actorUserId` is recorded in the audit
 * log for provenance.
 */
export const emitInternal = internalMutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
    eventType: buyerEventType,
    title: v.string(),
    body: v.optional(v.string()),
    referenceId: v.string(),
    priority: v.optional(buyerEventPriority),
    context: emitContextValidator,
    actorUserId: v.optional(v.id("users")),
  },
  returns: v.id("buyerUpdateEvents"),
  handler: async (ctx, args) => {
    const { actorUserId, ...rest } = args;
    const result = await emitCore(ctx, {
      ...rest,
      actorUserId: actorUserId ?? null,
    });
    return result.id;
  },
});
