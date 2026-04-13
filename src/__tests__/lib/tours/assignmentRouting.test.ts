import { describe, expect, it } from "vitest";

import {
  coverageMatchesGeography,
  deriveAvailabilityState,
  filterCoverageRegistry,
  resolveFixedFee,
  selectRoutingDecision,
  type AgentCoverageRecord,
  type AvailabilityWindowRecord,
  type GeographyFeeConfig,
  type PreferredWindow,
} from "@/lib/tours/assignmentRouting";

const COVERAGES: AgentCoverageRecord[] = [
  {
    agentId: "agent_network",
    isActive: true,
    fixedFeePerShowing: 125,
    coverageAreas: [{ zip: "33139", city: "Miami Beach", county: "Miami-Dade" }],
  },
  {
    agentId: "agent_inactive",
    isActive: false,
    fixedFeePerShowing: 140,
    coverageAreas: [{ zip: "33139", city: "Miami Beach", county: "Miami-Dade" }],
  },
];

const PREFERRED_WINDOWS: PreferredWindow[] = [
  {
    start: "2026-04-15T10:00:00-04:00",
    end: "2026-04-15T12:00:00-04:00",
  },
];

describe("coverageMatchesGeography", () => {
  it("matches zip, city, and county case-insensitively", () => {
    expect(
      coverageMatchesGeography(COVERAGES[0], {
        zip: "33139",
        city: "miami beach",
        county: "MIAMI-DADE",
      }),
    ).toBe(true);
  });

  it("rejects inactive coverage rows", () => {
    expect(
      coverageMatchesGeography(COVERAGES[1], {
        zip: "33139",
      }),
    ).toBe(false);
  });
});

describe("deriveAvailabilityState", () => {
  it("prefers available over tentative", () => {
    const windows: AvailabilityWindowRecord[] = [
      {
        ownerId: "agent_network",
        status: "tentative",
        startAt: "2026-04-15T09:00:00-04:00",
        endAt: "2026-04-15T11:00:00-04:00",
      },
      {
        ownerId: "agent_network",
        status: "available",
        startAt: "2026-04-15T11:00:00-04:00",
        endAt: "2026-04-15T13:00:00-04:00",
      },
    ];

    expect(deriveAvailabilityState(windows, PREFERRED_WINDOWS)).toBe("available");
  });

  it("returns unavailable when no windows overlap", () => {
    const windows: AvailabilityWindowRecord[] = [
      {
        ownerId: "agent_network",
        status: "available",
        startAt: "2026-04-16T11:00:00-04:00",
        endAt: "2026-04-16T13:00:00-04:00",
      },
    ];

    expect(deriveAvailabilityState(windows, PREFERRED_WINDOWS)).toBe("unavailable");
  });
});

describe("filterCoverageRegistry", () => {
  it("returns joined coverage rows with availability state", () => {
    const rows = filterCoverageRegistry(
      COVERAGES,
      [
        {
          ownerId: "agent_network",
          status: "available",
          startAt: "2026-04-15T09:00:00-04:00",
          endAt: "2026-04-15T13:00:00-04:00",
        },
      ],
      { zip: "33139" },
      PREFERRED_WINDOWS,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.availabilityState).toBe("available");
    expect(rows[0]?.coverage.agentId).toBe("agent_network");
  });
});

describe("selectRoutingDecision", () => {
  it("chooses the network path when an active available agent matches", () => {
    const decision = selectRoutingDecision({
      coverages: COVERAGES,
      availabilityWindows: [
        {
          ownerId: "agent_network",
          status: "available",
          startAt: "2026-04-15T09:00:00-04:00",
          endAt: "2026-04-15T13:00:00-04:00",
        },
      ],
      geography: { zip: "33139" },
      preferredWindows: PREFERRED_WINDOWS,
      showamiEnabled: true,
    });

    expect(decision).toEqual({
      routingPath: "network",
      agentId: "agent_network",
      reason: "network_match",
    });
  });

  it("falls back to Showami when no network agent is available", () => {
    const decision = selectRoutingDecision({
      coverages: COVERAGES,
      availabilityWindows: [],
      geography: { zip: "33139" },
      preferredWindows: PREFERRED_WINDOWS,
      showamiEnabled: true,
    });

    expect(decision).toEqual({
      routingPath: "showami",
      reason: "showami_fallback",
    });
  });

  it("falls back to the manual queue when Showami is not available", () => {
    const decision = selectRoutingDecision({
      coverages: COVERAGES,
      availabilityWindows: [],
      geography: { zip: "33139" },
      preferredWindows: PREFERRED_WINDOWS,
      showamiEnabled: false,
    });

    expect(decision).toEqual({
      routingPath: "manual",
      reason: "manual_queue",
    });
  });
});

describe("resolveFixedFee", () => {
  const feeConfigs: GeographyFeeConfig[] = [
    {
      geographyType: "zip",
      geographyValue: "33139",
      feeAmount: 95,
      isActive: true,
    },
    {
      geographyType: "county",
      geographyValue: "Miami-Dade",
      feeAmount: 90,
      isActive: true,
    },
  ];

  it("prefers the per-agent fee when coverage exists", () => {
    expect(
      resolveFixedFee({
        geography: { zip: "33139", county: "Miami-Dade" },
        agentCoverage: COVERAGES[0],
        feeConfigs,
        defaultFee: 75,
      }),
    ).toEqual({ feeAmount: 125, source: "agent" });
  });

  it("falls back to the most specific geography fee", () => {
    expect(
      resolveFixedFee({
        geography: { zip: "33139", county: "Miami-Dade" },
        agentCoverage: null,
        feeConfigs,
        defaultFee: 75,
      }),
    ).toEqual({ feeAmount: 95, source: "geography" });
  });

  it("uses the default fee when neither agent nor geography is configured", () => {
    expect(
      resolveFixedFee({
        geography: { zip: "99999", county: "Nowhere" },
        agentCoverage: null,
        feeConfigs,
        defaultFee: 75,
      }),
    ).toEqual({ feeAmount: 75, source: "default" });
  });
});
