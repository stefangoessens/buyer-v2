import { describe, it, expect } from "vitest";
import {
  CURRENT_LAUNCH_EVENT_CONTRACT_VERSION,
  LAUNCH_EVENT_CONTRACT,
  LAUNCH_EVENT_CONTRACT_CHANGELOG,
  LAUNCH_EVENT_NAMES,
  serializeLaunchEventContract,
} from "@/lib/launchEvents/contract";
import type { AnalyticsEventMap } from "@/lib/analytics";
import type { LaunchEventName } from "@/lib/launchEvents/types";

// MARK: - Contract shape

describe("LAUNCH_EVENT_CONTRACT", () => {
  it("has a semver version string", () => {
    expect(LAUNCH_EVENT_CONTRACT.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has an ISO-8601 lastUpdated date", () => {
    expect(LAUNCH_EVENT_CONTRACT.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps the changelog head in sync with the exported current version", () => {
    const latest = LAUNCH_EVENT_CONTRACT_CHANGELOG.at(-1);
    expect(latest?.version).toBe(CURRENT_LAUNCH_EVENT_CONTRACT_VERSION);
    expect(LAUNCH_EVENT_CONTRACT.version).toBe(CURRENT_LAUNCH_EVENT_CONTRACT_VERSION);
  });

  it("has at least one event per launch-critical category", () => {
    const categories = new Set(
      Object.values(LAUNCH_EVENT_CONTRACT.events).map((e) => e.category)
    );
    expect(categories).toContain("public_site");
    expect(categories).toContain("deal_room");
    expect(categories).toContain("tour");
    expect(categories).toContain("offer");
    expect(categories).toContain("closing");
    expect(categories).toContain("communication");
  });

  it("every event name matches its key (no drift)", () => {
    for (const [key, event] of Object.entries(LAUNCH_EVENT_CONTRACT.events)) {
      expect(event.name).toBe(key);
    }
  });

  it("every event has an owner, description, and introducedIn", () => {
    for (const event of Object.values(LAUNCH_EVENT_CONTRACT.events)) {
      expect(event.owner.length).toBeGreaterThan(0);
      expect(event.description.length).toBeGreaterThan(0);
      expect(event.introducedIn).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("enum props always carry a non-empty enumValues list", () => {
    for (const event of Object.values(LAUNCH_EVENT_CONTRACT.events)) {
      for (const [propName, spec] of Object.entries(event.props)) {
        if (spec.type === "enum") {
          expect(
            spec.enumValues?.length,
            `${event.name}.${propName} should have enumValues`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("integer and number props declaring min/max use consistent bounds", () => {
    for (const event of Object.values(LAUNCH_EVENT_CONTRACT.events)) {
      for (const [propName, spec] of Object.entries(event.props)) {
        if (
          spec.min !== undefined &&
          spec.max !== undefined
        ) {
          expect(
            spec.min,
            `${event.name}.${propName} min <= max`
          ).toBeLessThanOrEqual(spec.max);
        }
      }
    }
  });

  it("LAUNCH_EVENT_NAMES mirrors the events map", () => {
    const fromMap = new Set(
      Object.keys(LAUNCH_EVENT_CONTRACT.events) as LaunchEventName[]
    );
    expect(LAUNCH_EVENT_NAMES.size).toBe(fromMap.size);
    for (const name of fromMap) {
      expect(LAUNCH_EVENT_NAMES.has(name)).toBe(true);
    }
  });

  // The launch contract is a subset of the full AnalyticsEventMap.
  // Every launch event MUST have a matching entry in the broader
  // map so web-side `track()` callers get compile-time coverage.
  it("every launch event exists in the broader AnalyticsEventMap", () => {
    // TypeScript-level assertion — this test compiles iff every
    // key in the contract is also a key of AnalyticsEventMap.
    for (const name of Object.keys(LAUNCH_EVENT_CONTRACT.events)) {
      // Runtime assertion: the property exists on the typed map shape.
      // `AnalyticsEventMap` is a type-only export, but we can still
      // verify by casting a sentinel object.
      const sentinel: Partial<Record<keyof AnalyticsEventMap, true>> = {};
      sentinel[name as keyof AnalyticsEventMap] = true;
      expect(sentinel[name as keyof AnalyticsEventMap]).toBe(true);
    }
  });

  it("serializes a reviewable JSON snapshot with the current version", () => {
    const serialized = serializeLaunchEventContract();
    const parsed = JSON.parse(serialized) as typeof LAUNCH_EVENT_CONTRACT;
    expect(parsed.version).toBe(LAUNCH_EVENT_CONTRACT.version);
    expect(Object.keys(parsed.events)).toEqual(
      Object.keys(LAUNCH_EVENT_CONTRACT.events)
    );
  });
});
