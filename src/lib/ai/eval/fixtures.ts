/**
 * In-memory fixture registry for the eval harness.
 *
 * Real fixture sets grow as closed deals feed back into the calibration
 * loop (KIN-786). This file seeds the harness with a minimal working set
 * so the CLI and CI can run against a real shape on day one. Additional
 * fixtures for other engines are placeholders — they populate as the
 * calibration loop collects examples from real buyer transactions.
 */

import type { PricingInput, PricingOutput } from "../engines/types";
import type { EngineType, Fixture } from "./types";

/**
 * Registry of golden fixtures keyed by engine type.
 *
 * Note: the `unknown` typing on the outer map lets callers of `loadFixtures`
 * get back a typed fixture array via the overload on `loadFixtures`. The
 * fixture bodies themselves are strictly typed at the point of declaration.
 */
export const FIXTURE_SETS: Record<EngineType, Fixture[]> = {
  pricing: [
    {
      id: "miami-condo-001",
      engineType: "pricing",
      label: "Downtown Miami 2BR condo, Brickell",
      input: {
        propertyId: "test-miami-001",
        listPrice: 650000,
        address: "123 Brickell Ave, Miami, FL 33131",
        beds: 2,
        baths: 2,
        sqft: 1200,
        yearBuilt: 2018,
        propertyType: "condo",
        zestimate: 640000,
        redfinEstimate: 655000,
        neighborhoodMedianPsf: 550,
      } satisfies PricingInput,
      expected: {
        fairValue: {
          value: 645000,
          deltaVsListPrice: -0.77,
          deltaVsConsensus: 0,
          confidence: 0.85,
        },
        likelyAccepted: {
          value: 625000,
          deltaVsListPrice: -3.85,
          deltaVsConsensus: -3.1,
          confidence: 0.8,
        },
        strongOpener: {
          value: 595000,
          deltaVsListPrice: -8.46,
          deltaVsConsensus: -7.75,
          confidence: 0.75,
        },
        walkAway: {
          value: 670000,
          deltaVsListPrice: 3.08,
          deltaVsConsensus: 3.88,
          confidence: 0.7,
        },
        consensusEstimate: 647500,
        estimateSpread: 0.012,
        estimateSources: ["zestimate", "redfinEstimate"],
        overallConfidence: 0.82,
      } satisfies PricingOutput,
      rubric: "MAPE-based scoring — accept up to 5% error on fair value.",
      createdAt: "2026-04-12T00:00:00Z",
      source: "manual",
    } as Fixture<PricingInput, PricingOutput>,
  ],
  comps: [], // placeholder — populate from closed deals
  leverage: [], // placeholder
  offer: [], // placeholder
  cost: [], // placeholder
  docs: [], // placeholder
  case_synthesis: [], // placeholder
};

/**
 * Load a fixture set by engine type. Throws if the set is empty — callers
 * who want to tolerate missing fixtures should use `availableFixtureEngines`
 * first to check.
 */
export function loadFixtures(engineType: EngineType): Fixture[] {
  const set = FIXTURE_SETS[engineType];
  if (!set || set.length === 0) {
    throw new Error(`No fixtures available for engine type: ${engineType}`);
  }
  return set;
}

/** Return a list of engine types that currently have fixtures. */
export function availableFixtureEngines(): EngineType[] {
  return Object.entries(FIXTURE_SETS)
    .filter(([, fxs]) => fxs.length > 0)
    .map(([engine]) => engine as EngineType);
}
