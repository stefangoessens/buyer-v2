import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const logRun = internalMutation({
  args: {
    propertyId: v.id("properties"),
    summary: v.array(
      v.object({
        engine: v.string(),
        ok: v.boolean(),
        error: v.optional(v.string()),
      }),
    ),
    runAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", {
      action: "engine_orchestration_run",
      entityType: "properties",
      entityId: args.propertyId,
      details: JSON.stringify({ summary: args.summary }),
      timestamp: args.runAt,
    });
    return null;
  },
});
