// ═══════════════════════════════════════════════════════════════════════════
// Intake Rate Limits & Abuse Controls — Convex Module (KIN-820)
//
// Persistence and API layer for the sliding-window rate limiter. The
// pure decision logic lives in `convex/lib/rateLimiter.ts` (mirrored
// in `src/lib/security/rate-limiter.ts`); this file is responsible
// for reading and writing `rateLimitBuckets`, emitting `abuseEvents`
// telemetry, and writing `auditLog` entries for abusive patterns.
//
// Public surface:
//
//   mutation  checkAndRecord(channel, identifier)
//       — called BEFORE any intake mutation runs. Looks up or creates
//         the bucket, runs `checkRateLimit`, persists the next bucket,
//         and returns a deterministic `RateLimitState`. The caller must
//         abort their flow if `allowed: false` is returned.
//
//   mutation  recordRequestOutcome(channel, identifier, outcome)
//       — called AFTER the intake mutation completes. Bumps or resets
//         the consecutive-failure counter, escalates to a hard block
//         if the counter crosses the threshold, and writes a
//         `repeated_failure` abuse event + audit log entry when that
//         happens.
//
//   query     getBucketStatus(throttleKey, channel)
//       — returns the current `RateLimitState` for a throttle key
//         without mutating anything. Used by ops dashboards.
//
//   query     getAbuseEvents(throttleKey?)
//       — returns the most recent abuse events, optionally filtered
//         by throttle key. Broker/admin only.
//
// All writes emit an `abuseEvents` row when a block is applied, lifted,
// or the repeated-failure threshold is crossed. `checkAndRecord` and
// `recordRequestOutcome` are intentionally public (no auth required)
// because the rate limiter has to run BEFORE the intake flow has a
// chance to authenticate the caller.
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/session";
import { rateLimitChannel } from "./lib/validators";
import {
  CHANNEL_CONFIGS,
  FAILURE_BLOCK_THRESHOLD,
  checkRateLimit,
  recordFailure,
  recordSuccess,
  type BucketSnapshot,
  type Channel,
  type RateLimitState,
} from "./lib/rateLimiter";

// ─── Validators shared across queries/mutations ─────────────────────────

const rateLimitStateValidator = v.union(
  v.object({
    allowed: v.literal(true),
    remaining: v.number(),
    resetAt: v.string(),
  }),
  v.object({
    allowed: v.literal(false),
    blockedUntil: v.string(),
    reason: v.union(
      v.literal("window_exceeded"),
      v.literal("block_active")
    ),
  })
);

const outcomeValidator = v.union(v.literal("success"), v.literal("failure"));

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Canonical `<channel>:<identifier>` key. Built here rather than at
 * every call site so the encoding is consistent across all intake
 * surfaces.
 */
function makeThrottleKey(channel: Channel, identifier: string): string {
  return `${channel}:${identifier}`;
}

/**
 * Re-hydrate a `BucketSnapshot` from the persisted row. The Convex
 * document has extra bookkeeping fields (`createdAt`, `updatedAt`,
 * etc.) that the pure functions don't care about, so we strip them
 * down here.
 */
function toSnapshot(doc: {
  requestTimestamps: string[];
  consecutiveFailures: number;
  blockedUntil?: string;
}): BucketSnapshot {
  return {
    requestTimestamps: doc.requestTimestamps,
    consecutiveFailures: doc.consecutiveFailures,
    blockedUntil: doc.blockedUntil,
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────

/**
 * Check the rate limit for a given (channel, identifier) pair and
 * atomically record the request if allowed.
 *
 * Called BEFORE any public intake mutation runs. No auth required —
 * the rate limiter itself runs before the caller has had a chance to
 * authenticate.
 */
export const checkAndRecord = mutation({
  args: {
    channel: rateLimitChannel,
    identifier: v.string(),
  },
  returns: rateLimitStateValidator,
  handler: async (ctx, args) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const throttleKey = makeThrottleKey(args.channel, args.identifier);

    // --- 1. Upsert the bucket -------------------------------------------------
    const existing = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_throttleKey", (q) => q.eq("throttleKey", throttleKey))
      .unique();

    // Track whether the previous bucket HAD a block that has since
    // expired, so we can emit a `block_lifted` event on the recovery
    // transition. The predicate must be "had a blockedUntil AND it's
    // now in the past" — if the block is still active, checkRateLimit
    // returns allowed:false and we never hit the recovery branch.
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

    // --- 2. Run the pure decision logic --------------------------------------
    const { state, nextBucket } = checkRateLimit(
      bucketBefore,
      args.channel,
      now
    );

    // --- 3. Persist the next bucket state ------------------------------------
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

    // --- 4. Emit abuse telemetry on denial or block transitions -------------
    if (!state.allowed) {
      if (state.reason === "window_exceeded") {
        // Hitting the sliding window is a "rate_limit_exceeded" event
        // AND a "block_applied" event, because the window hit stamps
        // a new blockedUntil via the escalating backoff formula.
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
        // Still blocked from a previous hit — record that we're seeing
        // continued probe traffic. Helps ops spot sustained abuse
        // vs. a one-off burst.
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
    } else if (previouslyBlocked) {
      // The bucket was previously blocked and is now eligible again —
      // worth an explicit telemetry event so dashboards can show the
      // recovery, not just the initial block.
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

    return state;
  },
});

/**
 * Record the application-level outcome of a rate-limited request.
 *
 * Called AFTER the underlying intake mutation completes:
 *   - "success" resets the consecutive-failure counter to 0
 *   - "failure" bumps the counter and, if it crosses
 *     `FAILURE_BLOCK_THRESHOLD`, escalates to a hard block.
 *
 * No auth required — the caller is already rate-limited by
 * `checkAndRecord`, and this mutation is idempotent from the caller's
 * perspective (missing a failure signal just means the next attempt
 * starts from base backoff).
 */
export const recordRequestOutcome = mutation({
  args: {
    channel: rateLimitChannel,
    identifier: v.string(),
    outcome: outcomeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const throttleKey = makeThrottleKey(args.channel, args.identifier);

    const existing = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_throttleKey", (q) => q.eq("throttleKey", throttleKey))
      .unique();

    // If the bucket doesn't exist, `checkAndRecord` was never called
    // for this key — nothing to update. No-op instead of throwing so a
    // missing outcome signal can never break the caller.
    if (!existing) return null;

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

    // --- Emit telemetry on threshold crossing ---
    // We only emit the "repeated_failure" event the moment the counter
    // crosses the threshold — subsequent failures while blocked are
    // recorded as `rate_limit_exceeded` by `checkAndRecord` instead.
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

    return null;
  },
});

// ─── Queries ────────────────────────────────────────────────────────────

/**
 * Read-only snapshot of the current rate-limit state for a given
 * throttle key. Does NOT persist anything — this is a pure observation
 * used by ops dashboards and debug tooling.
 *
 * Returns the "allowed" state that a new request would see if it hit
 * the bucket RIGHT NOW, without actually recording the request.
 */
export const getBucketStatus = query({
  args: {
    throttleKey: v.string(),
    channel: rateLimitChannel,
  },
  returns: v.union(
    rateLimitStateValidator,
    v.object({
      allowed: v.literal(true),
      remaining: v.number(),
      resetAt: v.string(),
      neverSeen: v.literal(true),
    })
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_throttleKey", (q) =>
        q.eq("throttleKey", args.throttleKey)
      )
      .unique();

    const config = CHANNEL_CONFIGS[args.channel as Channel];
    const now = new Date();

    if (!existing) {
      // Bucket never seen — a fresh request would have full budget
      // available. Mark with `neverSeen` so callers can distinguish
      // "no history" from "history shows it's free".
      return {
        allowed: true as const,
        remaining: config.maxRequests,
        resetAt: new Date(now.getTime() + config.windowMs).toISOString(),
        neverSeen: true as const,
      };
    }

    // Peek at current state WITHOUT simulating a new request. If we
    // handed the bucket to checkRateLimit, it would append a hypothetical
    // request and report `maxRequests - count - 1` — inconsistent with
    // the `neverSeen` branch above (which reports the full budget). So
    // we inspect the persisted bucket directly and report the actual
    // current remaining capacity.
    const cutoff = now.getTime() - config.windowMs;
    const activeTimestamps = existing.requestTimestamps.filter(
      (ts) => new Date(ts).getTime() > cutoff
    );
    const currentCount = activeTimestamps.length;

    // Block state takes priority over window state.
    if (
      existing.blockedUntil &&
      new Date(existing.blockedUntil).getTime() > now.getTime()
    ) {
      return {
        allowed: false as const,
        blockedUntil: existing.blockedUntil,
        reason: "block_active" as const,
      };
    }

    if (currentCount >= config.maxRequests) {
      // Sliding window is saturated — the next request would be denied
      // but there's no stamped blockedUntil yet (that happens inside
      // checkRateLimit on a real write path).
      return {
        allowed: false as const,
        blockedUntil: new Date(
          now.getTime() + config.baseBlockMs
        ).toISOString(),
        reason: "window_exceeded" as const,
      };
    }

    // Room in the window — report what's left.
    const oldestActive = activeTimestamps[0]
      ? new Date(activeTimestamps[0]).getTime() + config.windowMs
      : now.getTime() + config.windowMs;

    return {
      allowed: true as const,
      remaining: config.maxRequests - currentCount,
      resetAt: new Date(oldestActive).toISOString(),
    };
  },
});

/**
 * Internal abuse event log — broker/admin only. Returns the most
 * recent events, optionally filtered by throttle key.
 */
export const getAbuseEvents = query({
  args: {
    throttleKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("abuseEvents"),
      _creationTime: v.number(),
      throttleKey: v.string(),
      channel: rateLimitChannel,
      eventType: v.union(
        v.literal("rate_limit_exceeded"),
        v.literal("repeated_failure"),
        v.literal("suspicious_spike"),
        v.literal("block_applied"),
        v.literal("block_lifted")
      ),
      details: v.optional(v.string()),
      timestamp: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    // Broker/admin only — this log contains raw abuse patterns and
    // is not appropriate for buyer-facing surfaces.
    await requireRole(ctx, "broker");

    const limit = args.limit ?? 100;

    if (args.throttleKey) {
      const rows = await ctx.db
        .query("abuseEvents")
        .withIndex("by_throttleKey", (q) =>
          q.eq("throttleKey", args.throttleKey!)
        )
        .order("desc")
        .take(limit);
      return rows;
    }

    const rows = await ctx.db
      .query("abuseEvents")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
    return rows;
  },
});

// Re-export the pure-TS types for downstream callers who need to branch
// on `RateLimitState` without importing from the library directly.
export type { Channel, RateLimitState };
