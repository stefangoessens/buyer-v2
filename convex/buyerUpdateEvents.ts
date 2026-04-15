import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import {
  buyerEventPriority,
  buyerEventResolvedBy,
  buyerEventState,
  buyerEventStatus,
  buyerEventType,
} from "./lib/validators";
import {
  applyBuyerEventEmission,
  applyBuyerEventResolution,
  defaultBuyerEventNotificationDefaults,
  composeBuyerEventFeed,
  defaultPriorityFor,
  makeDedupeKey,
  summarizeBuyerEventState,
  type BuyerEventResolvedBy,
  type BuyerEventState,
  type BuyerEventFeedReadModel,
  type BuyerEventStorageRecord,
  type BuyerEventType,
} from "./lib/buyerEvents";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type BuyerEventWebhookTransition =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed";

const emitContextValidator = v.optional(
  v.object({
    tourId: v.optional(v.id("tours")),
    offerId: v.optional(v.id("offers")),
    contractId: v.optional(v.id("contracts")),
    propertyId: v.optional(v.id("properties")),
    linkUrl: v.optional(v.string()),
    extra: v.optional(v.string()),
  }),
);

const buyerEventReadModelValidator = v.object({
  id: v.id("buyerUpdateEvents"),
  buyerId: v.id("users"),
  dealRoomId: v.id("dealRooms"),
  eventType: buyerEventType,
  state: buyerEventState,
  summary: v.object({
    label: v.string(),
    detailItems: v.array(
      v.object({
        key: v.string(),
        value: v.string(),
      }),
    ),
  }),
  lifecycle: v.object({
    status: buyerEventStatus,
    isLive: v.boolean(),
    emittedAt: v.string(),
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(buyerEventResolvedBy),
  }),
  delivery: v.object({
    priority: buyerEventPriority,
    dedupeKey: v.string(),
    dedupeCount: v.number(),
    lastDedupedAt: v.optional(v.string()),
  }),
});

const buyerEventFeedValidator = v.object({
  items: v.array(buyerEventReadModelValidator),
  counts: v.object({
    total: v.number(),
    live: v.number(),
    resolved: v.number(),
    superseded: v.number(),
  }),
});

interface EmitInternalArgs {
  buyerId: Id<"users">;
  dealRoomId: Id<"dealRooms">;
  state: BuyerEventState;
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

async function emitCore(
  ctx: MutationCtx,
  args: EmitInternalArgs,
): Promise<{ id: Id<"buyerUpdateEvents">; bumped: boolean }> {
  const now = new Date().toISOString();

  const dealRoom = await ctx.db.get(args.dealRoomId);
  if (!dealRoom) {
    throw new Error("Deal room not found");
  }
  if (dealRoom.buyerId !== args.buyerId) {
    throw new Error("Deal room does not belong to this buyer");
  }

  const dedupeKey = makeDedupeKey(args.state.kind, args.state.referenceId);
  const existing = await ctx.db
    .query("buyerUpdateEvents")
    .withIndex("by_buyerId_and_dealRoomId_and_dedupeKey", (q) =>
      q
        .eq("buyerId", args.buyerId)
        .eq("dealRoomId", args.dealRoomId)
        .eq("dedupeKey", dedupeKey),
    )
    .unique();

  const decision = applyBuyerEventEmission(
    existing ? toStorageRecord(existing) : null,
    {
      buyerId: args.buyerId,
      dealRoomId: args.dealRoomId,
      state: args.state,
      priority: args.priority,
      now,
    },
  );

  if (decision.action === "ignore") {
    return { id: existing!._id, bumped: false };
  }

  const summary = summarizeBuyerEventState(decision.record.state);
  const legacyBody = summarizeLegacyBody(summary.detailItems);

  if (decision.action === "bump" && existing) {
    const patch: Partial<Doc<"buyerUpdateEvents">> = {
      eventType: decision.record.eventType,
      state: decision.record.state,
      category: decision.record.category,
      urgency: decision.record.urgency,
      deliveryState: decision.record.deliveryState,
      title: summary.label,
      body: legacyBody,
      dedupeKey: decision.record.dedupeKey,
      status: decision.record.status,
      priority: decision.record.priority,
      emittedAt: decision.record.emittedAt,
      resolvedAt: decision.record.resolvedAt,
      resolvedBy: decision.record.resolvedBy,
      dispatchedAt: decision.record.dispatchedAt,
      deliveredAt: decision.record.deliveredAt,
      failedReason: decision.record.failedReason,
      dedupeCount: decision.record.dedupeCount,
      lastDedupedAt: decision.record.lastDedupedAt,
      updatedAt: decision.record.updatedAt,
    };

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
        eventType: decision.record.eventType,
        dedupeKey: decision.record.dedupeKey,
        dedupeCount: decision.record.dedupeCount,
      }),
      timestamp: now,
    });

    return { id: existing._id, bumped: true };
  }

  const id = await ctx.db.insert("buyerUpdateEvents", {
    buyerId: args.buyerId,
    dealRoomId: args.dealRoomId,
    eventType: decision.record.eventType,
    state: decision.record.state,
    category: decision.record.category,
    urgency: decision.record.urgency,
    deliveryState: decision.record.deliveryState,
    title: summary.label,
    body: legacyBody,
    dedupeKey: decision.record.dedupeKey,
    status: decision.record.status,
    priority:
      decision.record.priority ?? defaultPriorityFor(decision.record.eventType),
    context: args.context,
    emittedAt: decision.record.emittedAt,
    dispatchedAt: decision.record.dispatchedAt,
    deliveredAt: decision.record.deliveredAt,
    failedReason: decision.record.failedReason,
    dedupeCount: decision.record.dedupeCount,
    createdAt: decision.record.createdAt,
    updatedAt: decision.record.updatedAt,
  });

  await ctx.db.insert("auditLog", {
    userId: args.actorUserId ?? undefined,
    action: "buyer_update_event_emitted",
    entityType: "buyerUpdateEvents",
    entityId: id,
    details: JSON.stringify({
      buyerId: args.buyerId,
      dealRoomId: args.dealRoomId,
      eventType: decision.record.eventType,
      dedupeKey: decision.record.dedupeKey,
      priority: decision.record.priority,
    }),
    timestamp: now,
  });

  return { id, bumped: false };
}

export const getPendingForBuyer = query({
  args: {
    buyerId: v.optional(v.id("users")),
  },
  returns: buyerEventFeedValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const targetBuyerId = args.buyerId ?? user._id;

    const isSelf = user._id === targetBuyerId;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isSelf && !isStaff) {
      throw new Error("Not authorized to read these events");
    }

    const pending = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_buyerId_and_status", (q) =>
        q.eq("buyerId", targetBuyerId).eq("status", "pending"),
      )
      .collect();

    const seen = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_buyerId_and_status", (q) =>
        q.eq("buyerId", targetBuyerId).eq("status", "seen"),
      )
      .collect();

    return toFeedResult([...pending, ...seen]);
  },
});

export const getForDealRoom = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    status: v.optional(buyerEventStatus),
  },
  returns: buyerEventFeedValidator,
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

    const rows = args.status
      ? await ctx.db
          .query("buyerUpdateEvents")
          .withIndex("by_dealRoomId_and_status", (q) =>
            q.eq("dealRoomId", args.dealRoomId).eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("buyerUpdateEvents")
          .withIndex("by_dealRoomId_and_status", (q) =>
            q.eq("dealRoomId", args.dealRoomId),
          )
          .collect();

    return toFeedResult(rows);
  },
});

export const getByBuyerId = query({
  args: {
    buyerId: v.id("users"),
  },
  returns: buyerEventFeedValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const isSelf = user._id === args.buyerId;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isSelf && !isStaff) {
      throw new Error("Not authorized to read events for this buyer");
    }

    const rows = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_buyerId_and_emittedAt", (q) => q.eq("buyerId", args.buyerId))
      .order("desc")
      .collect();

    return toFeedResult(rows);
  },
});

export const emit = mutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
    state: buyerEventState,
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
      if (!isOwner && !isStaff) {
        throw new Error("Not authorized to resolve this event");
      }
    } else if (!isStaff) {
      throw new Error("Only brokers and admins can resolve as 'broker'");
    }

    const now = new Date().toISOString();
    const next = applyBuyerEventResolution(
      toStorageRecord(event),
      args.resolvedBy as BuyerEventResolvedBy,
      now,
    );

    if (
      next.status === event.status &&
      next.resolvedAt === event.resolvedAt &&
      next.resolvedBy === event.resolvedBy
    ) {
      return null;
    }

    await ctx.db.patch(event._id, {
      status: next.status,
      resolvedAt: next.resolvedAt,
      resolvedBy: next.resolvedBy,
      updatedAt: next.updatedAt,
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

export const emitInternal = internalMutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
    state: buyerEventState,
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

export async function applyBuyerEventDeliveryUpdate(
  ctx: Pick<MutationCtx, "db">,
  args: {
    eventId: Id<"buyerUpdateEvents">;
    transition: BuyerEventWebhookTransition;
    occurredAt: string;
    failedReason?: string;
  },
): Promise<boolean> {
  const row = await ctx.db.get(args.eventId);
  if (!row) {
    return false;
  }

  const patch: Partial<Doc<"buyerUpdateEvents">> = {
    updatedAt: args.occurredAt,
  };

  switch (args.transition) {
    case "sent":
      if (row.deliveryState !== "delivered") {
        patch.deliveryState = "dispatched";
      }
      patch.dispatchedAt = row.dispatchedAt ?? args.occurredAt;
      break;
    case "delivered":
    case "opened":
    case "clicked":
      patch.deliveryState = "delivered";
      patch.dispatchedAt = row.dispatchedAt ?? args.occurredAt;
      patch.deliveredAt = row.deliveredAt ?? args.occurredAt;
      patch.failedReason = undefined;
      break;
    case "bounced":
    case "failed":
    case "suppressed":
      if (row.deliveryState !== "delivered") {
        patch.deliveryState = "failed";
        patch.failedReason = args.failedReason ?? args.transition;
      }
      patch.dispatchedAt = row.dispatchedAt ?? args.occurredAt;
      break;
    case "complained":
      // Complaints happen after delivery. Preserve the delivered state but
      // capture the complaint marker in failedReason for ops review.
      patch.deliveryState = row.deliveryState ?? "delivered";
      patch.deliveredAt = row.deliveredAt ?? args.occurredAt;
      patch.failedReason = args.failedReason ?? "complained";
      break;
  }

  await ctx.db.patch(row._id, patch);
  return true;
}

function toStorageRecord(
  row: Doc<"buyerUpdateEvents">,
): BuyerEventStorageRecord {
  const defaults = defaultBuyerEventNotificationDefaults(row.eventType);
  return {
    id: row._id,
    buyerId: row.buyerId,
    dealRoomId: row.dealRoomId,
    eventType: row.eventType,
    state: row.state ?? {
      kind: row.eventType,
      referenceId: referenceIdFromDedupeKey(row.dedupeKey),
    },
    category: row.category ?? defaults.category,
    urgency: row.urgency ?? defaults.urgency,
    deliveryState: row.deliveryState ?? defaults.deliveryState,
    dedupeKey: row.dedupeKey,
    status: row.status,
    priority: row.priority,
    emittedAt: row.emittedAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    dispatchedAt: row.dispatchedAt,
    deliveredAt: row.deliveredAt,
    failedReason: row.failedReason,
    dedupeCount: row.dedupeCount,
    lastDedupedAt: row.lastDedupedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function referenceIdFromDedupeKey(dedupeKey: string): string {
  const separator = dedupeKey.indexOf(":");
  if (separator < 0) return "";
  return dedupeKey.slice(separator + 1);
}

function summarizeLegacyBody(
  items: Array<{ key: string; value: string }>,
): string | undefined {
  if (items.length === 0) return undefined;
  return items.map((item) => `${item.key}=${item.value}`).join(" | ");
}

function toFeedResult(
  rows: Array<Doc<"buyerUpdateEvents">>,
): {
  items: Array<{
    id: Id<"buyerUpdateEvents">;
    buyerId: Id<"users">;
    dealRoomId: Id<"dealRooms">;
    eventType: BuyerEventType;
    state: BuyerEventState;
    summary: {
      label: string;
      detailItems: Array<{ key: string; value: string }>;
    };
    lifecycle: {
      status: "pending" | "seen" | "resolved" | "superseded";
      isLive: boolean;
      emittedAt: string;
      resolvedAt?: string;
      resolvedBy?: BuyerEventResolvedBy;
    };
    delivery: {
      priority: "low" | "normal" | "high";
      dedupeKey: string;
      dedupeCount: number;
      lastDedupedAt?: string;
    };
  }>;
  counts: BuyerEventFeedReadModel["counts"];
} {
  const feed = composeBuyerEventFeed(rows.map((row) => toStorageRecord(row)));
  return {
    items: feed.items.map((item) => ({
      ...item,
      id: item.id as Id<"buyerUpdateEvents">,
      buyerId: item.buyerId as Id<"users">,
      dealRoomId: item.dealRoomId as Id<"dealRooms">,
    })),
    counts: feed.counts,
  };
}
