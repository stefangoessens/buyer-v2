import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  CHANNEL_CONFIGS,
  FAILURE_BLOCK_THRESHOLD,
  checkRateLimit,
  recordFailure,
  recordSuccess,
  shouldFlagSuspiciousSpike,
  toExplicitRateLimitState,
  type BucketSnapshot,
  type Channel,
  type ExplicitRateLimitState,
  type RateLimitState,
} from "./rateLimiter";

type PersistedRateLimitBucket = Doc<"rateLimitBuckets">;

function toSnapshot(doc: PersistedRateLimitBucket): BucketSnapshot {
  return {
    requestTimestamps: doc.requestTimestamps,
    consecutiveFailures: doc.consecutiveFailures,
    blockedUntil: doc.blockedUntil,
  };
}

function activeRequestCount(
  bucket: BucketSnapshot,
  channel: Channel,
  now: Date,
): number {
  const windowStartMs = now.getTime() - CHANNEL_CONFIGS[channel].windowMs;
  return bucket.requestTimestamps.filter((iso) => {
    const timestamp = new Date(iso).getTime();
    return !Number.isNaN(timestamp) && timestamp > windowStartMs;
  }).length;
}

export function makeThrottleKey(channel: Channel, identifier: string): string {
  return `${channel}:${identifier}`;
}

export async function checkAndPersistRateLimit(
  ctx: MutationCtx,
  args: { channel: Channel; identifier: string },
): Promise<{
  state: RateLimitState;
  throttleKey: string;
  callerState?: ExplicitRateLimitState;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  const throttleKey = makeThrottleKey(args.channel, args.identifier);

  const existing = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_throttleKey", (q) => q.eq("throttleKey", throttleKey))
    .unique();

  const previouslyBlocked =
    existing?.blockedUntil !== undefined &&
    new Date(existing.blockedUntil).getTime() <= now.getTime();

  const bucketBefore: BucketSnapshot = existing
    ? toSnapshot(existing)
    : {
        requestTimestamps: [],
        consecutiveFailures: 0,
        blockedUntil: undefined,
      };

  const previousActiveCount = activeRequestCount(bucketBefore, args.channel, now);
  const { state, nextBucket } = checkRateLimit(bucketBefore, args.channel, now);

  if (existing) {
    await ctx.db.patch(existing._id, {
      requestTimestamps: nextBucket.requestTimestamps,
      consecutiveFailures: nextBucket.consecutiveFailures,
      blockedUntil: nextBucket.blockedUntil,
      lastRequestAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    await ctx.db.insert("rateLimitBuckets", {
      throttleKey,
      channel: args.channel,
      requestTimestamps: nextBucket.requestTimestamps,
      consecutiveFailures: nextBucket.consecutiveFailures,
      blockedUntil: nextBucket.blockedUntil,
      lastRequestAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  if (state.allowed) {
    if (
      shouldFlagSuspiciousSpike(
        args.channel,
        previousActiveCount,
        nextBucket.requestTimestamps.length,
      )
    ) {
      await ctx.db.insert("abuseEvents", {
        throttleKey,
        channel: args.channel,
        eventType: "suspicious_spike",
        details: JSON.stringify({
          activeRequests: nextBucket.requestTimestamps.length,
          threshold: Math.max(3, Math.ceil(CHANNEL_CONFIGS[args.channel].maxRequests * 0.8)),
          maxRequests: CHANNEL_CONFIGS[args.channel].maxRequests,
          windowMs: CHANNEL_CONFIGS[args.channel].windowMs,
        }),
        timestamp: nowIso,
      });
    } else if (previouslyBlocked) {
      await ctx.db.insert("abuseEvents", {
        throttleKey,
        channel: args.channel,
        eventType: "block_lifted",
        details: JSON.stringify({
          previouslyBlockedUntil: existing?.blockedUntil,
        }),
        timestamp: nowIso,
      });
    }

    return { state, throttleKey };
  }

  const callerState = toExplicitRateLimitState(state);

  if (state.reason === "window_exceeded") {
    await ctx.db.insert("abuseEvents", {
      throttleKey,
      channel: args.channel,
      eventType: "rate_limit_exceeded",
      details: JSON.stringify({
        maxRequests: CHANNEL_CONFIGS[args.channel].maxRequests,
        windowMs: CHANNEL_CONFIGS[args.channel].windowMs,
        consecutiveFailures: nextBucket.consecutiveFailures,
      }),
      timestamp: nowIso,
    });
    await ctx.db.insert("abuseEvents", {
      throttleKey,
      channel: args.channel,
      eventType: "block_applied",
      details: JSON.stringify({
        blockedUntil: state.blockedUntil,
        reason: state.reason,
      }),
      timestamp: nowIso,
    });
    await ctx.db.insert("auditLog", {
      action: "rate_limit_block_applied",
      entityType: "rateLimitBucket",
      entityId: throttleKey,
      details: JSON.stringify({
        channel: args.channel,
        reason: state.reason,
        blockedUntil: state.blockedUntil,
      }),
      timestamp: nowIso,
    });
  } else {
    await ctx.db.insert("abuseEvents", {
      throttleKey,
      channel: args.channel,
      eventType: "rate_limit_exceeded",
      details: JSON.stringify({
        blockedUntil: state.blockedUntil,
        reason: state.reason,
      }),
      timestamp: nowIso,
    });
  }

  return { state, throttleKey, callerState };
}

export async function recordRateLimitOutcome(
  ctx: MutationCtx,
  args: {
    channel: Channel;
    identifier: string;
    outcome: "success" | "failure";
  },
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const throttleKey = makeThrottleKey(args.channel, args.identifier);

  const existing = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_throttleKey", (q) => q.eq("throttleKey", throttleKey))
    .unique();

  if (!existing) {
    return;
  }

  const before = toSnapshot(existing);
  const nextSnapshot =
    args.outcome === "success"
      ? recordSuccess(before, now)
      : recordFailure(before, args.channel, now);

  await ctx.db.patch(existing._id, {
    requestTimestamps: nextSnapshot.requestTimestamps,
    consecutiveFailures: nextSnapshot.consecutiveFailures,
    blockedUntil: nextSnapshot.blockedUntil,
    lastRequestAt: nowIso,
    updatedAt: nowIso,
  });

  if (
    args.outcome === "failure" &&
    before.consecutiveFailures < FAILURE_BLOCK_THRESHOLD &&
    nextSnapshot.consecutiveFailures >= FAILURE_BLOCK_THRESHOLD
  ) {
    await ctx.db.insert("abuseEvents", {
      throttleKey,
      channel: args.channel,
      eventType: "repeated_failure",
      details: JSON.stringify({
        consecutiveFailures: nextSnapshot.consecutiveFailures,
        blockedUntil: nextSnapshot.blockedUntil,
      }),
      timestamp: nowIso,
    });

    if (nextSnapshot.blockedUntil) {
      await ctx.db.insert("abuseEvents", {
        throttleKey,
        channel: args.channel,
        eventType: "block_applied",
        details: JSON.stringify({
          blockedUntil: nextSnapshot.blockedUntil,
          reason: "repeated_failure",
        }),
        timestamp: nowIso,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "repeated_failure_block_applied",
      entityType: "rateLimitBucket",
      entityId: throttleKey,
      details: JSON.stringify({
        channel: args.channel,
        consecutiveFailures: nextSnapshot.consecutiveFailures,
        blockedUntil: nextSnapshot.blockedUntil,
      }),
      timestamp: nowIso,
    });
  }
}
