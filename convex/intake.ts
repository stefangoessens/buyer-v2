import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { parseListingUrl } from "../packages/shared/src/intake-parser";

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
    const parsed = parseListingUrl(args.url);
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.message,
        code: parsed.error.code,
      };
    }

    const existing = await ctx.db
      .query("sourceListings")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", parsed.data.normalizedUrl))
      .first();

    if (existing) {
      return {
        success: true as const,
        sourceListingId: existing._id,
        platform: parsed.data.platform,
      };
    }

    const id = await ctx.db.insert("sourceListings", {
      sourcePlatform: parsed.data.platform,
      sourceUrl: parsed.data.normalizedUrl,
      rawData: JSON.stringify({ rawUrl: parsed.data.rawUrl }),
      extractedAt: new Date().toISOString(),
      status: "pending",
    });

    return {
      success: true as const,
      sourceListingId: id,
      platform: parsed.data.platform,
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
    const parsed = parseListingUrl(args.url);
    if (!parsed.success) {
      return null;
    }

    const existing = await ctx.db
      .query("sourceListings")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", parsed.data.normalizedUrl))
      .first();
    if (existing) {
      return existing._id;
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
