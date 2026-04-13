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
  type Channel,
  type RateLimitState,
} from "./lib/rateLimiter";
import {
  checkAndPersistRateLimit,
  makeThrottleKey,
  recordRateLimitOutcome,
} from "./lib/rateLimitBuckets";

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
 * Re-hydrate a `BucketSnapshot` from the persisted row. The Convex
 * document has extra bookkeeping fields (`createdAt`, `updatedAt`,
 * etc.) that the pure functions don't care about, so we strip them
 * down here.
 */
function toSnapshot(doc: {
  requestTimestamps: string[];
  consecutiveFailures: number;
  blockedUntil?: string;
}): {
  requestTimestamps: string[];
  consecutiveFailures: number;
  blockedUntil?: string;
} {
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
    const result = await checkAndPersistRateLimit(ctx, {
      channel: args.channel,
      identifier: args.identifier,
    });
    return result.state;
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
    await recordRateLimitOutcome(ctx, {
      channel: args.channel,
      identifier: args.identifier,
      outcome: args.outcome,
    });
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
