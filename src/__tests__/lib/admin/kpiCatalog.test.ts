import { describe, expect, it } from "vitest";
import {
  KPI_CATALOG,
  KPI_CATEGORIES,
  KPI_BY_KEY,
  groupCatalogByCategory,
  isKnownMetricKey,
} from "@/lib/admin/kpiCatalog";

describe("admin/kpiCatalog", () => {
  it("every catalog entry has a unique key", () => {
    const keys = KPI_CATALOG.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every catalog entry has a label and description", () => {
    for (const metric of KPI_CATALOG) {
      expect(metric.label).toBeTruthy();
      expect(metric.description).toBeTruthy();
    }
  });

  it("every category has at least one metric", () => {
    for (const category of KPI_CATEGORIES) {
      expect(KPI_CATALOG.some((m) => m.category === category)).toBe(true);
    }
  });

  it("KPI_BY_KEY indexes every catalog entry", () => {
    for (const metric of KPI_CATALOG) {
      expect(KPI_BY_KEY[metric.key]).toEqual(metric);
    }
  });

  it("groupCatalogByCategory preserves category order", () => {
    const grouped = groupCatalogByCategory();
    expect(grouped.map((g) => g.category)).toEqual([
      "funnel",
      "engagement",
      "ops",
      "ai",
    ]);
  });

  it("groupCatalogByCategory lists every metric exactly once", () => {
    const grouped = groupCatalogByCategory();
    const allKeys = grouped.flatMap((g) => g.metrics.map((m) => m.key));
    expect(allKeys.sort()).toEqual(KPI_CATALOG.map((m) => m.key).sort());
  });

  describe("isKnownMetricKey", () => {
    it("accepts declared keys", () => {
      expect(isKnownMetricKey("funnel.visits")).toBe(true);
      expect(isKnownMetricKey("ai.engine_outputs_generated")).toBe(true);
    });
    it("rejects unknown keys", () => {
      expect(isKnownMetricKey("funnel.zebras")).toBe(false);
      expect(isKnownMetricKey("")).toBe(false);
    });
  });
});
