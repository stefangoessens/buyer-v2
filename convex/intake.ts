import {
  mutation,
  internalMutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getSessionContext } from "./lib/session";
import {
  checkAndPersistRateLimit,
  recordRateLimitOutcome,
} from "./lib/rateLimitBuckets";

const PORTAL_PATTERNS = [
  {
    platform: "zillow" as const,
    domains: ["zillow.com", "www.zillow.com"],
    pattern: /(\d+)_zpid/,
  },
  {
    platform: "redfin" as const,
    domains: ["redfin.com", "www.redfin.com"],
    pattern: /\/home\/(\d+)/,
  },
  {
    platform: "realtor" as const,
    domains: ["realtor.com", "www.realtor.com"],
    pattern: /\/realestateandhomes-detail\/([^/]+)/,
  },
] as const;

const publicIntakeSource = v.union(
  v.literal("homepage"),
  v.literal("extension"),
  v.literal("share_import"),
);

const acceptedResultValidator = v.object({
  kind: v.literal("accepted"),
  disposition: v.union(v.literal("existing"), v.literal("created")),
  sourceListingId: v.id("sourceListings"),
  platform: v.union(
    v.literal("zillow"),
    v.literal("redfin"),
    v.literal("realtor"),
  ),
});

const deniedResultValidator = v.object({
  kind: v.union(v.literal("retry_later"), v.literal("blocked")),
  code: v.literal("rate_limited"),
  error: v.string(),
  retryAt: v.string(),
});

const errorResultValidator = v.object({
  kind: v.literal("error"),
  code: v.string(),
  error: v.string(),
});

type PublicIntakeSource = "homepage" | "extension" | "share_import";

function rateLimitMessage(kind: "retry_later" | "blocked"): string {
  return kind === "blocked"
    ? "This intake channel is temporarily blocked for this session."
    : "Too many intake attempts. Please try again shortly.";
}

async function resolveThrottleIdentifier(
  ctx: MutationCtx,
  args: {
    source: PublicIntakeSource;
    throttleId?: string;
  },
): Promise<{ ok: true; identifier: string } | { ok: false; error: string; code: string }> {
  if (args.source === "share_import") {
    const session = await getSessionContext(ctx);
    if (session.kind !== "authenticated") {
      return {
        ok: false,
        error: "Authentication required for share import.",
        code: "not_authenticated",
      };
    }

    return {
      ok: true,
      identifier: session.user._id,
    };
  }

  const identifier = args.throttleId?.trim();
  if (!identifier) {
    return {
      ok: false,
      error: "Missing throttle identifier for intake channel.",
      code: "missing_throttle_id",
    };
  }

  return { ok: true, identifier };
}

/**
 * Submit a listing URL for intake processing.
 * Public mutation — called from the homepage hero, extension forward
 * flow, and authenticated share-import surfaces.
 */
export const submitUrl = mutation({
  args: {
    url: v.string(),
    source: v.optional(publicIntakeSource),
    throttleId: v.optional(v.string()),
  },
  returns: v.union(
    acceptedResultValidator,
    deniedResultValidator,
    errorResultValidator,
  ),
  handler: async (ctx, args) => {
    const source = (args.source ?? "homepage") as PublicIntakeSource;
    const throttle = await resolveThrottleIdentifier(ctx, {
      source,
      throttleId: args.throttleId,
    });

    if (!throttle.ok) {
      return {
        kind: "error" as const,
        error: throttle.error,
        code: throttle.code,
      };
    }

    const rateLimit = await checkAndPersistRateLimit(ctx, {
      channel: source,
      identifier: throttle.identifier,
    });

    if (!rateLimit.state.allowed) {
      const callerState = rateLimit.callerState!;
      return {
        kind: callerState.status,
        code: "rate_limited" as const,
        error: rateLimitMessage(callerState.status),
        retryAt: callerState.retryAt,
      };
    }

    const trimmed = args.url.trim();

    let url: URL;
    try {
      const withProtocol = trimmed.startsWith("http")
        ? trimmed
        : `https://${trimmed}`;
      url = new URL(withProtocol);
    } catch {
      await recordRateLimitOutcome(ctx, {
        channel: source,
        identifier: throttle.identifier,
        outcome: "failure",
      });

      return {
        kind: "error" as const,
        error: "Invalid URL",
        code: "malformed_url",
      };
    }

    const hostname = url.hostname.toLowerCase();

    for (const portal of PORTAL_PATTERNS) {
      if (!portal.domains.some((domain) => hostname === domain)) {
        continue;
      }

      const match = url.pathname.match(portal.pattern);
      if (!match) {
        await recordRateLimitOutcome(ctx, {
          channel: source,
          identifier: throttle.identifier,
          outcome: "failure",
        });

        return {
          kind: "error" as const,
          error: `No listing ID found in ${portal.platform} URL`,
          code: "missing_listing_id",
        };
      }

      const existing = await ctx.db
        .query("sourceListings")
        .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", trimmed))
        .first();

      if (existing) {
        // If a previous run failed, kick off a retry rather than
        // stranding the buyer on the failed state.
        if (existing.status === "failed") {
          await ctx.db.patch(existing._id, {
            status: "pending",
            errorCode: undefined,
            errorMessage: undefined,
          });
          await ctx.scheduler.runAfter(
            0,
            internal.extractionRunner.runExtractionJob,
            { sourceListingId: existing._id, url: trimmed },
          );
        }

        await recordRateLimitOutcome(ctx, {
          channel: source,
          identifier: throttle.identifier,
          outcome: "success",
        });

        return {
          kind: "accepted" as const,
          disposition: "existing" as const,
          sourceListingId: existing._id,
          platform: portal.platform,
        };
      }

      const id = await ctx.db.insert("sourceListings", {
        sourcePlatform: portal.platform,
        sourceUrl: trimmed,
        rawData: JSON.stringify({ source }),
        extractedAt: new Date().toISOString(),
        status: "pending",
      });

      // Fire-and-forget: the action will update the row through
      // internal mutations as it progresses.
      await ctx.scheduler.runAfter(
        0,
        internal.extractionRunner.runExtractionJob,
        { sourceListingId: id, url: trimmed },
      );

      await recordRateLimitOutcome(ctx, {
        channel: source,
        identifier: throttle.identifier,
        outcome: "success",
      });

      return {
        kind: "accepted" as const,
        disposition: "created" as const,
        sourceListingId: id,
        platform: portal.platform,
      };
    }

    await recordRateLimitOutcome(ctx, {
      channel: source,
      identifier: throttle.identifier,
      outcome: "failure",
    });

    return {
      kind: "error" as const,
      error: `Unsupported portal: ${hostname}`,
      code: "unsupported_url",
    };
  },
});

/**
 * Internal intake — for backend-triggered flows (SMS, share import).
 */
export const processUrl = internalMutation({
  args: {
    url: v.string(),
    source: v.union(
      v.literal("sms"),
      v.literal("share_import"),
      v.literal("manual"),
    ),
  },
  returns: v.union(v.id("sourceListings"), v.null()),
  handler: async (ctx, args) => {
    const trimmed = args.url.trim();
    let url: URL;
    try {
      const withProtocol = trimmed.startsWith("http")
        ? trimmed
        : `https://${trimmed}`;
      url = new URL(withProtocol);
    } catch {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    for (const portal of PORTAL_PATTERNS) {
      if (!portal.domains.some((domain) => hostname === domain)) {
        continue;
      }
      const match = url.pathname.match(portal.pattern);
      if (!match) {
        return null;
      }

      return await ctx.db.insert("sourceListings", {
        sourcePlatform: portal.platform,
        sourceUrl: trimmed,
        rawData: JSON.stringify({ source: args.source }),
        extractedAt: new Date().toISOString(),
        status: "pending",
      });
    }
    return null;
  },
});

/**
 * Polling query for the paste-link flow. The client calls this
 * repeatedly after `submitUrl` returns a sourceListingId — when
 * status flips to "complete" the client redirects to the property
 * page, and when it flips to "failed" the client renders the
 * typed error with a retry affordance.
 */
export const getIntakeStatus = query({
  args: { sourceListingId: v.id("sourceListings") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      sourceUrl: v.string(),
      sourcePlatform: v.string(),
      propertyId: v.optional(v.id("properties")),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.sourceListingId);
    if (!listing) return null;
    return {
      status: listing.status,
      sourceUrl: listing.sourceUrl,
      sourcePlatform: listing.sourcePlatform,
      propertyId: listing.propertyId,
      errorCode: listing.errorCode,
      errorMessage: listing.errorMessage,
    };
  },
});
