import { v } from "convex/values";
import { query } from "../_generated/server";

export const getForProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.object({
    pros: v.array(
      v.object({
        text: v.string(),
        citation: v.optional(v.string()),
        criterionMatch: v.optional(v.boolean()),
      })
    ),
    cons: v.array(
      v.object({
        text: v.string(),
        citation: v.optional(v.string()),
        criterionMatch: v.optional(v.boolean()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const property = await ctx.db.get(args.propertyId);
    if (!property) return { pros: [], cons: [] };

    const pros: Array<{
      text: string;
      citation?: string;
      criterionMatch?: boolean;
    }> = [];
    const cons: Array<{
      text: string;
      citation?: string;
      criterionMatch?: boolean;
    }> = [];

    if (property.pool) {
      pros.push({ text: "Has a pool", citation: "MLS listing" });
    }
    if (property.waterfrontType) {
      pros.push({
        text: `Waterfront: ${property.waterfrontType}`,
        citation: "MLS listing",
      });
    }
    if (property.sqftLiving && property.sqftLiving > 2500) {
      pros.push({
        text: `Spacious ${property.sqftLiving.toLocaleString()} sqft`,
        citation: "MLS sqft",
      });
    }
    if (property.beds && property.beds >= 4) {
      pros.push({
        text: `${property.beds} bedrooms`,
        citation: "MLS beds",
      });
    }

    if (property.yearBuilt && property.yearBuilt < 1990) {
      cons.push({
        text: `Older home (${property.yearBuilt}) — verify roof + systems age`,
        citation: "Listing year built",
      });
    }
    if (property.hoaFee && property.hoaFee > 300) {
      cons.push({
        text: `High HOA ($${property.hoaFee}/${property.hoaFrequency || "month"})`,
        citation: "MLS HOA fee",
      });
    }

    return { pros, cons };
  },
});
