import { query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_SUPPORT_EMAIL = "support@buyerv2.com";

/**
 * Minimal public settings seam for the marketing site.
 *
 * Only exposes the support triage email needed by `/contact`. We keep
 * the internal settings area ops-gated; public callers get a single
 * read-only value and nothing else.
 */
export const getSupportEmail = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settingsEntries")
      .withIndex("by_key", (q) => q.eq("key", "ops.support_email"))
      .unique();

    if (row && row.kind === "string" && typeof row.stringValue === "string") {
      return row.stringValue;
    }

    return DEFAULT_SUPPORT_EMAIL;
  },
});
