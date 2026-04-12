import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

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
      platform: v.string(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
      code: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const trimmed = args.url.trim();

    // Parse URL
    let url: URL;
    try {
      const withProtocol = trimmed.startsWith("http")
        ? trimmed
        : `https://${trimmed}`;
      url = new URL(withProtocol);
    } catch {
      return {
        success: false as const,
        error: "Invalid URL",
        code: "malformed_url",
      };
    }

    const hostname = url.hostname.toLowerCase();

    // Find matching portal
    for (const portal of PORTAL_PATTERNS) {
      if (!portal.domains.some((d) => hostname === d)) continue;

      const match = url.pathname.match(portal.pattern);
      if (!match) {
        return {
          success: false as const,
          error: `No listing ID found in ${portal.platform} URL`,
          code: "missing_listing_id",
        };
      }

      // Check for existing listing with this URL (use .first() since duplicates possible)
      const existing = await ctx.db
        .query("sourceListings")
        .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", trimmed))
        .first();

      if (existing) {
        return {
          success: true as const,
          sourceListingId: existing._id,
          platform: portal.platform,
        };
      }

      // Create new source listing
      const id = await ctx.db.insert("sourceListings", {
        sourcePlatform: portal.platform,
        sourceUrl: trimmed,
        extractedAt: new Date().toISOString(),
        status: "pending",
      });

      return {
        success: true as const,
        sourceListingId: id,
        platform: portal.platform,
      };
    }

    return {
      success: false as const,
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
      v.literal("manual")
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
      if (!portal.domains.some((d) => hostname === d)) continue;
      const match = url.pathname.match(portal.pattern);
      if (!match) return null;

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
