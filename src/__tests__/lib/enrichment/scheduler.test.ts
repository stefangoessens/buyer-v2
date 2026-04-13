import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  retryDelaySeconds,
  shouldRetry,
} from "@/lib/enrichment/scheduler";
import type { EnrichmentSource } from "@/lib/enrichment/types";
import {
  CRITICAL_SOURCES,
  ENRICHMENT_SOURCES,
  SOURCE_PRIORITY,
} from "@/lib/enrichment/types";

const NOW = new Date("2026-04-12T12:00:00Z");
const oneHourAgo = new Date("2026-04-12T11:00:00Z").toISOString();
const fortyDaysAgo = new Date("2026-03-03T12:00:00Z").toISOString();

describe("enrichment/scheduler", () => {
  describe("retryDelaySeconds", () => {
    it("follows exponential backoff from 10s", () => {
      expect(retryDelaySeconds(0)).toBe(10);
      expect(retryDelaySeconds(1)).toBe(20);
      expect(retryDelaySeconds(2)).toBe(40);
      expect(retryDelaySeconds(3)).toBe(80);
    });

    it("caps at 3600 seconds (1 hour)", () => {
      expect(retryDelaySeconds(10)).toBe(3600);
      expect(retryDelaySeconds(20)).toBe(3600);
    });

    it("handles attempt=0 without dividing by zero", () => {
      expect(retryDelaySeconds(0)).toBeGreaterThan(0);
    });
  });

  describe("shouldRetry", () => {
    it("retries when retryable + under max attempts", () => {
      expect(
        shouldRetry({ attempt: 1, maxAttempts: 3, retryable: true }),
      ).toBe(true);
    });

    it("does not retry when not retryable", () => {
      expect(
        shouldRetry({ attempt: 1, maxAttempts: 3, retryable: false }),
      ).toBe(false);
    });

    it("does not retry once attempts exhausted", () => {
      expect(
        shouldRetry({ attempt: 3, maxAttempts: 3, retryable: true }),
      ).toBe(false);
    });
  });

  describe("buildSchedule", () => {
    it("returns a decision for every source", () => {
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: new Map(),
        inFlightSources: new Set(),
        now: NOW,
      });
      expect(plan).toHaveLength(ENRICHMENT_SOURCES.length);
      const bySource = new Map(plan.map((p) => [p.source, p]));
      for (const source of ENRICHMENT_SOURCES) {
        expect(bySource.has(source)).toBe(true);
      }
    });

    it("orders decisions by priority ascending", () => {
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: new Map(),
        inFlightSources: new Set(),
        now: NOW,
      });
      for (let i = 1; i < plan.length; i++) {
        expect(plan[i]!.priority).toBeGreaterThanOrEqual(plan[i - 1]!.priority);
      }
    });

    it("uses the priority map for each decision", () => {
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: new Map(),
        inFlightSources: new Set(),
        now: NOW,
      });
      for (const decision of plan) {
        expect(decision.priority).toBe(SOURCE_PRIORITY[decision.source]);
      }
    });

    it("skips a source that is already in-flight", () => {
      const inFlightSources = new Set<EnrichmentSource>(["fema_flood"]);
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: new Map(),
        inFlightSources,
        now: NOW,
      });
      const flood = plan.find((p) => p.source === "fema_flood")!;
      expect(flood.shouldSkip).toBe(true);
      expect(flood.skipReason).toBeDefined();
    });

    it("skips a source whose cache is still fresh", () => {
      const fresh = new Map<EnrichmentSource, { lastRefreshedAt: string }>([
        ["neighborhood_market", { lastRefreshedAt: oneHourAgo }],
      ]);
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: fresh,
        inFlightSources: new Set(),
        now: NOW,
      });
      const decision = plan.find((p) => p.source === "neighborhood_market")!;
      expect(decision.shouldSkip).toBe(true);
    });

    it("does NOT skip a source whose cache is stale", () => {
      const stale = new Map<EnrichmentSource, { lastRefreshedAt: string }>([
        ["fema_flood", { lastRefreshedAt: fortyDaysAgo }],
      ]);
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: stale,
        inFlightSources: new Set(),
        now: NOW,
      });
      const decision = plan.find((p) => p.source === "fema_flood")!;
      expect(decision.shouldSkip).toBe(false);
    });

    it("forceRefresh overrides fresh-cache skip", () => {
      const fresh = new Map<EnrichmentSource, { lastRefreshedAt: string }>([
        ["neighborhood_market", { lastRefreshedAt: oneHourAgo }],
      ]);
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: fresh,
        inFlightSources: new Set(),
        forceRefresh: true,
        now: NOW,
      });
      const decision = plan.find((p) => p.source === "neighborhood_market")!;
      expect(decision.shouldSkip).toBe(false);
    });

    it("forceRefresh does NOT override in-flight skip", () => {
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: new Map(),
        inFlightSources: new Set(["fema_flood"]),
        forceRefresh: true,
        now: NOW,
      });
      const decision = plan.find((p) => p.source === "fema_flood")!;
      expect(decision.shouldSkip).toBe(true);
    });

    it("produces dedupe keys scoped per (propertyId, source)", () => {
      const plan = buildSchedule({
        propertyId: "propX",
        freshSources: new Map(),
        inFlightSources: new Set(),
        now: NOW,
      });
      const keys = plan.map((p) => p.dedupeKey);
      expect(new Set(keys).size).toBe(keys.length);
      for (const decision of plan) {
        expect(decision.dedupeKey).toContain("propX");
        expect(decision.dedupeKey).toContain(decision.source);
      }
    });

    it("assigns max attempts from the source registry", () => {
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: new Map(),
        inFlightSources: new Set(),
        now: NOW,
      });
      for (const decision of plan) {
        expect(decision.maxAttempts).toBeGreaterThanOrEqual(1);
      }
    });

    it("includes every critical source in the plan", () => {
      const plan = buildSchedule({
        propertyId: "p1",
        freshSources: new Map(),
        inFlightSources: new Set(),
        now: NOW,
      });
      for (const critical of CRITICAL_SOURCES) {
        expect(plan.find((p) => p.source === critical)).toBeDefined();
      }
    });
  });
});
