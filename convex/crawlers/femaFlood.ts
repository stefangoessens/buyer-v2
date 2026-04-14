"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// KIN-1074: FEMA National Flood Hazard Layer (NFHL) lookup.
// A parallel python-workers module exists for future batch/retry orchestration,
// but single-property lookups run inline here to avoid an extra FastAPI hop.
const FEMA_NFHL_URL =
  "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query";

const ZONE_DESCRIPTIONS: Record<string, string> = {
  X: "Minimal flood risk",
  AE: "1% annual chance flood (base flood elevation determined)",
  VE: "Coastal high hazard with wave action",
  A: "1% annual chance flood (no base flood elevation)",
  AH: "Shallow flooding (1-3 feet, ponding)",
  AO: "Shallow flooding (1-3 feet, sheet flow)",
  D: "Possible but undetermined flood hazard",
};

const MANDATED_ZONES = new Set(["AE", "VE", "A", "AH", "AO"]);

export const lookupAndPersist = internalAction({
  args: { propertyId: v.id("properties") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const property = await ctx.runQuery(internal.properties.getInternal, {
      propertyId: args.propertyId,
    });
    if (!property?.coordinates) return null;

    const { lat, lng } = property.coordinates;
    const url = new URL(FEMA_NFHL_URL);
    url.searchParams.set("geometry", `${lng},${lat}`);
    url.searchParams.set("geometryType", "esriGeometryPoint");
    url.searchParams.set("inSR", "4326");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set("outFields", "FLD_ZONE,STATIC_BFE,ZONE_SUBTY");
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("f", "json");

    let zone = "Unknown";
    let bfe: number | undefined;
    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        features?: Array<{
          attributes?: { FLD_ZONE?: string; STATIC_BFE?: number };
        }>;
      };
      const attrs = data.features?.[0]?.attributes;
      if (attrs?.FLD_ZONE) {
        zone = attrs.FLD_ZONE;
      }
      if (typeof attrs?.STATIC_BFE === "number" && attrs.STATIC_BFE !== -9999) {
        bfe = attrs.STATIC_BFE;
      }
    } catch {
      return null;
    }

    await ctx.runMutation(internal.crawlers.femaFloodPersist.persist, {
      propertyId: args.propertyId,
      femaFloodZone: zone,
      femaBaseFloodElevation: bfe,
      femaFloodInsuranceRequired: MANDATED_ZONES.has(zone),
      femaZoneDescription:
        ZONE_DESCRIPTIONS[zone] ?? "Flood zone information unavailable",
    });
    return null;
  },
});
