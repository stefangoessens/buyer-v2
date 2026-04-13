/**
 * Mutations for the comp-seeding pipeline (KIN-1036).
 *
 * Lives in a separate file from the action because the action uses
 * `"use node"` and Convex forbids mutations in node-runtime modules.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

type IncomingComp = {
  zpid: string;
  sourceUrl: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number | null;
  longitude?: number | null;
  soldPriceUsd?: number | null;
  soldDate?: string | null;
  beds?: number | null;
  baths?: number | null;
  livingAreaSqft?: number | null;
  propertyType?: string | null;
  daysOnMarket?: number | null;
};

export const insertCompBatch = internalMutation({
  args: {
    comps: v.array(
      v.object({
        zpid: v.string(),
        sourceUrl: v.string(),
        addressLine1: v.string(),
        city: v.string(),
        state: v.string(),
        postalCode: v.string(),
        latitude: v.optional(v.union(v.null(), v.number())),
        longitude: v.optional(v.union(v.null(), v.number())),
        soldPriceUsd: v.optional(v.union(v.null(), v.number())),
        soldDate: v.optional(v.union(v.null(), v.string())),
        beds: v.optional(v.union(v.null(), v.number())),
        baths: v.optional(v.union(v.null(), v.number())),
        livingAreaSqft: v.optional(v.union(v.null(), v.number())),
        propertyType: v.optional(v.union(v.null(), v.string())),
        daysOnMarket: v.optional(v.union(v.null(), v.number())),
      }),
    ),
  },
  returns: v.object({ inserted: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;

    for (const raw of args.comps as IncomingComp[]) {
      const canonicalId = `zillow:${raw.zpid}`;
      const existing = await ctx.db
        .query("properties")
        .withIndex("by_canonicalId", (q) =>
          q.eq("canonicalId", canonicalId),
        )
        .unique();
      if (existing) {
        skipped++;
        continue;
      }

      const bathsFull =
        raw.baths != null ? Math.floor(raw.baths) : undefined;
      const bathsHalf =
        raw.baths != null
          ? raw.baths - Math.floor(raw.baths) >= 0.5
            ? 1
            : 0
          : undefined;

      const insertArgs = {
        canonicalId,
        zillowId: raw.zpid,
        address: {
          street: raw.addressLine1,
          city: raw.city,
          state: raw.state,
          zip: raw.postalCode,
          formatted: `${raw.addressLine1}, ${raw.city}, ${raw.state} ${raw.postalCode}`,
        },
        zip: raw.postalCode,
        coordinates:
          raw.latitude != null && raw.longitude != null
            ? { lat: raw.latitude, lng: raw.longitude }
            : undefined,
        status: "sold" as const,
        listPrice: raw.soldPriceUsd ?? undefined,
        soldPrice: raw.soldPriceUsd ?? undefined,
        soldDate: raw.soldDate ?? undefined,
        propertyType: raw.propertyType ?? undefined,
        beds: raw.beds ?? undefined,
        bathsFull,
        bathsHalf,
        sqftLiving: raw.livingAreaSqft ?? undefined,
        daysOnMarket: raw.daysOnMarket ?? undefined,
        sourcePlatform: "zillow" as const,
        extractedAt: now,
        updatedAt: now,
        role: "comp" as const,
      };

      await ctx.db.insert("properties", insertArgs);
      inserted++;
    }

    return { inserted, skipped };
  },
});

export const logSeedRun = internalMutation({
  args: {
    propertyId: v.id("properties"),
    zip: v.string(),
    inserted: v.number(),
    skipped: v.number(),
    fetched: v.number(),
    vendor: v.string(),
    costUsd: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", {
      action: "comp_seed_run",
      entityType: "properties",
      entityId: args.propertyId,
      details: JSON.stringify({
        zip: args.zip,
        inserted: args.inserted,
        skipped: args.skipped,
        fetched: args.fetched,
        vendor: args.vendor,
        costUsd: args.costUsd,
      }),
      timestamp: new Date().toISOString(),
    });
    return null;
  },
});

// Marks existing subject properties (the ones the user pasted via
// intake) with role="subject" so downstream queries can distinguish
// them from the comp pool. Safe to call repeatedly.
export const backfillSubjectRole = internalMutation({
  args: { propertyIds: v.array(v.id("properties")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.propertyIds) {
      const row = await ctx.db.get(id);
      if (row && !row.role) {
        await ctx.db.patch(id, { role: "subject" as const });
      }
    }
    return null;
  },
});
