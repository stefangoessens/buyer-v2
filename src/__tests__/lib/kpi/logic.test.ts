import { describe, it, expect } from "vitest";
import {
  KNOWN_CONVEX_TABLES,
  KPI_CATALOG,
  findKpi,
  isValidKpiId,
  listKpisByCategory,
  listKpisByOwner,
  listKpisReferencingEvent,
  listKpisReferencingTable,
  listKpisWithLaunchEventSource,
  summarizeCatalog,
  validateKpiCatalog,
} from "@/lib/kpi/logic";
import { LAUNCH_EVENT_CONTRACT } from "@/lib/launchEvents/contract";
import type { KpiCatalog, KpiDefinition } from "@/lib/kpi/types";

// MARK: - Fixtures

function makeKpi(
  overrides: Partial<KpiDefinition> = {}
): KpiDefinition {
  return {
    id: "product.paste_to_teaser",
    category: "product",
    label: "Paste → Teaser conversion",
    description: "Test entry",
    formulaEnglish: "Test formula",
    formulaSymbolic: "count(a) / count(b)",
    source: {
      kind: "launchEvent",
      eventNames: ["link_pasted", "teaser_viewed"],
      combiner: "count(teaser_viewed) / count(link_pasted)",
    },
    cadence: "hourly",
    presentation: "percentage",
    owner: "growth",
    introducedIn: "1.0.0",
    ...overrides,
  };
}

// MARK: - isValidKpiId

describe("isValidKpiId", () => {
  it("accepts namespaced snake case", () => {
    expect(isValidKpiId("product.paste_to_teaser")).toBe(true);
    expect(isValidKpiId("ops.document_analysis_sla")).toBe(true);
    expect(isValidKpiId("broker.total_rebates_issued")).toBe(true);
    expect(isValidKpiId("ai.engine_latency_p95")).toBe(true);
  });

  it("accepts dot-separated subpaths", () => {
    expect(isValidKpiId("product.funnel.paste_to_teaser")).toBe(true);
  });

  it("rejects unknown category prefix", () => {
    expect(isValidKpiId("unknown.metric")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(isValidKpiId("Product.PasteToTeaser")).toBe(false);
  });

  it("rejects kebab case within segments", () => {
    expect(isValidKpiId("ops.time-to-tour")).toBe(false);
  });

  it("rejects missing namespace", () => {
    expect(isValidKpiId("paste_to_teaser")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isValidKpiId("")).toBe(false);
  });
});

// MARK: - Selectors

describe("findKpi", () => {
  it("returns a matching definition", () => {
    const found = findKpi(KPI_CATALOG, "product.paste_to_teaser");
    expect(found?.category).toBe("product");
  });

  it("returns undefined for unknown id", () => {
    expect(findKpi(KPI_CATALOG, "product.nope")).toBeUndefined();
  });
});

describe("listKpisByCategory", () => {
  it("returns every KPI in a given category", () => {
    const productKpis = listKpisByCategory(KPI_CATALOG, "product");
    expect(productKpis.length).toBeGreaterThan(0);
    for (const k of productKpis) {
      expect(k.category).toBe("product");
    }
  });

  it("returns an empty list when no KPIs exist for a category", () => {
    const empty: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [],
    };
    expect(listKpisByCategory(empty, "product")).toEqual([]);
  });
});

describe("listKpisByOwner", () => {
  it("returns every KPI owned by growth", () => {
    const growth = listKpisByOwner(KPI_CATALOG, "growth");
    for (const k of growth) {
      expect(k.owner).toBe("growth");
    }
  });
});

describe("listKpisWithLaunchEventSource", () => {
  it("returns only launchEvent-sourced KPIs", () => {
    const eventBacked = listKpisWithLaunchEventSource(KPI_CATALOG);
    for (const k of eventBacked) {
      expect(k.source.kind).toBe("launchEvent");
    }
  });
});

describe("listKpisReferencingEvent", () => {
  it("returns every KPI that cites a specific event name", () => {
    const linked = listKpisReferencingEvent(KPI_CATALOG, "tour_requested");
    expect(linked.length).toBeGreaterThan(0);
    for (const k of linked) {
      if (k.source.kind === "launchEvent") {
        expect(k.source.eventNames).toContain("tour_requested");
      }
    }
  });

  it("returns empty for an event not referenced by any KPI", () => {
    expect(
      listKpisReferencingEvent(KPI_CATALOG, "nonexistent_event")
    ).toEqual([]);
  });
});

describe("listKpisReferencingTable", () => {
  it("returns every KPI that reads from a given table", () => {
    const dealRoomKpis = listKpisReferencingTable(KPI_CATALOG, "dealRooms");
    expect(dealRoomKpis.length).toBeGreaterThan(0);
    for (const k of dealRoomKpis) {
      if (k.source.kind === "derivedState") {
        expect(k.source.tables).toContain("dealRooms");
      }
    }
  });
});

// MARK: - validateKpiCatalog

describe("validateKpiCatalog", () => {
  const launchEventNames = new Set(
    Object.keys(LAUNCH_EVENT_CONTRACT.events)
  );

  it("accepts the real catalog (with table validation)", () => {
    const result = validateKpiCatalog(
      KPI_CATALOG,
      launchEventNames,
      KNOWN_CONVEX_TABLES
    );
    if (!result.ok) {
      throw new Error(
        `real catalog failed: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it("detects duplicate ids", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [makeKpi(), makeKpi()],
    };
    const result = validateKpiCatalog(catalog, launchEventNames);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "duplicateId")).toBe(true);
    }
  });

  it("detects invalid id format", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [makeKpi({ id: "PasteToTeaser" })],
    };
    const result = validateKpiCatalog(catalog, launchEventNames);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "invalidId")).toBe(true);
    }
  });

  it("detects missing formula fields", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [
        makeKpi({ id: "product.x", formulaEnglish: "" }),
      ],
    };
    const result = validateKpiCatalog(catalog, launchEventNames);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "missingFormula")).toBe(
        true
      );
    }
  });

  it("detects empty event list on launchEvent source", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [
        makeKpi({
          id: "product.empty",
          source: {
            kind: "launchEvent",
            eventNames: [],
            combiner: "nothing",
          },
        }),
      ],
    };
    const result = validateKpiCatalog(catalog, launchEventNames);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "emptyLaunchEventList")
      ).toBe(true);
    }
  });

  it("detects empty table list on derivedState source", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [
        makeKpi({
          id: "broker.empty",
          category: "broker",
          owner: "brokerage",
          source: {
            kind: "derivedState",
            tables: [],
            combiner: "nothing",
          },
        }),
      ],
    };
    const result = validateKpiCatalog(catalog, launchEventNames);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "emptyTableList")).toBe(
        true
      );
    }
  });

  it("detects event names not in the launch contract", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [
        makeKpi({
          id: "product.phantom",
          source: {
            kind: "launchEvent",
            eventNames: ["link_pasted", "phantom_event"],
            combiner: "x",
          },
        }),
      ],
    };
    const result = validateKpiCatalog(catalog, launchEventNames);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) =>
            e.kind === "unknownEventName" &&
            e.eventName === "phantom_event"
        )
      ).toBe(true);
    }
  });

  it("detects unknown Convex table names in derivedState source", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [
        makeKpi({
          id: "broker.phantom",
          category: "broker",
          owner: "brokerage",
          source: {
            kind: "derivedState",
            tables: ["dealRooms", "phantomTable"],
            combiner: "x",
          },
        }),
      ],
    };
    const result = validateKpiCatalog(
      catalog,
      launchEventNames,
      KNOWN_CONVEX_TABLES
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) =>
            e.kind === "unknownTableName" &&
            e.tableName === "phantomTable"
        )
      ).toBe(true);
    }
  });

  it("accepts external-sourced KPIs without additional checks", () => {
    const catalog: KpiCatalog = {
      version: "0.0.1",
      lastUpdated: "2026-04-12",
      definitions: [
        makeKpi({
          id: "broker.external",
          category: "broker",
          owner: "brokerage",
          source: {
            kind: "external",
            system: "posthog",
            reference: "insight/123",
          },
        }),
      ],
    };
    const result = validateKpiCatalog(catalog, launchEventNames);
    expect(result.ok).toBe(true);
  });
});

// MARK: - summarizeCatalog

describe("summarizeCatalog", () => {
  it("counts totals and per-category breakdown", () => {
    const summary = summarizeCatalog(KPI_CATALOG);
    expect(summary.total).toBe(KPI_CATALOG.definitions.length);
    expect(summary.byCategory.product).toBeGreaterThan(0);
    expect(summary.byCategory.ops).toBeGreaterThan(0);
    expect(summary.byCategory.broker).toBeGreaterThan(0);
    expect(summary.byCategory.ai).toBeGreaterThan(0);
  });

  it("counts source-kind breakdown", () => {
    const summary = summarizeCatalog(KPI_CATALOG);
    expect(
      summary.launchEventBacked +
        summary.derivedStateBacked +
        summary.externalBacked
    ).toBe(summary.total);
  });
});

// MARK: - Real catalog cross-checks

describe("real KPI_CATALOG", () => {
  it("has at least one KPI per category", () => {
    expect(listKpisByCategory(KPI_CATALOG, "product").length).toBeGreaterThan(
      0
    );
    expect(listKpisByCategory(KPI_CATALOG, "ops").length).toBeGreaterThan(0);
    expect(listKpisByCategory(KPI_CATALOG, "broker").length).toBeGreaterThan(
      0
    );
    expect(listKpisByCategory(KPI_CATALOG, "ai").length).toBeGreaterThan(0);
  });

  it("has at least 6 product KPIs covering the core funnel", () => {
    const product = listKpisByCategory(KPI_CATALOG, "product");
    expect(product.length).toBeGreaterThanOrEqual(6);
  });

  it("every launchEvent-sourced KPI names at least one valid event", () => {
    const valid = new Set(Object.keys(LAUNCH_EVENT_CONTRACT.events));
    for (const def of KPI_CATALOG.definitions) {
      if (def.source.kind === "launchEvent") {
        for (const name of def.source.eventNames) {
          expect(valid.has(name)).toBe(true);
        }
      }
    }
  });

  it("every KPI has a non-empty formula in both forms", () => {
    for (const def of KPI_CATALOG.definitions) {
      expect(def.formulaEnglish.trim().length).toBeGreaterThan(0);
      expect(def.formulaSymbolic.trim().length).toBeGreaterThan(0);
    }
  });

  it("every KPI id matches the format regex", () => {
    for (const def of KPI_CATALOG.definitions) {
      expect(isValidKpiId(def.id)).toBe(true);
    }
  });
});
