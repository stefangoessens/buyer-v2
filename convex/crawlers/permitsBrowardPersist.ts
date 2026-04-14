import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// KIN-1073: persistence mutation split from permitsBroward.ts because
// mutations cannot live in a "use node" module alongside the Cloud-call
// action. Mirrors papaBrowardPersist.ts.

const permitValidator = v.object({
  permitNumber: v.string(),
  type: v.string(),
  description: v.string(),
  issueDate: v.optional(v.string()),
  status: v.string(),
  finalDate: v.optional(v.string()),
  cost: v.optional(v.number()),
});

const violationValidator = v.object({
  violationNumber: v.string(),
  type: v.string(),
  issueDate: v.optional(v.string()),
  status: v.string(),
  resolvedDate: v.optional(v.string()),
});

const inspectionValidator = v.object({
  permitNumber: v.string(),
  type: v.string(),
  date: v.optional(v.string()),
  result: v.string(),
  notes: v.string(),
});

export const persist = internalMutation({
  args: {
    propertyId: v.id("properties"),
    permits: v.array(permitValidator),
    violations: v.array(violationValidator),
    inspections: v.array(inspectionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const openPermitsCount = args.permits.filter((p) =>
      ["issued", "in_progress", "active", "pending"].includes(
        p.status.toLowerCase().replace(" ", "_"),
      ),
    ).length;
    const unresolvedViolationsCount = args.violations.filter(
      (v) => v.status.toLowerCase() !== "resolved" && !v.resolvedDate,
    ).length;

    const existing = await ctx.db
      .query("propertyPermits")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .first();

    const payload = {
      propertyId: args.propertyId,
      permits: args.permits,
      openPermitsCount,
      violations: args.violations,
      unresolvedViolationsCount,
      inspections: args.inspections,
      lookupAt: new Date().toISOString(),
    };

    if (existing) {
      await ctx.db.replace(existing._id, payload);
    } else {
      await ctx.db.insert("propertyPermits", payload);
    }
    return null;
  },
});
