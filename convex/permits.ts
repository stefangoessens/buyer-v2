import { query } from "./_generated/server";
import { v } from "convex/values";

export const getForProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.union(
    v.null(),
    v.object({
      permitsCount: v.number(),
      openPermitsCount: v.number(),
      violationsCount: v.number(),
      unresolvedViolationsCount: v.number(),
      lastPermitDate: v.union(v.null(), v.string()),
      lookupAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("propertyPermits")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .first();
    if (!record) return null;
    const sortedPermits = [...record.permits].sort((a, b) =>
      (b.issueDate ?? "").localeCompare(a.issueDate ?? ""),
    );
    return {
      permitsCount: record.permits.length,
      openPermitsCount: record.openPermitsCount,
      violationsCount: record.violations.length,
      unresolvedViolationsCount: record.unresolvedViolationsCount,
      lastPermitDate: sortedPermits[0]?.issueDate ?? null,
      lookupAt: record.lookupAt,
    };
  },
});
