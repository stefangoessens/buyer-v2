import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Merge source listing data into a canonical property record.
 * Called after extraction completes for a source listing.
 */
export const mergeIntoProperty = internalMutation({
  args: {
    propertyId: v.id("properties"),
    mergedFields: v.any(),
    provenance: v.any(),
    conflictCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");

    // Patch the property with merged fields (excluding provenance metadata)
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      args.mergedFields as Record<string, unknown>
    )) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    patch.updatedAt = new Date().toISOString();

    await ctx.db.patch(args.propertyId, patch);

    // Log the merge in audit trail
    await ctx.db.insert("auditLog", {
      action: "property_merged",
      entityType: "properties",
      entityId: args.propertyId,
      details: JSON.stringify({
        fieldsUpdated: Object.keys(args.mergedFields as object).length,
        conflicts: args.conflictCount,
      }),
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});
