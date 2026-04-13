import { describe, it, expect } from "vitest";
import {
  CHANNEL_CONFIGS,
  FAILURE_BLOCK_THRESHOLD,
  checkRateLimit,
  escalatingBlockMs,
  recordFailure,
  recordSuccess,
  shouldFlagSuspiciousSpike,
  suspiciousSpikeThreshold,
  toExplicitRateLimitState,
  type BucketSnapshot,
  type Channel,
} from "@/lib/security/rate-limiter";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — keep test setup terse and readable
// ═══════════════════════════════════════════════════════════════════════════

/** Shorthand for an empty bucket. */
const emptyBucket = (): BucketSnapshot => ({
  requestTimestamps: [],
  consecutiveFailures: 0,
});

/** Deterministic "now" fixture so every test reads the same clock. */
const BASE_NOW = new Date("2026-06-01T12:00:00.000Z");

/** Convenience for building a timestamp offset from BASE_NOW. */
const offsetFromBase = (ms: number): string =>
  new Date(BASE_NOW.getTime() + ms).toISOString();

// ═══════════════════════════════════════════════════════════════════════════
// CHANNEL_CONFIGS — config presence + shape guarantees
// ═══════════════════════════════════════════════════════════════════════════

describe("CHANNEL_CONFIGS", () => {
  const expectedChannels: Channel[] = [
    "homepage",
    "sms",
    "extension",
    "share_import",
    "manual_entry",
  ];

  it("exposes a config for every channel", () => {
    for (const channel of expectedChannels) {
      expect(CHANNEL_CONFIGS[channel]).toBeDefined();
    }
  });

  it("every channel config has positive limits", () => {
    for (const channel of expectedChannels) {
      const config = CHANNEL_CONFIGS[channel];
      expect(config.maxRequests).toBeGreaterThan(0);
      expect(config.windowMs).toBeGreaterThan(0);
      expect(config.baseBlockMs).toBeGreaterThan(0);
      expect(config.maxBlockMs).toBeGreaterThanOrEqual(config.baseBlockMs);
    }
  });

  it("sms is the strictest channel (lowest maxRequests)", () => {
    // SMS is the most expensive surface to abuse — we want it locked
    // down harder than anything else.
    expect(CHANNEL_CONFIGS.sms.maxRequests).toBeLessThan(
      CHANNEL_CONFIGS.homepage.maxRequests
    );
    expect(CHANNEL_CONFIGS.sms.maxRequests).toBeLessThan(
      CHANNEL_CONFIGS.extension.maxRequests
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkRateLimit — normal path (first request, within window, pruning)
// ═══════════════════════════════════════════════════════════════════════════

describe("checkRateLimit — normal path", () => {
  it("allows the first request on a fresh bucket", () => {
    const bucket = emptyBucket();
    const { state, nextBucket } = checkRateLimit(bucket, "homepage", BASE_NOW);

    expect(state.allowed).toBe(true);
    if (state.allowed) {
      expect(state.remaining).toBe(CHANNEL_CONFIGS.homepage.maxRequests - 1);
      expect(typeof state.resetAt).toBe("string");
    }
    expect(nextBucket.requestTimestamps).toHaveLength(1);
    expect(nextBucket.requestTimestamps[0]).toBe(BASE_NOW.toISOString());
  });

  it("decrements `remaining` on each allowed request", () => {
    let bucket = emptyBucket();
    const remainingByRequest: number[] = [];

    for (let i = 0; i < 3; i++) {
      const now = new Date(BASE_NOW.getTime() + i * 100);
      const { state, nextBucket } = checkRateLimit(bucket, "homepage", now);
      if (state.allowed) remainingByRequest.push(state.remaining);
      bucket = nextBucket;
    }

    const max = CHANNEL_CONFIGS.homepage.maxRequests;
    expect(remainingByRequest).toEqual([max - 1, max - 2, max - 3]);
  });

  it("returns a resetAt timestamp in the future", () => {
    const bucket = emptyBucket();
    const { state } = checkRateLimit(bucket, "homepage", BASE_NOW);

    expect(state.allowed).toBe(true);
    if (state.allowed) {
      const resetMs = new Date(state.resetAt).getTime();
      expect(resetMs).toBeGreaterThan(BASE_NOW.getTime());
      // Reset should align with oldest-request + windowMs.
      expect(resetMs).toBe(
        BASE_NOW.getTime() + CHANNEL_CONFIGS.homepage.windowMs
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkRateLimit — window exceeded (saturating a channel)
// ═══════════════════════════════════════════════════════════════════════════

describe("checkRateLimit — window exceeded", () => {
  it("blocks the N+1th request when the window is full", () => {
    const channel: Channel = "sms"; // small limit (5) to keep the loop tight
    const max = CHANNEL_CONFIGS[channel].maxRequests;

    let bucket = emptyBucket();
    // Fill the window exactly.
    for (let i = 0; i < max; i++) {
      const now = new Date(BASE_NOW.getTime() + i * 10);
      const { state, nextBucket } = checkRateLimit(bucket, channel, now);
      expect(state.allowed).toBe(true);
      bucket = nextBucket;
    }

    // Next request is blocked.
    const now = new Date(BASE_NOW.getTime() + max * 10);
    const { state, nextBucket } = checkRateLimit(bucket, channel, now);
    expect(state.allowed).toBe(false);
    if (!state.allowed) {
      expect(state.reason).toBe("window_exceeded");
      expect(typeof state.blockedUntil).toBe("string");
    }
    // The nextBucket should now carry a blockedUntil.
    expect(nextBucket.blockedUntil).toBeDefined();
    expect(nextBucket.consecutiveFailures).toBe(1);
  });

  it("stamps blockedUntil via the base backoff for a first-time window hit", () => {
    const channel: Channel = "homepage";
    const max = CHANNEL_CONFIGS[channel].maxRequests;
    const base = CHANNEL_CONFIGS[channel].baseBlockMs;

    let bucket = emptyBucket();
    for (let i = 0; i < max; i++) {
      const now = new Date(BASE_NOW.getTime() + i * 10);
      bucket = checkRateLimit(bucket, channel, now).nextBucket;
    }

    const now = new Date(BASE_NOW.getTime() + max * 10);
    const { state } = checkRateLimit(bucket, channel, now);

    expect(state.allowed).toBe(false);
    if (!state.allowed) {
      // First-time block → base duration (2^0 = 1).
      const expected = new Date(now.getTime() + base).toISOString();
      expect(state.blockedUntil).toBe(expected);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkRateLimit — window pruning (old requests age out)
// ═══════════════════════════════════════════════════════════════════════════

describe("checkRateLimit — window pruning", () => {
  it("prunes timestamps older than the sliding window", () => {
    const channel: Channel = "homepage";
    const windowMs = CHANNEL_CONFIGS[channel].windowMs;

    // Bucket has 3 timestamps, 2 of which are outside the window.
    const bucket: BucketSnapshot = {
      requestTimestamps: [
        offsetFromBase(-windowMs * 3), // way out
        offsetFromBase(-windowMs * 2), // still out
        offsetFromBase(-windowMs / 2), // still inside
      ],
      consecutiveFailures: 0,
    };

    const { state, nextBucket } = checkRateLimit(bucket, channel, BASE_NOW);

    expect(state.allowed).toBe(true);
    // Only the inside + new timestamp remain.
    expect(nextBucket.requestTimestamps).toHaveLength(2);
  });

  it("resets the effective count after the entire window ages out", () => {
    const channel: Channel = "sms";
    const max = CHANNEL_CONFIGS[channel].maxRequests;
    const windowMs = CHANNEL_CONFIGS[channel].windowMs;

    // Fill the window.
    let bucket = emptyBucket();
    for (let i = 0; i < max; i++) {
      const now = new Date(BASE_NOW.getTime() + i);
      bucket = checkRateLimit(bucket, channel, now).nextBucket;
    }

    // Jump past the window — every timestamp should prune out.
    const farFuture = new Date(BASE_NOW.getTime() + windowMs + 1_000);
    const { state, nextBucket } = checkRateLimit(bucket, channel, farFuture);

    expect(state.allowed).toBe(true);
    if (state.allowed) {
      // After pruning, the "current" count is 1 (just this new request),
      // so remaining is max - 1 again.
      expect(state.remaining).toBe(max - 1);
    }
    expect(nextBucket.requestTimestamps).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkRateLimit — block active (hard block short-circuits window logic)
// ═══════════════════════════════════════════════════════════════════════════

describe("checkRateLimit — block active", () => {
  it("denies requests while blockedUntil is in the future", () => {
    const blockedUntil = new Date(BASE_NOW.getTime() + 60_000).toISOString();
    const bucket: BucketSnapshot = {
      requestTimestamps: [],
      consecutiveFailures: 3,
      blockedUntil,
    };

    const { state, nextBucket } = checkRateLimit(bucket, "homepage", BASE_NOW);

    expect(state.allowed).toBe(false);
    if (!state.allowed) {
      expect(state.reason).toBe("block_active");
      expect(state.blockedUntil).toBe(blockedUntil);
    }
    // Bucket is unchanged during an active block — we don't want to
    // accumulate more state on a blocked key.
    expect(nextBucket.consecutiveFailures).toBe(3);
    expect(nextBucket.blockedUntil).toBe(blockedUntil);
  });

  it("block_active denial takes precedence even if window would allow", () => {
    // No timestamps at all, but a block is active — still denied.
    const bucket: BucketSnapshot = {
      requestTimestamps: [],
      consecutiveFailures: 0,
      blockedUntil: new Date(BASE_NOW.getTime() + 10_000).toISOString(),
    };

    const { state } = checkRateLimit(bucket, "homepage", BASE_NOW);
    expect(state.allowed).toBe(false);
    if (!state.allowed) {
      expect(state.reason).toBe("block_active");
    }
  });

  it("allows requests again once blockedUntil is in the past", () => {
    const bucket: BucketSnapshot = {
      requestTimestamps: [],
      consecutiveFailures: 2,
      blockedUntil: new Date(BASE_NOW.getTime() - 1_000).toISOString(),
    };

    const { state, nextBucket } = checkRateLimit(bucket, "homepage", BASE_NOW);
    expect(state.allowed).toBe(true);
    // The stale blockedUntil gets cleared on the next allowed request.
    expect(nextBucket.blockedUntil).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caller-facing denial mapping + suspicious spike thresholds
// ═══════════════════════════════════════════════════════════════════════════

describe("toExplicitRateLimitState", () => {
  it("maps window_exceeded into retry_later", () => {
    expect(
      toExplicitRateLimitState({
        allowed: false,
        blockedUntil: offsetFromBase(60_000),
        reason: "window_exceeded",
      }),
    ).toEqual({
      status: "retry_later",
      retryAt: offsetFromBase(60_000),
    });
  });

  it("maps block_active into blocked", () => {
    expect(
      toExplicitRateLimitState({
        allowed: false,
        blockedUntil: offsetFromBase(120_000),
        reason: "block_active",
      }),
    ).toEqual({
      status: "blocked",
      retryAt: offsetFromBase(120_000),
    });
  });
});

describe("suspicious spike telemetry helpers", () => {
  it("uses an 80% threshold with a floor of 3 requests", () => {
    expect(suspiciousSpikeThreshold("homepage")).toBe(
      Math.max(3, Math.ceil(CHANNEL_CONFIGS.homepage.maxRequests * 0.8)),
    );
    expect(suspiciousSpikeThreshold("sms")).toBe(
      Math.max(3, Math.ceil(CHANNEL_CONFIGS.sms.maxRequests * 0.8)),
    );
  });

  it("flags the first crossing into the suspicious zone", () => {
    const threshold = suspiciousSpikeThreshold("homepage");
    expect(
      shouldFlagSuspiciousSpike("homepage", threshold - 1, threshold),
    ).toBe(true);
  });

  it("does not refire once the bucket is already above threshold", () => {
    const threshold = suspiciousSpikeThreshold("extension");
    expect(
      shouldFlagSuspiciousSpike("extension", threshold, threshold + 1),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// escalatingBlockMs — exponential backoff + max cap
// ═══════════════════════════════════════════════════════════════════════════

describe("escalatingBlockMs", () => {
  it("returns baseBlockMs for 0 failures", () => {
    expect(escalatingBlockMs("homepage", 0)).toBe(
      CHANNEL_CONFIGS.homepage.baseBlockMs
    );
  });

  it("doubles the block for each additional failure", () => {
    const base = CHANNEL_CONFIGS.homepage.baseBlockMs;
    expect(escalatingBlockMs("homepage", 1)).toBe(base * 2);
    expect(escalatingBlockMs("homepage", 2)).toBe(base * 4);
    expect(escalatingBlockMs("homepage", 3)).toBe(base * 8);
  });

  it("caps at maxBlockMs for very large failure counts", () => {
    // 100 consecutive failures would overflow past maxBlockMs; the cap
    // must always win.
    expect(escalatingBlockMs("homepage", 100)).toBe(
      CHANNEL_CONFIGS.homepage.maxBlockMs
    );
    expect(escalatingBlockMs("sms", 100)).toBe(CHANNEL_CONFIGS.sms.maxBlockMs);
    expect(escalatingBlockMs("extension", 100)).toBe(
      CHANNEL_CONFIGS.extension.maxBlockMs
    );
  });

  it("never returns more than maxBlockMs for any failure count", () => {
    for (const channel of Object.keys(CHANNEL_CONFIGS) as Channel[]) {
      for (let f = 0; f < 64; f++) {
        expect(escalatingBlockMs(channel, f)).toBeLessThanOrEqual(
          CHANNEL_CONFIGS[channel].maxBlockMs
        );
      }
    }
  });

  it("clamps negative failure counts to zero", () => {
    const base = CHANNEL_CONFIGS.homepage.baseBlockMs;
    expect(escalatingBlockMs("homepage", -5)).toBe(base);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// recordFailure — counter bump + threshold escalation
// ═══════════════════════════════════════════════════════════════════════════

describe("recordFailure", () => {
  it("increments consecutiveFailures by 1", () => {
    const bucket: BucketSnapshot = {
      requestTimestamps: [],
      consecutiveFailures: 2,
    };
    const next = recordFailure(bucket, "homepage", BASE_NOW);
    expect(next.consecutiveFailures).toBe(3);
    // Still no block — threshold not reached.
    expect(next.blockedUntil).toBeUndefined();
  });

  it("applies a block the moment failures cross the threshold", () => {
    const bucket: BucketSnapshot = {
      requestTimestamps: [],
      consecutiveFailures: FAILURE_BLOCK_THRESHOLD - 1,
    };
    const next = recordFailure(bucket, "homepage", BASE_NOW);

    expect(next.consecutiveFailures).toBe(FAILURE_BLOCK_THRESHOLD);
    expect(next.blockedUntil).toBeDefined();

    const expectedBlockMs = escalatingBlockMs(
      "homepage",
      FAILURE_BLOCK_THRESHOLD
    );
    expect(next.blockedUntil).toBe(
      new Date(BASE_NOW.getTime() + expectedBlockMs).toISOString()
    );
  });

  it("keeps escalating the block for additional failures past threshold", () => {
    const bucket: BucketSnapshot = {
      requestTimestamps: [],
      consecutiveFailures: FAILURE_BLOCK_THRESHOLD + 2,
    };
    const next = recordFailure(bucket, "sms", BASE_NOW);
    expect(next.consecutiveFailures).toBe(FAILURE_BLOCK_THRESHOLD + 3);
    expect(next.blockedUntil).toBeDefined();

    // After many failures, the block should equal escalatingBlockMs
    // for the NEW counter value.
    const expectedBlockMs = escalatingBlockMs(
      "sms",
      FAILURE_BLOCK_THRESHOLD + 3
    );
    expect(next.blockedUntil).toBe(
      new Date(BASE_NOW.getTime() + expectedBlockMs).toISOString()
    );
  });

  it("preserves existing requestTimestamps unchanged", () => {
    const bucket: BucketSnapshot = {
      requestTimestamps: ["2026-06-01T11:59:00.000Z"],
      consecutiveFailures: 0,
    };
    const next = recordFailure(bucket, "homepage", BASE_NOW);
    expect(next.requestTimestamps).toEqual(bucket.requestTimestamps);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// recordSuccess — counter reset
// ═══════════════════════════════════════════════════════════════════════════

describe("recordSuccess", () => {
  it("resets consecutiveFailures to 0", () => {
    const bucket: BucketSnapshot = {
      requestTimestamps: [],
      consecutiveFailures: 4,
    };
    const next = recordSuccess(bucket, BASE_NOW);
    expect(next.consecutiveFailures).toBe(0);
  });

  it("leaves requestTimestamps and blockedUntil untouched", () => {
    const blockedUntil = new Date(BASE_NOW.getTime() + 60_000).toISOString();
    const bucket: BucketSnapshot = {
      requestTimestamps: ["2026-06-01T11:00:00.000Z"],
      consecutiveFailures: 3,
      blockedUntil,
    };
    const next = recordSuccess(bucket, BASE_NOW);
    // Success should NOT lift an active block — it has to run its full
    // course. It only resets the failure counter for future decisions.
    expect(next.blockedUntil).toBe(blockedUntil);
    expect(next.requestTimestamps).toEqual(bucket.requestTimestamps);
  });

  it("is idempotent when called on an already-zero bucket", () => {
    const bucket = emptyBucket();
    const next = recordSuccess(bucket, BASE_NOW);
    expect(next.consecutiveFailures).toBe(0);
    expect(next.requestTimestamps).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration — full lifecycle simulations
// ═══════════════════════════════════════════════════════════════════════════

describe("rate limiter — full lifecycle scenarios", () => {
  it("fail, fail, success resets the counter mid-stream", () => {
    let bucket = emptyBucket();
    bucket = recordFailure(bucket, "homepage", BASE_NOW);
    bucket = recordFailure(bucket, "homepage", BASE_NOW);
    expect(bucket.consecutiveFailures).toBe(2);

    bucket = recordSuccess(bucket, BASE_NOW);
    expect(bucket.consecutiveFailures).toBe(0);
  });

  it("window hit + failure threshold stacks into escalating block", () => {
    const channel: Channel = "sms";
    const max = CHANNEL_CONFIGS[channel].maxRequests;

    let bucket = emptyBucket();
    // Saturate the window.
    for (let i = 0; i < max; i++) {
      bucket = checkRateLimit(
        bucket,
        channel,
        new Date(BASE_NOW.getTime() + i * 10)
      ).nextBucket;
    }

    // Next request — window hit, counter bumped to 1.
    bucket = checkRateLimit(
      bucket,
      channel,
      new Date(BASE_NOW.getTime() + max * 10)
    ).nextBucket;
    expect(bucket.consecutiveFailures).toBe(1);

    // If we then record a bunch of application-level failures, the
    // next block should be longer than the first one.
    const firstBlockedUntil = bucket.blockedUntil;
    for (let i = 0; i < FAILURE_BLOCK_THRESHOLD; i++) {
      bucket = recordFailure(bucket, channel, BASE_NOW);
    }

    // After the threshold is crossed, a new block is stamped that's
    // longer than the original one.
    expect(bucket.blockedUntil).toBeDefined();
    if (bucket.blockedUntil && firstBlockedUntil) {
      const first = new Date(firstBlockedUntil).getTime();
      const second = new Date(bucket.blockedUntil).getTime();
      expect(second).toBeGreaterThanOrEqual(first);
    }
  });

  it("fresh bucket accepts up to maxRequests in a burst", () => {
    const channel: Channel = "extension";
    const max = CHANNEL_CONFIGS[channel].maxRequests;

    let bucket = emptyBucket();
    let allowedCount = 0;
    for (let i = 0; i < max; i++) {
      const { state, nextBucket } = checkRateLimit(
        bucket,
        channel,
        new Date(BASE_NOW.getTime() + i)
      );
      if (state.allowed) allowedCount++;
      bucket = nextBucket;
    }
    expect(allowedCount).toBe(max);
  });

  it("fresh buckets for different channels don't interfere", () => {
    // Sanity: the same "identifier" hitting different channel buckets
    // is handled independently by callers; the pure function itself
    // is stateless per bucket.
    const smsBucket = emptyBucket();
    const homeBucket = emptyBucket();

    const a = checkRateLimit(smsBucket, "sms", BASE_NOW);
    const b = checkRateLimit(homeBucket, "homepage", BASE_NOW);

    expect(a.state.allowed).toBe(true);
    expect(b.state.allowed).toBe(true);
  });
});
