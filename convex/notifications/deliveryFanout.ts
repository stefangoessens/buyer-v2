import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  defaultBuyerEventNotificationDefaults,
  type BuyerEventDeliveryState,
  type BuyerEventDeliveryUrgency,
  type BuyerEventType,
} from "../lib/buyerEvents";
import {
  defaultNotificationDeliveryMatrix,
  isWithinQuietHours,
  resolveEffectiveNotificationPreferences,
} from "./preferencesResolver";
import { getProviderAdapter } from "./providerAdapters";
import { getConvexNotificationRoutingRule } from "./routingRules";
import { getActiveSuppressionInternal, normalizeRecipientKey } from "./suppressionList";
import {
  buildDeliveryIdempotencyKey,
  type ExternalNotificationChannel,
  type NotificationCategory,
  type NotificationRoutingRule,
  type NotificationUrgency,
} from "@/lib/notifications/types";

export const FANOUT_BATCH_SIZE_DEFAULT = 100;
export const FANOUT_MAX_ATTEMPTS = 5;
export const FANOUT_BACKPRESSURE_THRESHOLD = 500;
export const FANOUT_RETRY_DELAYS_MS = [
  2_000,
  8_000,
  30_000,
  120_000,
  600_000,
] as const;

type FanoutCandidate = Doc<"buyerUpdateEvents">;
type DeliveryAttemptRow = Doc<"notificationDeliveryAttempts">;
type DeliveryChannel = ExternalNotificationChannel;
type FanoutConfig = {
  enabled: boolean;
  batchSize: number;
  maxAttempts: number;
};
type PreferenceSnapshot = {
  deliveryMatrix: ReturnType<typeof defaultNotificationDeliveryMatrix>;
  quietHours: Doc<"messageDeliveryPreferences">["quietHours"] | null;
};
type BackpressureResult = {
  selected: FanoutCandidate[];
  shed: FanoutCandidate[];
};
type ConvexRoutingRule = {
  eventType: BuyerEventType;
  category: NotificationCategory;
  urgency: NotificationUrgency;
  externalChannels: ReadonlyArray<DeliveryChannel>;
  templateKey: string;
  quietHoursBypass?: boolean;
  suppressionBypass?: boolean;
  safetyBypass?: boolean;
};

type AnyInternalQueryRef = FunctionReference<"query", "internal", any, any>;
type AnyInternalMutationRef = FunctionReference<
  "mutation",
  "internal",
  any,
  any
>;

const externalDeliveryChannelValidator = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("push"),
);

const attemptChannelValidator = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("push"),
  v.literal("in_app"),
);

const deliveryStateValidator = v.union(
  v.literal("pending"),
  v.literal("dispatched"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("skipped_by_preference"),
);

const candidateValidator = v.object({
  _id: v.id("buyerUpdateEvents"),
  _creationTime: v.number(),
  buyerId: v.id("users"),
  dealRoomId: v.id("dealRooms"),
  eventType: v.string(),
  state: v.optional(v.any()),
  category: v.optional(
    v.union(
      v.literal("transactional"),
      v.literal("tours"),
      v.literal("offers"),
      v.literal("closing"),
      v.literal("disclosures"),
      v.literal("market_updates"),
      v.literal("marketing"),
      v.literal("safety"),
    ),
  ),
  urgency: v.optional(
    v.union(
      v.literal("transactional_must_deliver"),
      v.literal("transactional"),
      v.literal("relationship"),
      v.literal("digest_only"),
    ),
  ),
  deliveryState: v.optional(deliveryStateValidator),
  title: v.string(),
  body: v.optional(v.string()),
  dedupeKey: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("seen"),
    v.literal("resolved"),
    v.literal("superseded"),
  ),
  priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high")),
  context: v.optional(v.any()),
  emittedAt: v.string(),
  resolvedAt: v.optional(v.string()),
  resolvedBy: v.optional(
    v.union(v.literal("buyer"), v.literal("system"), v.literal("broker")),
  ),
  dedupeCount: v.number(),
  lastDedupedAt: v.optional(v.string()),
  dispatchedAt: v.optional(v.string()),
  deliveredAt: v.optional(v.string()),
  failedReason: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const attemptValidator = v.object({
  _id: v.id("notificationDeliveryAttempts"),
  _creationTime: v.number(),
  eventId: v.id("buyerUpdateEvents"),
  recipientKey: v.string(),
  channel: attemptChannelValidator,
  adapter: v.optional(v.string()),
  attemptNumber: v.number(),
  status: v.union(
    v.literal("queued"),
    v.literal("dispatched"),
    v.literal("delivered"),
    v.literal("failed"),
    v.literal("skipped"),
  ),
  reason: v.optional(v.string()),
  providerEventId: v.optional(v.string()),
  providerMessageId: v.optional(v.string()),
  attemptedAt: v.string(),
  dispatchedAt: v.optional(v.string()),
  deliveredAt: v.optional(v.string()),
  failedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const preferenceSnapshotValidator = v.object({
  deliveryMatrix: v.object({
    transactional: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
    tours: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
    offers: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
    closing: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
    disclosures: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
    market_updates: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
    marketing: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
    safety: v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
      in_app: v.boolean(),
    }),
  }),
  quietHours: v.union(
    v.null(),
    v.object({
      enabled: v.boolean(),
      timeZone: v.string(),
      start: v.string(),
      end: v.string(),
      suppressSms: v.boolean(),
      suppressPush: v.boolean(),
    }),
  ),
});

const fanoutConfigValidator = v.object({
  enabled: v.boolean(),
  batchSize: v.number(),
  maxAttempts: v.number(),
});

export const getPreferenceSnapshot = internalQuery({
  args: {
    buyerId: v.id("users"),
  },
  returns: preferenceSnapshotValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.buyerId))
      .unique();

    if (!row) {
      return {
        deliveryMatrix: defaultNotificationDeliveryMatrix(),
        quietHours: null,
      };
    }

    return resolveEffectiveNotificationPreferences(row, {
      quietHours: row.quietHours ?? null,
    });
  },
});

export const getFanoutConfig = internalQuery({
  args: {},
  returns: fanoutConfigValidator,
  handler: async (ctx) => {
    const enabledRow = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) => q.eq("key", "rollout.notifications_fanout_enabled"))
      .unique();
    const batchSizeRow = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) => q.eq("key", "notifications.fanout_batch_size"))
      .unique();
    const retryRow = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) => q.eq("key", "notifications.retry_max_attempts"))
      .unique();

    return {
      enabled: enabledRow?.booleanValue ?? false,
      batchSize: batchSizeRow?.numberValue ?? FANOUT_BATCH_SIZE_DEFAULT,
      maxAttempts: retryRow?.numberValue ?? FANOUT_MAX_ATTEMPTS,
    };
  },
});

export const listDeliveryCandidates = internalQuery({
  args: {},
  returns: v.array(candidateValidator),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_deliveryState_and_emittedAt", (q) =>
        q.eq("deliveryState", "pending"),
      )
      .collect();
    const failed = await ctx.db
      .query("buyerUpdateEvents")
      .withIndex("by_deliveryState_and_emittedAt", (q) =>
        q.eq("deliveryState", "failed"),
      )
      .collect();

    return [...pending, ...failed].sort(compareCandidates);
  },
});

export const listAttemptsForEvent = internalQuery({
  args: {
    eventId: v.id("buyerUpdateEvents"),
  },
  returns: v.array(attemptValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notificationDeliveryAttempts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const recordDeliveryAttempt = internalMutation({
  args: {
    eventId: v.id("buyerUpdateEvents"),
    recipientKey: v.string(),
    channel: externalDeliveryChannelValidator,
    adapter: v.optional(v.string()),
    attemptNumber: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("dispatched"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    reason: v.optional(v.string()),
    providerEventId: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    attemptedAt: v.string(),
    dispatchedAt: v.optional(v.string()),
    deliveredAt: v.optional(v.string()),
    failedAt: v.optional(v.string()),
  },
  returns: v.id("notificationDeliveryAttempts"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationDeliveryAttempts")
      .withIndex("by_eventId_and_attemptNumber", (q) =>
        q.eq("eventId", args.eventId).eq("attemptNumber", args.attemptNumber),
      )
      .unique();

    const now = new Date().toISOString();
    const row = {
      eventId: args.eventId,
      recipientKey: args.recipientKey,
      channel: args.channel,
      adapter: args.adapter,
      attemptNumber: args.attemptNumber,
      status: args.status,
      reason: args.reason,
      providerEventId: args.providerEventId,
      providerMessageId: args.providerMessageId,
      attemptedAt: args.attemptedAt,
      dispatchedAt: args.dispatchedAt,
      deliveredAt: args.deliveredAt,
      failedAt: args.failedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies Omit<DeliveryAttemptRow, "_id" | "_creationTime">;

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }

    return await ctx.db.insert("notificationDeliveryAttempts", row);
  },
});

export const updateEventDeliveryState = internalMutation({
  args: {
    eventId: v.id("buyerUpdateEvents"),
    deliveryState: deliveryStateValidator,
    dispatchedAt: v.optional(v.string()),
    deliveredAt: v.optional(v.string()),
    failedReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.eventId);
    if (!row) {
      return null;
    }

    await ctx.db.patch(row._id, {
      deliveryState: args.deliveryState,
      dispatchedAt: args.dispatchedAt ?? row.dispatchedAt,
      deliveredAt: args.deliveredAt ?? row.deliveredAt,
      failedReason: args.failedReason,
      updatedAt: new Date().toISOString(),
    });

    return null;
  },
});

const getFanoutConfigRef = getFanoutConfig as unknown as AnyInternalQueryRef;
const listDeliveryCandidatesRef =
  listDeliveryCandidates as unknown as AnyInternalQueryRef;
const getPreferenceSnapshotRef =
  getPreferenceSnapshot as unknown as AnyInternalQueryRef;
const listAttemptsForEventRef =
  listAttemptsForEvent as unknown as AnyInternalQueryRef;
const getActiveSuppressionInternalRef =
  getActiveSuppressionInternal as unknown as AnyInternalQueryRef;
const recordDeliveryAttemptRef =
  recordDeliveryAttempt as unknown as AnyInternalMutationRef;
const updateEventDeliveryStateRef =
  updateEventDeliveryState as unknown as AnyInternalMutationRef;

export const runDeliveryFanout = internalAction({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    examined: v.number(),
    attempted: v.number(),
    skipped: v.number(),
    shed: v.number(),
  }),
  handler: async (ctx) => {
    const config = await ctx.runQuery(getFanoutConfigRef, {});
    if (!config.enabled) {
      return {
        enabled: false,
        examined: 0,
        attempted: 0,
        skipped: 0,
        shed: 0,
      };
    }

    const allCandidates = await ctx.runQuery(listDeliveryCandidatesRef, {});
    const { selected, shed } = applyFanoutBackpressure(allCandidates);
    let attempted = 0;
    let skipped = 0;

    for (const event of shed) {
      const rule = resolveRoutingRule(event);
      const attempts = await ctx.runQuery(listAttemptsForEventRef, {
        eventId: event._id,
      });
      const nextAttemptNumber = nextAttemptNumberForEvent(attempts);
      await ctx.runMutation(recordDeliveryAttemptRef, {
        eventId: event._id,
        recipientKey: normalizeRecipientKey(`user:${event.buyerId}`),
        channel: rule.externalChannels[0] ?? "email",
        adapter: undefined,
        attemptNumber: nextAttemptNumber,
        status: "skipped",
        reason: "backpressure_shed",
        attemptedAt: new Date().toISOString(),
      });
      await ctx.runMutation(updateEventDeliveryStateRef, {
        eventId: event._id,
        deliveryState: "failed",
        failedReason: "backpressure_shed",
      });
    }

    const grouped = groupCandidatesByRecipient(selected.slice(0, config.batchSize));
    for (const bucket of grouped) {
      for (const event of bucket.events) {
        if (event.status !== "pending" && event.status !== "seen") {
          continue;
        }

        const outcome = await dispatchEventAcrossChannels(ctx, {
          event,
          recipientKey: bucket.recipientKey,
          config,
        });
        attempted += outcome.attempted;
        skipped += outcome.skipped;
      }
    }

    return {
      enabled: true,
      examined: allCandidates.length,
      attempted,
      skipped,
      shed: shed.length,
    };
  },
});

async function dispatchEventAcrossChannels(
  ctx: ActionCtx,
  args: {
    event: FanoutCandidate;
    recipientKey: string;
    config: FanoutConfig;
  },
): Promise<{ attempted: number; skipped: number }> {
  const nowIso = new Date().toISOString();
  const rule = resolveRoutingRule(args.event);
  const preferenceSnapshot = await ctx.runQuery(getPreferenceSnapshotRef, {
    buyerId: args.event.buyerId,
  });
  const attempts = await ctx.runQuery(listAttemptsForEventRef, {
    eventId: args.event._id,
  });

  let attempted = 0;
  let skipped = 0;
  let anyDelivered = false;
  let anyDispatched = false;
  let waitingForLater = false;
  let skippedByPreferenceOrSuppression = true;
  let allTerminalFailures = true;
  let nextAttemptNumber = nextAttemptNumberForEvent(attempts);

  for (const channel of rule.externalChannels) {
    const channelAttempts = attemptsForChannel(attempts, channel);
    const latestAttempt = channelAttempts[channelAttempts.length - 1] ?? null;

    if (
      latestAttempt?.status === "dispatched" ||
      latestAttempt?.status === "delivered"
    ) {
      skippedByPreferenceOrSuppression = false;
      anyDispatched = true;
      if (latestAttempt.status === "delivered") {
        anyDelivered = true;
      }
      allTerminalFailures = false;
      continue;
    }

    if (latestAttempt?.status === "failed") {
      if (channelAttempts.length >= args.config.maxAttempts) {
        skippedByPreferenceOrSuppression = false;
        continue;
      }

      const lastAttemptAt = latestAttempt.failedAt ?? latestAttempt.attemptedAt;
      if (!retryDue(lastAttemptAt, channelAttempts.length)) {
        waitingForLater = true;
        allTerminalFailures = false;
        continue;
      }
    }

    const blockReason = await getChannelBlockReason(ctx, {
      event: args.event,
      rule,
      channel,
      recipientKey: args.recipientKey,
      preferenceSnapshot,
    });

    if (blockReason === "quiet_hours") {
      waitingForLater = true;
      allTerminalFailures = false;
      continue;
    }

    if (blockReason) {
      if (
        !(
          latestAttempt?.status === "skipped" &&
          latestAttempt.reason === blockReason
        )
      ) {
        await ctx.runMutation(recordDeliveryAttemptRef, {
          eventId: args.event._id,
          recipientKey: args.recipientKey,
          channel,
          adapter: undefined,
          attemptNumber: nextAttemptNumber,
          status: "skipped",
          reason: blockReason,
          attemptedAt: nowIso,
        });
        nextAttemptNumber += 1;
      }
      skipped += 1;
      continue;
    }

    skippedByPreferenceOrSuppression = false;
    const adapter = getProviderAdapter(channel);
    const attemptNumber = nextAttemptNumber;
    nextAttemptNumber += 1;
    const request = {
      eventId: String(args.event._id),
      eventType: args.event.eventType,
      dedupeKey: args.event.dedupeKey,
      recipientKey: args.recipientKey,
      channel,
      provider: adapter.name,
      category: rule.category,
      urgency: rule.urgency,
      attemptNumber,
      idempotencyKey: buildDeliveryIdempotencyKey({
        eventId: String(args.event._id),
        dedupeKey: args.event.dedupeKey,
        channel,
        attemptNumber,
      }),
      templateKey: rule.templateKey,
      metadata: {
        buyerId: String(args.event.buyerId),
        dealRoomId: String(args.event.dealRoomId),
      },
    } as const;

    const result = await adapter.send(request);
    attempted += 1;

    await ctx.runMutation(recordDeliveryAttemptRef, {
      eventId: args.event._id,
      recipientKey: args.recipientKey,
      channel,
      adapter: adapter.name,
      attemptNumber,
      status: mapDeliveryResultToAttemptStatus(result.status),
      reason: result.reason,
      providerEventId: result.providerEventId,
      providerMessageId: result.providerMessageId,
      attemptedAt: nowIso,
      dispatchedAt:
        result.status === "failed" || result.status === "skipped"
          ? undefined
          : nowIso,
      deliveredAt: result.status === "delivered" ? nowIso : undefined,
      failedAt: result.status === "failed" ? nowIso : undefined,
    });

    if (result.status === "delivered") {
      anyDelivered = true;
      anyDispatched = true;
      allTerminalFailures = false;
      continue;
    }

    if (result.status === "accepted" || result.status === "dispatched") {
      anyDispatched = true;
      allTerminalFailures = false;
      continue;
    }

    if (result.failureKind !== "permanent") {
      waitingForLater = true;
      allTerminalFailures = false;
    }
  }

  const nextState = deriveEventDeliveryState({
    anyDelivered,
    anyDispatched,
    waitingForLater,
    skippedByPreferenceOrSuppression,
    allTerminalFailures,
  });

  await ctx.runMutation(updateEventDeliveryStateRef, {
    eventId: args.event._id,
    deliveryState: nextState,
    dispatchedAt: anyDispatched ? nowIso : undefined,
    deliveredAt: anyDelivered ? nowIso : undefined,
    failedReason:
      nextState === "failed"
        ? "all_channels_failed"
        : nextState === "skipped_by_preference"
          ? "all_channels_skipped"
          : undefined,
  });

  return { attempted, skipped };
}

async function getChannelBlockReason(
  ctx: ActionCtx,
  args: {
    event: FanoutCandidate;
    rule: ConvexRoutingRule;
    channel: DeliveryChannel;
    recipientKey: string;
    preferenceSnapshot: PreferenceSnapshot;
  },
): Promise<"preference_disabled" | "suppressed" | "quiet_hours" | null> {
  if (args.rule.safetyBypass) {
    return null;
  }

  if (
    !args.preferenceSnapshot.deliveryMatrix[args.rule.category][
      toMatrixChannel(args.channel)
    ]
  ) {
    return "preference_disabled";
  }

  if (
    !args.rule.quietHoursBypass &&
    args.preferenceSnapshot.quietHours &&
    isWithinQuietHours(args.preferenceSnapshot.quietHours, new Date())
  ) {
    if (
      (args.channel === "sms" && args.preferenceSnapshot.quietHours.suppressSms) ||
      (args.channel === "push" && args.preferenceSnapshot.quietHours.suppressPush)
    ) {
      return "quiet_hours";
    }
  }

  if (args.rule.suppressionBypass) {
    return null;
  }

  const suppression = await ctx.runQuery(getActiveSuppressionInternalRef, {
    recipientKey: args.recipientKey,
    channel: args.channel,
  });
  return suppression ? "suppressed" : null;
}

export function deriveEventDeliveryState(args: {
  anyDelivered: boolean;
  anyDispatched: boolean;
  waitingForLater: boolean;
  skippedByPreferenceOrSuppression: boolean;
  allTerminalFailures: boolean;
}): BuyerEventDeliveryState {
  if (args.anyDelivered) {
    return "delivered";
  }
  if (args.anyDispatched) {
    return "dispatched";
  }
  if (args.waitingForLater) {
    return "pending";
  }
  if (args.skippedByPreferenceOrSuppression) {
    return "skipped_by_preference";
  }
  if (args.allTerminalFailures) {
    return "failed";
  }
  return "pending";
}

function resolveRoutingRule(event: FanoutCandidate): ConvexRoutingRule {
  const eventType = event.eventType as BuyerEventType;
  const defaults = defaultBuyerEventNotificationDefaults(eventType);
  const rule = getConvexNotificationRoutingRule(eventType);

  return {
    ...rule,
    category: event.category ?? rule.category ?? defaults.category,
    urgency: event.urgency ?? rule.urgency ?? defaults.urgency,
    externalChannels: rule.externalChannels.slice(),
  };
}

function groupCandidatesByRecipient(
  candidates: FanoutCandidate[],
): Array<{ recipientKey: string; events: FanoutCandidate[] }> {
  const groups = new Map<string, FanoutCandidate[]>();

  for (const candidate of candidates) {
    const recipientKey = normalizeRecipientKey(`user:${candidate.buyerId}`);
    const rows = groups.get(recipientKey);
    if (rows) {
      rows.push(candidate);
      continue;
    }
    groups.set(recipientKey, [candidate]);
  }

  return Array.from(groups.entries()).map(([recipientKey, events]) => ({
    recipientKey,
    events: events.sort(compareCandidates),
  }));
}

function mapDeliveryResultToAttemptStatus(
  status: "accepted" | "dispatched" | "delivered" | "failed" | "skipped",
): "dispatched" | "delivered" | "failed" | "skipped" {
  if (status === "delivered") {
    return "delivered";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "skipped") {
    return "skipped";
  }
  return "dispatched";
}

function toMatrixChannel(channel: DeliveryChannel): "email" | "sms" | "push" {
  return channel;
}

function attemptsForChannel(
  attempts: DeliveryAttemptRow[],
  channel: DeliveryChannel,
): DeliveryAttemptRow[] {
  return attempts
    .filter((attempt) => attempt.channel === channel)
    .sort((a, b) => a.attemptNumber - b.attemptNumber);
}

function nextAttemptNumberForEvent(attempts: DeliveryAttemptRow[]): number {
  return (
    attempts.reduce((max, attempt) => Math.max(max, attempt.attemptNumber), 0) + 1
  );
}

function retryDue(lastAttemptAt: string, channelAttemptCount: number): boolean {
  const retryDelay = getRetryDelayMs(channelAttemptCount);
  if (retryDelay === null) {
    return false;
  }

  return Date.now() >= new Date(lastAttemptAt).getTime() + retryDelay;
}

export function getRetryDelayMs(channelAttemptCount: number): number | null {
  if (channelAttemptCount <= 0) {
    return null;
  }

  if (channelAttemptCount > FANOUT_RETRY_DELAYS_MS.length) {
    return null;
  }

  return FANOUT_RETRY_DELAYS_MS[channelAttemptCount - 1] ?? null;
}

export function applyFanoutBackpressure(
  candidates: FanoutCandidate[],
): BackpressureResult {
  if (candidates.length <= FANOUT_BACKPRESSURE_THRESHOLD) {
    return { selected: candidates.slice(), shed: [] };
  }

  const selected = candidates.slice().sort(compareCandidates);
  const shed: FanoutCandidate[] = [];

  shedUntilThreshold(selected, shed, "digest_only");
  if (selected.length > FANOUT_BACKPRESSURE_THRESHOLD) {
    shedUntilThreshold(selected, shed, "relationship");
  }

  return { selected, shed };
}

function shedUntilThreshold(
  selected: FanoutCandidate[],
  shed: FanoutCandidate[],
  urgency: BuyerEventDeliveryUrgency,
): void {
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    if (selected.length <= FANOUT_BACKPRESSURE_THRESHOLD) {
      return;
    }

    if (resolveRoutingRule(selected[index]).urgency !== urgency) {
      continue;
    }

    const [candidate] = selected.splice(index, 1);
    if (candidate) {
      shed.push(candidate);
    }
  }
}

function compareCandidates(a: FanoutCandidate, b: FanoutCandidate): number {
  const urgencyDiff =
    urgencyRank(resolveRoutingRule(b).urgency) -
    urgencyRank(resolveRoutingRule(a).urgency);
  if (urgencyDiff !== 0) {
    return urgencyDiff;
  }

  return a.emittedAt.localeCompare(b.emittedAt);
}

function urgencyRank(urgency: NotificationUrgency): number {
  switch (urgency) {
    case "transactional_must_deliver":
      return 4;
    case "transactional":
      return 3;
    case "relationship":
      return 2;
    case "digest_only":
      return 1;
  }
}
