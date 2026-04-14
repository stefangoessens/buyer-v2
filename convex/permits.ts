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
    // Use chronological Date.parse instead of lexicographic localeCompare —
    // the crawler may return non-ISO formats like "3/15/2024" that sort
    // wrong as strings. Permits with unparseable issueDate fall to the
    // bottom (treated as Date 0).
    const parsePermitDate = (raw?: string): number => {
      if (!raw) return 0;
      const ms = Date.parse(raw);
      return Number.isFinite(ms) ? ms : 0;
    };
    const sortedPermits = [...record.permits].sort(
      (a, b) => parsePermitDate(b.issueDate) - parsePermitDate(a.issueDate),
    );
    const top = sortedPermits[0];
    const lastPermitDate =
      top?.issueDate && parsePermitDate(top.issueDate) > 0
        ? top.issueDate
        : null;
    return {
      permitsCount: record.permits.length,
      openPermitsCount: record.openPermitsCount,
      violationsCount: record.violations.length,
      unresolvedViolationsCount: record.unresolvedViolationsCount,
      lastPermitDate,
      lookupAt: record.lookupAt,
    };
  },
});
