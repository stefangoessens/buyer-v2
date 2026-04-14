import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// KIN-1072: persistence mutation split from papaBroward.ts because mutations
// cannot live in a "use node" module alongside the Cloud-call action.
export const persist = internalMutation({
  args: {
    propertyId: v.id("properties"),
    folio: v.string(),
    currentOwner: v.string(),
    isCorporate: v.boolean(),
    assessedValue: v.optional(v.number()),
    justValue: v.optional(v.number()),
    taxableValue: v.optional(v.number()),
    exemptions: v.array(v.string()),
    lastSalePrice: v.optional(v.number()),
    lastSaleDate: v.optional(v.string()),
    taxBillTotal: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.propertyId, {
      papaFolio: args.folio,
      papaCurrentOwner: args.currentOwner,
      papaIsCorporate: args.isCorporate,
      papaAssessedValue: args.assessedValue,
      papaJustValue: args.justValue,
      papaTaxableValue: args.taxableValue,
      papaExemptions: args.exemptions,
      papaLastSalePrice: args.lastSalePrice,
      papaLastSaleDate: args.lastSaleDate,
      papaTaxBillTotal: args.taxBillTotal,
      papaLookupAt: new Date().toISOString(),
    });
    return null;
  },
});
