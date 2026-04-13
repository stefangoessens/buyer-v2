// ═══════════════════════════════════════════════════════════════════════════
// Intake Rate Limiting & Abuse Controls (KIN-820) — CONVEX MIRROR
//
// This file is a hand-maintained mirror of
// `src/lib/security/rate-limiter.ts`. Convex's tsconfig cannot import
// modules from `../src`, so the pure computation logic has to live twice:
// once for the Next.js app, once for Convex functions.
//
// RULES:
//   - Any change here MUST be mirrored in src/lib/security/rate-limiter.ts
//   - Any change there MUST be mirrored here
//   - The exported shapes (types + function signatures) are identical
//
// Pure TypeScript implementation of a sliding-window rate limiter with
// escalating exponential backoff on consecutive failures. Used by the
// public intake channels (homepage, sms, extension, share_import,
// manual_entry) to throttle abusive traffic before it reaches the
// canonical property merge pipeline.
//
// Design contract:
//   - All time values are milliseconds. Timestamps are ISO 8601 UTC
//     strings so they can be persisted in Convex without custom codecs.
//   - `checkRateLimit`, `recordFailure`, `recordSuccess` and
//     `escalatingBlockMs` are pure functions — they take a bucket
//     snapshot and return the next snapshot. The Convex mutation layer
//     reads, mutates, and writes the persisted bucket around these
//     calls.
//   - Blocked state wins over window state. If a bucket has an active
//     `blockedUntil` we short-circuit before even looking at the
//     sliding window.
// ═══════════════════════════════════════════════════════════════════════════

export type Channel =
  | "homepage"
  | "sms"
  | "extension"
  | "share_import"
  | "manual_entry";

/** Per-channel rate limit configuration. */
export interface ChannelConfig {
  /** Max requests in the sliding window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** How long to block after the limit is hit, in ms. Grows with consecutive failures. */
  baseBlockMs: number;
  /** Max block duration (caps escalating backoff). */
  maxBlockMs: number;
}

/**
 * Channel configs are tuned per intake surface. Homepage paste-a-link is
 * the most tolerant because legitimate buyers often retry after a typo;
 * SMS is the strictest because it's the cheapest surface to abuse and
 * costs real money per inbound message.
 */
export const CHANNEL_CONFIGS: Record<Channel, ChannelConfig> = {
  homepage: {
    maxRequests: 20,
    windowMs: 60_000,
    baseBlockMs: 60_000,
    maxBlockMs: 3_600_000,
  },
  sms: {
    maxRequests: 5,
    windowMs: 60_000,
    baseBlockMs: 300_000,
    maxBlockMs: 3_600_000,
  },
  extension: {
    maxRequests: 30,
    windowMs: 60_000,
    baseBlockMs: 60_000,
    maxBlockMs: 1_800_000,
  },
  share_import: {
    maxRequests: 10,
    windowMs: 60_000,
    baseBlockMs: 120_000,
    maxBlockMs: 3_600_000,
  },
  manual_entry: {
    maxRequests: 15,
    windowMs: 60_000,
    baseBlockMs: 180_000,
    maxBlockMs: 3_600_000,
  },
};

/**
 * Threshold of consecutive failures at which `recordFailure` escalates
 * to a hard block. Kept intentionally low because any surface getting
 * 5 consecutive application-layer failures is almost certainly being
 * probed or spammed — we'd rather over-block noisy traffic than leak
 * a retry budget.
 */
export const FAILURE_BLOCK_THRESHOLD = 5;

/**
 * Deterministic result of a rate-limit check. `allowed: true` callers
 * can proceed with the underlying intake mutation; `allowed: false`
 * callers must surface `blockedUntil` + `reason` to the client so the
 * UI can render a retry countdown instead of a generic error.
 */
export type RateLimitState =
  | { allowed: true; remaining: number; resetAt: string }
  | {
      allowed: false;
      blockedUntil: string;
      reason: "window_exceeded" | "block_active";
    };

/**
 * Buyer-facing explicit denial state. We separate "retry_later" from a
 * stronger "blocked" state so intake callers can render a deterministic
 * countdown or a harder stop without parsing internal reason codes.
 */
export interface ExplicitRateLimitState {
  status: "retry_later" | "blocked";
  retryAt: string;
}

/**
 * Minimal persisted shape of a rate-limit bucket. The Convex table wraps
 * this with `throttleKey`, `channel`, timestamps, and indexes, but the
 * pure functions below only need the fields below.
 */
export interface BucketSnapshot {
  requestTimestamps: string[];
  consecutiveFailures: number;
  blockedUntil?: string;
}

/**
 * Map an internal `RateLimitState` denial into the explicit caller-facing
 * contract required by intake surfaces.
 */
export function toExplicitRateLimitState(
  state: Extract<RateLimitState, { allowed: false }>,
): ExplicitRateLimitState {
  return {
    status: state.reason === "block_active" ? "blocked" : "retry_later",
    retryAt: state.blockedUntil,
  };
}

/**
 * Near-saturation threshold for "suspicious spike" telemetry. We flag the
 * first time a bucket crosses 80% of its request budget in the current
 * window, with a floor of 3 requests so tiny test/dev budgets still have a
 * meaningful threshold.
 */
export function suspiciousSpikeThreshold(channel: Channel): number {
  const config = CHANNEL_CONFIGS[channel];
  if (!config) {
    throw new Error(`Unknown rate limit channel: ${channel}`);
  }

  return Math.max(3, Math.ceil(config.maxRequests * 0.8));
}

/**
 * Whether a request count transition should emit a `suspicious_spike`
 * telemetry event. We only fire on the crossing edge, not on every request
 * after the threshold has already been breached.
 */
export function shouldFlagSuspiciousSpike(
  channel: Channel,
  previousCount: number,
  nextCount: number,
): boolean {
  const threshold = suspiciousSpikeThreshold(channel);
  return previousCount < threshold && nextCount >= threshold;
}

/**
 * Calculate escalating block duration: baseBlockMs * 2^consecutiveFailures,
 * capped at maxBlockMs. `consecutiveFailures = 0` yields the base block,
 * `1` doubles it, `2` quadruples it, and so on until the cap kicks in.
 *
 * Exposed separately from `checkRateLimit` so callers (including tests
 * and the Convex layer) can pre-compute the next block length without
 * actually tripping a new state transition.
 */
export function escalatingBlockMs(
  channel: Channel,
  consecutiveFailures: number,
): number {
  const config = CHANNEL_CONFIGS[channel];
  if (!config) {
    throw new Error(`Unknown rate limit channel: ${channel}`);
  }

  // Clamp to 0 — negative failures would invert the backoff math.
  const failures = Math.max(0, Math.floor(consecutiveFailures));

  // 2^53 is the safe integer ceiling; beyond ~50 we'd overflow long
  // before hitting the cap anyway, so clamp the exponent to keep the
  // math finite even for pathologically huge failure counts.
  const safeExponent = Math.min(failures, 50);
  const scaled = config.baseBlockMs * Math.pow(2, safeExponent);

  return Math.min(scaled, config.maxBlockMs);
}

/**
 * Check whether a new request should be allowed for a given bucket.
 *
 * Pure function: takes the current bucket snapshot + a clock, returns
 * the decision and the next bucket state to persist. Callers are
 * responsible for persisting `nextBucket` when `allowed: true` and for
 * emitting abuse-event telemetry when `allowed: false`.
 *
 * Logic:
 *   1. If a previous block is still active, deny with "block_active".
 *   2. Prune timestamps older than `now - windowMs`.
 *   3. If we've hit `maxRequests` in the current window, deny with
 *      "window_exceeded" and stamp a new `blockedUntil` via the
 *      escalating-backoff formula.
 *   4. Otherwise append the current timestamp, return `allowed: true`
 *      with `remaining` and `resetAt` for client-side UX.
 */
export function checkRateLimit(
  bucket: BucketSnapshot,
  channel: Channel,
  now: Date,
): { state: RateLimitState; nextBucket: BucketSnapshot } {
  const config = CHANNEL_CONFIGS[channel];
  if (!config) {
    throw new Error(`Unknown rate limit channel: ${channel}`);
  }

  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  // --- Step 1: honour an existing hard block before anything else ---
  if (bucket.blockedUntil) {
    const blockedUntilMs = new Date(bucket.blockedUntil).getTime();
    if (!Number.isNaN(blockedUntilMs) && blockedUntilMs > nowMs) {
      return {
        state: {
          allowed: false,
          blockedUntil: bucket.blockedUntil,
          reason: "block_active",
        },
        // Bucket is unchanged — we don't want to re-stamp blockedUntil
        // or touch the timestamp log while a block is active.
        nextBucket: { ...bucket },
      };
    }
  }

  // --- Step 2: prune timestamps outside the current window ---
  const windowStartMs = nowMs - config.windowMs;
  const pruned = bucket.requestTimestamps.filter((iso) => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t > windowStartMs;
  });

  // --- Step 3: if window full, stamp a new block ---
  if (pruned.length >= config.maxRequests) {
    const blockMs = escalatingBlockMs(channel, bucket.consecutiveFailures);
    const blockedUntil = new Date(nowMs + blockMs).toISOString();

    return {
      state: {
        allowed: false,
        blockedUntil,
        reason: "window_exceeded",
      },
      nextBucket: {
        requestTimestamps: pruned,
        // Hitting the window is itself a failure signal — bump the
        // counter so the next block escalates.
        consecutiveFailures: bucket.consecutiveFailures + 1,
        blockedUntil,
      },
    };
  }

  // --- Step 4: allow and record the new timestamp ---
  const nextTimestamps = [...pruned, nowIso];
  const remaining = config.maxRequests - nextTimestamps.length;

  // `resetAt` is when the oldest in-window request will age out, i.e.
  // the earliest moment a fully saturated window becomes eligible
  // again. Callers can render this as the "try again in X" hint.
  const oldestMs = new Date(nextTimestamps[0]!).getTime();
  const resetAtMs = Number.isNaN(oldestMs)
    ? nowMs + config.windowMs
    : oldestMs + config.windowMs;
  const resetAt = new Date(resetAtMs).toISOString();

  return {
    state: {
      allowed: true,
      remaining,
      resetAt,
    },
    nextBucket: {
      requestTimestamps: nextTimestamps,
      consecutiveFailures: bucket.consecutiveFailures,
      blockedUntil: bucket.blockedUntil && new Date(bucket.blockedUntil).getTime() > nowMs
        ? bucket.blockedUntil
        : undefined,
    },
  };
}

/**
 * Record a failure after a request was allowed through. Increments the
 * consecutive-failure counter and, if the counter crosses
 * `FAILURE_BLOCK_THRESHOLD`, escalates to a hard block via the backoff
 * formula.
 *
 * "Failure" here means an application-level error downstream of the
 * rate limiter — malformed URL, unsupported portal, parser exception.
 * Network transport errors don't count because they don't reach this
 * layer.
 */
export function recordFailure(
  bucket: BucketSnapshot,
  channel: Channel,
  now: Date,
): BucketSnapshot {
  const config = CHANNEL_CONFIGS[channel];
  if (!config) {
    throw new Error(`Unknown rate limit channel: ${channel}`);
  }

  const nextFailures = bucket.consecutiveFailures + 1;
  const next: BucketSnapshot = {
    requestTimestamps: [...bucket.requestTimestamps],
    consecutiveFailures: nextFailures,
    blockedUntil: bucket.blockedUntil,
  };

  if (nextFailures >= FAILURE_BLOCK_THRESHOLD) {
    // Use the NEW failure count for the backoff — so the first time we
    // cross the threshold (5 failures) we escalate immediately instead
    // of waiting one more hit.
    const blockMs = escalatingBlockMs(channel, nextFailures);
    next.blockedUntil = new Date(now.getTime() + blockMs).toISOString();
  }

  return next;
}

/**
 * Record a success after a request was allowed through. Resets the
 * consecutive-failure counter so the next failure starts from the
 * base block length instead of continuing the escalation ladder.
 *
 * Does NOT touch `requestTimestamps` (those are managed by
 * `checkRateLimit`) or `blockedUntil` — a currently active block
 * must run its full course before the bucket allows new requests.
 */
export function recordSuccess(
  bucket: BucketSnapshot,
  _now: Date,
): BucketSnapshot {
  return {
    requestTimestamps: [...bucket.requestTimestamps],
    consecutiveFailures: 0,
    blockedUntil: bucket.blockedUntil,
  };
}
