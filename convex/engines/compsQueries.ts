/**
 * Read queries for the comps engine (KIN-1036).
 *
 * Separated from comps.ts because that file uses `"use node"` and
 * Convex forbids queries in node-runtime modules.
 */

import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const listSeededCompsForZip = internalQuery({
  args: { zip: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("properties")
      .withIndex("by_zip", (q) => q.eq("zip", args.zip))
      .collect();

    const comps = rows.filter((r) => r.role === "comp");

    // Shape each row into the CompCandidate envelope `selectComps`
    // expects. Required fields: canonicalId, zip, soldPrice, soldDate,
    // beds, baths, sqft, yearBuilt, propertyType, plus optionals.
    return comps.map((c) => ({
      canonicalId: c.canonicalId,
      zip: c.zip ?? c.address?.zip ?? args.zip,
      address: c.address?.formatted ?? c.address?.street ?? "",
      soldPrice: c.soldPrice ?? c.listPrice ?? 0,
      listPrice: c.listPrice,
      soldDate: c.soldDate ?? c.updatedAt,
      beds: c.beds ?? 0,
      baths: (c.bathsFull ?? 0) + (c.bathsHalf ?? 0) * 0.5,
      sqft: c.sqftLiving ?? 0,
      yearBuilt: c.yearBuilt ?? 0,
      lotSize: c.lotSize,
      propertyType: c.propertyType ?? "Unknown",
      waterfront: false,
      pool: c.pool,
      hoaFee: c.hoaFee,
      subdivision: c.subdivision,
      dom: c.daysOnMarket ?? 0,
      sourcePlatform: `zillow:${c.zillowId ?? c.canonicalId}`,
    }));
  },
});
