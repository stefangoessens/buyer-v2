import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Process a CCPA deletion request.
 * - Soft-deletes buyer profile and preferences
 * - Redacts PII from user record (keeps shell for FK integrity)
 * - Preserves agreements and audit log (legal retention)
 * - Logs the deletion request itself in audit trail
 */
export const processDeletion = internalMutation({
  args: {
    userId: v.id("users"),
    requestedBy: v.id("users"),
    reason: v.string(),
  },
  returns: v.object({
    deletedRecords: v.number(),
    preservedRecords: v.number(),
    preservedReasons: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    let deletedRecords = 0;
    let preservedRecords = 0;
    const preservedReasons: Array<string> = [];

    // 1. Redact user PII (don't delete — keep shell for FK integrity)
    const user = await ctx.db.get(args.userId);
    if (user) {
      await ctx.db.patch(args.userId, {
        email: `deleted-${args.userId}@redacted.local`,
        name: "[Deleted User]",
        phone: undefined,
        avatarUrl: undefined,
      });
      deletedRecords++;
    }

    // 2. Delete buyer profile
    const profile = await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (profile) {
      await ctx.db.delete(profile._id);
      deletedRecords++;
    }

    // 3. Preserve agreements (legal retention — FL real estate, 7 years)
    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", args.userId))
      .collect();
    if (agreements.length > 0) {
      preservedRecords += agreements.length;
      preservedReasons.push(
        `${agreements.length} agreement(s) preserved — FL real estate record retention (7 years)`
      );
    }

    // 4. Preserve audit log (permanent retention)
    const auditEntries = await ctx.db
      .query("auditLog")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    if (auditEntries.length > 0) {
      preservedRecords += auditEntries.length;
      preservedReasons.push(
        `${auditEntries.length} audit log entries preserved — permanent compliance retention`
      );
    }

    // 5. Log the deletion request itself
    await ctx.db.insert("auditLog", {
      userId: args.requestedBy,
      action: "ccpa_deletion_request",
      entityType: "users",
      entityId: args.userId,
      details: JSON.stringify({
        reason: args.reason,
        deletedRecords,
        preservedRecords,
        preservedReasons,
      }),
      timestamp: new Date().toISOString(),
    });

    return { deletedRecords, preservedRecords, preservedReasons };
  },
});
