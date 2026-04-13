import type {
  EnrichmentSource,
  ListingAgentPortalTarget,
  NeighborhoodMarketRequest,
  PortalEstimateRequestTarget,
  PortalName,
} from "./types";

export interface EnrichmentPropertyInput {
  canonicalId: string;
  folioNumber?: string;
  sourcePlatform: PortalName | "manual";
  address: {
    city: string;
    formatted?: string;
    zip: string;
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
  zillowId?: string;
  redfinId?: string;
  realtorId?: string;
  listingAgentName?: string;
  listingBrokerage?: string;
  listingAgentPhone?: string;
  subdivision?: string;
}

export interface CrossPortalIdInput {
  zillowId?: string;
  redfinId?: string;
  realtorId?: string;
}

export function buildEnrichmentContext(
  property: EnrichmentPropertyInput,
  source: EnrichmentSource,
  crossPortalIds?: CrossPortalIdInput,
): Record<string, unknown> | null {
  const formattedAddress = property.address.formatted?.trim();
  const portalTargets = buildPortalTargets(property, crossPortalIds);

  switch (source) {
    case "fema_flood":
      if (property.coordinates) {
        return {
          lat: property.coordinates.lat,
          lng: property.coordinates.lng,
          address: formattedAddress,
        };
      }
      return formattedAddress ? { address: formattedAddress } : null;
    case "county_appraiser":
      if (!formattedAddress) return null;
      return {
        address: formattedAddress,
        folioNumber: property.folioNumber,
      };
    case "census_geocode":
      return formattedAddress ? { address: formattedAddress } : null;
    case "cross_portal_match":
      return { canonicalId: property.canonicalId };
    case "listing_agent_profile":
      if (!property.listingAgentName || portalTargets.length === 0) return null;
      return {
        agentName: property.listingAgentName,
        brokerage: property.listingBrokerage,
        phone: property.listingAgentPhone,
        portals: portalTargets,
      };
    case "neighborhood_market": {
      const requests = buildNeighborhoodRequests(property);
      return requests.length > 0 ? { requests } : null;
    }
    case "portal_estimates": {
      const targets = buildPortalEstimateTargets(property, crossPortalIds);
      return targets.length > 0 ? { targets } : null;
    }
    case "recent_sales":
      if (!property.address.zip) return null;
      return {
        geoKey: property.address.zip,
        geoKind: "zip",
        windowDays: 90,
        subject: {
          canonicalId: property.canonicalId,
          subdivision: property.subdivision,
          zip: property.address.zip,
        },
      };
    case "browser_use_fallback":
      return null;
  }
}

export function buildEnrichmentContexts(
  property: EnrichmentPropertyInput,
  crossPortalIds?: CrossPortalIdInput,
): Partial<Record<EnrichmentSource, Record<string, unknown>>> {
  const contexts: Partial<Record<EnrichmentSource, Record<string, unknown>>> = {};

  const sources: EnrichmentSource[] = [
    "cross_portal_match",
    "portal_estimates",
    "census_geocode",
    "fema_flood",
    "county_appraiser",
    "listing_agent_profile",
    "neighborhood_market",
    "recent_sales",
  ];

  for (const source of sources) {
    const context = buildEnrichmentContext(property, source, crossPortalIds);
    if (context) contexts[source] = context;
  }

  return contexts;
}

export function buildPortalTargets(
  property: EnrichmentPropertyInput,
  crossPortalIds?: CrossPortalIdInput,
): ListingAgentPortalTarget[] {
  const resolved = {
    zillow: crossPortalIds?.zillowId ?? property.zillowId,
    redfin: crossPortalIds?.redfinId ?? property.redfinId,
    realtor: crossPortalIds?.realtorId ?? property.realtorId,
  };

  const portals: ListingAgentPortalTarget[] = [];
  if (resolved.zillow || property.sourcePlatform === "zillow") {
    portals.push({ portal: "zillow", propertyExternalId: resolved.zillow });
  }
  if (resolved.redfin || property.sourcePlatform === "redfin") {
    portals.push({ portal: "redfin", propertyExternalId: resolved.redfin });
  }
  if (resolved.realtor || property.sourcePlatform === "realtor") {
    portals.push({ portal: "realtor", propertyExternalId: resolved.realtor });
  }
  return portals;
}

export function buildPortalEstimateTargets(
  property: EnrichmentPropertyInput,
  crossPortalIds?: CrossPortalIdInput,
): PortalEstimateRequestTarget[] {
  const targets: PortalEstimateRequestTarget[] = [];
  const ids = {
    zillow: crossPortalIds?.zillowId ?? property.zillowId,
    redfin: crossPortalIds?.redfinId ?? property.redfinId,
    realtor: crossPortalIds?.realtorId ?? property.realtorId,
  };

  for (const portal of ["zillow", "redfin", "realtor"] as const) {
    targets.push({
      portal,
      canonicalId: ids[portal] ?? property.canonicalId,
    });
  }

  return targets;
}

export function buildNeighborhoodRequests(
  property: EnrichmentPropertyInput,
): NeighborhoodMarketRequest[] {
  const requests: NeighborhoodMarketRequest[] = [];
  const seen = new Set<string>();
  const candidates: Array<{ geoKey?: string; geoKind: NeighborhoodMarketRequest["geoKind"] }> = [
    { geoKey: property.address.zip, geoKind: "zip" },
    { geoKey: property.subdivision, geoKind: "subdivision" },
    { geoKey: property.address.city, geoKind: "city" },
  ];

  for (const candidate of candidates) {
    const geoKey = candidate.geoKey?.trim();
    if (!geoKey) continue;
    for (const windowDays of [30, 60, 90]) {
      const key = `${candidate.geoKind}:${geoKey}:${windowDays}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requests.push({
        geoKey,
        geoKind: candidate.geoKind,
        windowDays,
      });
    }
  }

  return requests;
}
