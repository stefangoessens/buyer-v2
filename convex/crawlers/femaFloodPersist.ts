import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// KIN-1074: persistence mutation split from femaFlood.ts because mutations
// cannot live in a "use node" module alongside the fetch-based action.
export const persist = internalMutation({
  args: {
    propertyId: v.id("properties"),
    femaFloodZone: v.string(),
    femaBaseFloodElevation: v.optional(v.number()),
    femaFloodInsuranceRequired: v.boolean(),
    femaZoneDescription: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.propertyId, {
      femaFloodZone: args.femaFloodZone,
      femaBaseFloodElevation: args.femaBaseFloodElevation,
      femaFloodInsuranceRequired: args.femaFloodInsuranceRequired,
      femaZoneDescription: args.femaZoneDescription,
      femaLookupAt: new Date().toISOString(),
    });
    return null;
  },
});
