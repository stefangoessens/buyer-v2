import { mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getSessionContext } from "./lib/session";

const sourcePlatformValidator = v.union(
  v.literal("zillow"),
  v.literal("redfin"),
  v.literal("realtor"),
);

const extensionUnsupportedCodeValidator = v.union(
  v.literal("malformed_url"),
  v.literal("missing_listing_id"),
  v.literal("unsupported_url"),
);

const extensionIntakeResultValidator = v.union(
  v.object({
    kind: v.literal("created"),
    authState: v.union(v.literal("signed_in"), v.literal("signed_out")),
    sourceListingId: v.id("sourceListings"),
    platform: sourcePlatformValidator,
    listingId: v.string(),
    normalizedUrl: v.string(),
  }),
  v.object({
    kind: v.literal("duplicate"),
    authState: v.union(v.literal("signed_in"), v.literal("signed_out")),
    sourceListingId: v.id("sourceListings"),
    platform: sourcePlatformValidator,
    listingId: v.string(),
    normalizedUrl: v.string(),
  }),
  v.object({
    kind: v.literal("unsupported"),
    code: extensionUnsupportedCodeValidator,
    error: v.string(),
    platform: v.optional(sourcePlatformValidator),
  }),
);

const PORTAL_PATTERNS = [
  {
    platform: "zillow" as const,
    domains: ["zillow.com", "www.zillow.com"],
    match(url: URL) {
      const zpidMatch = url.pathname.match(/(\d+)_zpid/);
      if (!zpidMatch) return null;
      return { listingId: zpidMatch[1] };
    },
  },
  {
    platform: "redfin" as const,
    domains: ["redfin.com", "www.redfin.com"],
    match(url: URL) {
      const homeMatch = url.pathname.match(/\/home\/(\d+)/);
      if (!homeMatch) return null;
      return { listingId: homeMatch[1] };
    },
  },
  {
    platform: "realtor" as const,
    domains: ["realtor.com", "www.realtor.com"],
    match(url: URL) {
      const detailMatch = url.pathname.match(/\/realestateandhomes-detail\/([^/]+)/);
      if (!detailMatch) return null;
      return { listingId: detailMatch[1] };
    },
  },
] as const;

type ParsedListingUrlResult =
  | {
      success: true;
      data: {
        platform: "zillow" | "redfin" | "realtor";
        listingId: string;
        normalizedUrl: string;
        rawUrl: string;
      };
    }
  | {
      success: false;
      error: {
        code: "malformed_url" | "missing_listing_id" | "unsupported_url";
        message: string;
        platform?: "zillow" | "redfin" | "realtor";
      };
    };

function parseSubmittedListingUrl(input: string): ParsedListingUrlResult {
  const trimmed = input.trim();

  let url: URL;
  try {
    const withProtocol = trimmed.startsWith("http")
      ? trimmed
      : `https://${trimmed}`;
    url = new URL(withProtocol);
  } catch {
    return {
      success: false,
      error: {
        code: "malformed_url",
        message: "Input is not a valid URL",
      },
    };
  }

  const hostname = url.hostname.toLowerCase();

  for (const portal of PORTAL_PATTERNS) {
    if (
      !portal.domains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    ) {
      continue;
    }

    const match = portal.match(url);
    if (!match) {
      return {
        success: false,
        error: {
          code: "missing_listing_id",
          message: `URL appears to be ${portal.platform} but no listing ID could be extracted`,
          platform: portal.platform,
        },
      };
    }

    const normalized = new URL(url.pathname, `https://${portal.domains[0]}`);

    return {
      success: true,
      data: {
        platform: portal.platform,
        listingId: match.listingId,
        normalizedUrl: normalized.toString(),
        rawUrl: trimmed,
      },
    };
  }

  return {
    success: false,
    error: {
      code: "unsupported_url",
      message: `URL domain "${hostname}" is not a supported real estate portal. Supported: Zillow, Redfin, Realtor.com`,
    },
  };
}

export function buildSourceUrlLookupCandidates(
  rawUrl: string,
  normalizedUrl: string,
): Array<string> {
  const candidates: Array<string> = [];

  for (const candidate of [normalizedUrl.trim(), rawUrl.trim()]) {
    if (!candidate || candidates.includes(candidate)) {
      continue;
    }
    candidates.push(candidate);
  }

  return candidates;
}

async function findExistingSourceListing(
  ctx: MutationCtx,
  rawUrl: string,
  normalizedUrl: string,
) {
  for (const sourceUrl of buildSourceUrlLookupCandidates(rawUrl, normalizedUrl)) {
    const existing = await ctx.db
      .query("sourceListings")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", sourceUrl))
      .first();

    if (existing) {
      return existing;
    }
  }

  return null;
}

/**
 * Submit a listing URL for intake processing.
 * Public mutation — called from the paste-link hero and authenticated app.
 */
export const submitUrl = mutation({
  args: {
    url: v.string(),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      sourceListingId: v.id("sourceListings"),
      platform: sourcePlatformValidator,
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
      code: extensionUnsupportedCodeValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const parsed = parseSubmittedListingUrl(args.url);

    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.message,
        code: parsed.error.code,
      };
    }

    const existing = await findExistingSourceListing(
      ctx,
      parsed.data.rawUrl,
      parsed.data.normalizedUrl,
    );

    if (existing) {
      return {
        success: true as const,
        sourceListingId: existing._id,
        platform: parsed.data.platform,
      };
    }

    const sourceListingId = await ctx.db.insert("sourceListings", {
      sourcePlatform: parsed.data.platform,
      sourceUrl: parsed.data.normalizedUrl,
      extractedAt: new Date().toISOString(),
      status: "pending",
    });

    return {
      success: true as const,
      sourceListingId,
      platform: parsed.data.platform,
    };
  },
});

/**
 * Extension-specific intake entrypoint. It always canonicalizes the raw
 * browser URL on the backend, reuses existing source listings when possible,
 * and returns the auth/session branch explicitly so the extension can render
 * deterministic states without re-implementing portal parsing.
 */
export const submitExtensionUrl = mutation({
  args: {
    url: v.string(),
  },
  returns: extensionIntakeResultValidator,
  handler: async (ctx, args) => {
    const parsed = parseSubmittedListingUrl(args.url);

    if (!parsed.success) {
      return {
        kind: "unsupported" as const,
        code: parsed.error.code,
        error: parsed.error.message,
        platform: parsed.error.platform,
      };
    }

    const session = await getSessionContext(ctx);
    const authState: "signed_in" | "signed_out" =
      session.kind === "authenticated" ? "signed_in" : "signed_out";

    const existing = await findExistingSourceListing(
      ctx,
      parsed.data.rawUrl,
      parsed.data.normalizedUrl,
    );

    if (existing) {
      return {
        kind: "duplicate" as const,
        authState,
        sourceListingId: existing._id,
        platform: parsed.data.platform,
        listingId: parsed.data.listingId,
        normalizedUrl: parsed.data.normalizedUrl,
      };
    }

    const sourceListingId = await ctx.db.insert("sourceListings", {
      sourcePlatform: parsed.data.platform,
      sourceUrl: parsed.data.normalizedUrl,
      rawData: JSON.stringify({
        source: "extension",
        rawUrl: parsed.data.rawUrl,
      }),
      extractedAt: new Date().toISOString(),
      status: "pending",
    });

    return {
      kind: "created" as const,
      authState,
      sourceListingId,
      platform: parsed.data.platform,
      listingId: parsed.data.listingId,
      normalizedUrl: parsed.data.normalizedUrl,
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
    const parsed = parseSubmittedListingUrl(args.url);

    if (!parsed.success) {
      return null;
    }

    return await ctx.db.insert("sourceListings", {
      sourcePlatform: parsed.data.platform,
      sourceUrl: parsed.data.normalizedUrl,
      rawData: JSON.stringify({
        source: args.source,
        rawUrl: parsed.data.rawUrl,
      }),
      extractedAt: new Date().toISOString(),
      status: "pending",
    });
  },
});
