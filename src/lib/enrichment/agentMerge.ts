import type {
  AgentObservation,
  FieldProvenance,
  ListingAgentProfile,
} from "./types";

const NUMERIC_FIELDS = [
  "activeListings",
  "soldCount",
  "avgDaysOnMarket",
  "medianListToSellRatio",
  "priceCutFrequency",
  "recentActivityCount",
] as const;

const STRING_FIELDS = ["name", "phone", "email", "brokerage"] as const;

export function mergeAgentObservation(
  existing: ListingAgentProfile | null,
  observation: AgentObservation,
  canonicalAgentId: string,
): ListingAgentProfile {
  const base: ListingAgentProfile =
    existing ?? {
      canonicalAgentId,
      name: observation.name,
      provenance: {},
      lastRefreshedAt: observation.fetchedAt,
    };

  const merged: ListingAgentProfile = {
    ...base,
    canonicalAgentId,
    provenance: { ...base.provenance },
  };

  for (const field of STRING_FIELDS) {
    const incoming = observation[field];
    if (incoming != null && incoming !== "") {
      merged[field] = incoming;
      merged.provenance[field] = provenanceEntry(observation);
    }
  }

  for (const field of NUMERIC_FIELDS) {
    const incoming = observation[field];
    if (typeof incoming !== "number") continue;
    const existingProv = base.provenance[field];
    if (!existingProv || observation.fetchedAt >= existingProv.fetchedAt) {
      merged[field] = incoming;
      merged.provenance[field] = provenanceEntry(observation);
    }
  }

  const portalField = portalUrlField(observation.source);
  if (observation.profileUrl) {
    merged[portalField] = observation.profileUrl;
    merged.provenance[portalField] = provenanceEntry(observation);
  }

  if (observation.fetchedAt > merged.lastRefreshedAt) {
    merged.lastRefreshedAt = observation.fetchedAt;
  }

  return merged;
}

export function observationChangesProfile(
  existing: ListingAgentProfile,
  observation: AgentObservation,
): boolean {
  for (const field of STRING_FIELDS) {
    const incoming = observation[field];
    if (incoming != null && incoming !== "" && existing[field] !== incoming) {
      return true;
    }
  }

  for (const field of NUMERIC_FIELDS) {
    const incoming = observation[field];
    if (typeof incoming !== "number") continue;
    const existingProv = existing.provenance[field];
    if (!existingProv || observation.fetchedAt >= existingProv.fetchedAt) {
      if (existing[field] !== incoming) return true;
    }
  }

  const portalField = portalUrlField(observation.source);
  if (
    observation.profileUrl &&
    existing[portalField] !== observation.profileUrl
  ) {
    return true;
  }

  return false;
}

function provenanceEntry(observation: AgentObservation): FieldProvenance {
  return { source: observation.source, fetchedAt: observation.fetchedAt };
}

function portalUrlField(
  source: AgentObservation["source"],
): "zillowProfileUrl" | "redfinProfileUrl" | "realtorProfileUrl" {
  switch (source) {
    case "zillow":
      return "zillowProfileUrl";
    case "redfin":
      return "redfinProfileUrl";
    case "realtor":
      return "realtorProfileUrl";
  }
}
