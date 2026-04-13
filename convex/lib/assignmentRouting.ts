/**
 * Runtime copy of `src/lib/tours/assignmentRouting.ts` for Convex.
 * Keep the two files in sync manually.
 */

export interface CoverageArea {
  zip: string;
  city?: string;
  county?: string;
}

export interface AgentCoverageRecord {
  agentId: string;
  coverageAreas: CoverageArea[];
  isActive: boolean;
  fixedFeePerShowing: number;
}

export interface AvailabilityWindowRecord {
  ownerId: string;
  status: "available" | "tentative" | "unavailable" | "booked";
  startAt: string;
  endAt: string;
}

export interface PreferredWindow {
  start: string;
  end: string;
}

export interface GeographyFilter {
  zip?: string;
  city?: string;
  county?: string;
}

export interface CoverageRegistryEntry {
  coverage: AgentCoverageRecord;
  availabilityState: "available" | "tentative" | "unavailable";
}

export interface RoutingDecision {
  routingPath: "network" | "showami" | "manual";
  agentId?: string;
  reason:
    | "preferred_agent"
    | "network_match"
    | "showami_fallback"
    | "manual_queue";
}

export interface GeographyFeeConfig {
  geographyType: "zip" | "county" | "statewide";
  geographyValue: string;
  feeAmount: number;
  isActive: boolean;
}

export interface FeeResolution {
  feeAmount: number;
  source: "agent" | "geography" | "default";
}

function normalizeText(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function parseIso(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function rangesOverlap(
  leftStartIso: string,
  leftEndIso: string,
  rightStartIso: string,
  rightEndIso: string,
): boolean {
  const leftStart = parseIso(leftStartIso);
  const leftEnd = parseIso(leftEndIso);
  const rightStart = parseIso(rightStartIso);
  const rightEnd = parseIso(rightEndIso);
  if (
    leftStart === null ||
    leftEnd === null ||
    rightStart === null ||
    rightEnd === null
  ) {
    return false;
  }
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function coverageMatchesGeography(
  coverage: AgentCoverageRecord,
  geography: GeographyFilter,
): boolean {
  if (!coverage.isActive) {
    return false;
  }

  const zip = normalizeText(geography.zip);
  const city = normalizeText(geography.city);
  const county = normalizeText(geography.county);

  return coverage.coverageAreas.some((area) => {
    if (zip !== undefined && normalizeText(area.zip) !== zip) {
      return false;
    }
    if (city !== undefined && normalizeText(area.city) !== city) {
      return false;
    }
    if (county !== undefined && normalizeText(area.county) !== county) {
      return false;
    }
    return true;
  });
}

export function deriveAvailabilityState(
  windows: AvailabilityWindowRecord[],
  preferredWindows: PreferredWindow[],
): "available" | "tentative" | "unavailable" {
  const overlapping =
    preferredWindows.length === 0
      ? windows
      : windows.filter((window) =>
          preferredWindows.some((preferred) =>
            rangesOverlap(
              window.startAt,
              window.endAt,
              preferred.start,
              preferred.end,
            ),
          ),
        );

  if (overlapping.some((window) => window.status === "available")) {
    return "available";
  }
  if (overlapping.some((window) => window.status === "tentative")) {
    return "tentative";
  }
  return "unavailable";
}

export function filterCoverageRegistry(
  coverages: AgentCoverageRecord[],
  availabilityWindows: AvailabilityWindowRecord[],
  geography: GeographyFilter,
  preferredWindows: PreferredWindow[],
  availabilityFilter?: "available" | "tentative" | "unavailable",
): CoverageRegistryEntry[] {
  const matched = coverages
    .filter((coverage) => coverageMatchesGeography(coverage, geography))
    .map((coverage) => {
      const windows = availabilityWindows.filter(
        (window) => window.ownerId === coverage.agentId,
      );
      return {
        coverage,
        availabilityState: deriveAvailabilityState(windows, preferredWindows),
      };
    });

  if (availabilityFilter === undefined) {
    return matched;
  }

  return matched.filter(
    (entry) => entry.availabilityState === availabilityFilter,
  );
}

export function selectRoutingDecision(params: {
  coverages: AgentCoverageRecord[];
  availabilityWindows: AvailabilityWindowRecord[];
  geography: GeographyFilter;
  preferredWindows: PreferredWindow[];
  preferredAgentId?: string;
  showamiEnabled: boolean;
}): RoutingDecision {
  if (params.preferredAgentId) {
    return {
      routingPath: "manual",
      agentId: params.preferredAgentId,
      reason: "preferred_agent",
    };
  }

  const candidates = filterCoverageRegistry(
    params.coverages,
    params.availabilityWindows,
    params.geography,
    params.preferredWindows,
  );

  const networkCandidate =
    candidates.find((candidate) => candidate.availabilityState === "available") ??
    candidates.find((candidate) => candidate.availabilityState === "tentative");

  if (networkCandidate) {
    return {
      routingPath: "network",
      agentId: networkCandidate.coverage.agentId,
      reason: "network_match",
    };
  }

  if (params.showamiEnabled) {
    return {
      routingPath: "showami",
      reason: "showami_fallback",
    };
  }

  return {
    routingPath: "manual",
    reason: "manual_queue",
  };
}

export function resolveFixedFee(params: {
  geography: GeographyFilter;
  agentCoverage?: AgentCoverageRecord | null;
  feeConfigs: GeographyFeeConfig[];
  defaultFee: number;
}): FeeResolution {
  if (params.agentCoverage) {
    return {
      feeAmount: params.agentCoverage.fixedFeePerShowing,
      source: "agent",
    };
  }

  const zip = normalizeText(params.geography.zip);
  const county = normalizeText(params.geography.county);
  const activeConfigs = params.feeConfigs.filter((config) => config.isActive);

  const zipMatch =
    zip === undefined
      ? undefined
      : activeConfigs.find(
          (config) =>
            config.geographyType === "zip" &&
            normalizeText(config.geographyValue) === zip,
        );
  if (zipMatch) {
    return { feeAmount: zipMatch.feeAmount, source: "geography" };
  }

  const countyMatch =
    county === undefined
      ? undefined
      : activeConfigs.find(
          (config) =>
            config.geographyType === "county" &&
            normalizeText(config.geographyValue) === county,
        );
  if (countyMatch) {
    return { feeAmount: countyMatch.feeAmount, source: "geography" };
  }

  const statewideMatch = activeConfigs.find(
    (config) => config.geographyType === "statewide",
  );
  if (statewideMatch) {
    return { feeAmount: statewideMatch.feeAmount, source: "geography" };
  }

  return { feeAmount: params.defaultFee, source: "default" };
}
