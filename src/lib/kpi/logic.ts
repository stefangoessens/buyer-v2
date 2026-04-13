/**
 * Pure selectors + validation for the KPI catalog (KIN-861 phase 1).
 *
 * The UI dashboard (follow-up card) consumes this module; it does
 * not re-define KPIs inline. Every function is pure — no Convex
 * calls, no IO — so the full decision tree is exercised in Vitest.
 */

import { KPI_CATALOG } from "./catalog";
import { LAUNCH_EVENT_CONTRACT } from "@/lib/launchEvents/contract";
import type {
  KpiCatalog,
  KpiCategory,
  KpiDefinition,
  KpiValidation,
  KpiValidationError,
} from "./types";

// MARK: - Slug / id validation

/**
 * Valid KPI id: category prefix + dot-separated kebab/snake path,
 * all lowercase.
 *
 *   product.paste_to_teaser           ✓
 *   ops.document_analysis_sla         ✓
 *   ai.engine_latency_p95             ✓
 *
 *   ProductPasteToTeaser              ✗
 *   ai-engine-latency-p95             ✗
 */
const KPI_ID_REGEX =
  /^(product|ops|broker|ai)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

export function isValidKpiId(id: string): boolean {
  return KPI_ID_REGEX.test(id);
}

// MARK: - Selectors

/**
 * Return a KPI definition by id, or undefined if not found.
 */
export function findKpi(
  catalog: KpiCatalog,
  id: string
): KpiDefinition | undefined {
  return catalog.definitions.find((d) => d.id === id);
}

/**
 * Return every KPI in the given category, in catalog order.
 */
export function listKpisByCategory(
  catalog: KpiCatalog,
  category: KpiCategory
): KpiDefinition[] {
  return catalog.definitions.filter((d) => d.category === category);
}

/**
 * Return every KPI owned by a given team. Used by the owner-scoped
 * dashboard variants.
 */
export function listKpisByOwner(
  catalog: KpiCatalog,
  owner: KpiDefinition["owner"]
): KpiDefinition[] {
  return catalog.definitions.filter((d) => d.owner === owner);
}

/**
 * Return every KPI that sources from the launch event contract.
 * Used by the event-to-KPI cross reference in the runbook.
 */
export function listKpisWithLaunchEventSource(
  catalog: KpiCatalog
): KpiDefinition[] {
  return catalog.definitions.filter(
    (d) => d.source.kind === "launchEvent"
  );
}

/**
 * Return every KPI that references a specific launch event name.
 * Used when an event is changed or removed from the contract so
 * ops can see which KPIs are affected.
 */
export function listKpisReferencingEvent(
  catalog: KpiCatalog,
  eventName: string
): KpiDefinition[] {
  return catalog.definitions.filter(
    (d) =>
      d.source.kind === "launchEvent" &&
      d.source.eventNames.includes(eventName)
  );
}

/**
 * Return every KPI that reads from a specific Convex table. Used
 * when a schema migration changes or removes a table.
 */
export function listKpisReferencingTable(
  catalog: KpiCatalog,
  tableName: string
): KpiDefinition[] {
  return catalog.definitions.filter(
    (d) => d.source.kind === "derivedState" && d.source.tables.includes(tableName)
  );
}

// MARK: - Validation

/**
 * Validate the full KPI catalog. Checks:
 *   - ids are unique
 *   - ids match the kebab/snake format
 *   - formulaEnglish + formulaSymbolic are both non-empty
 *   - source has at least one event (for launchEvent) or table
 *     (for derivedState)
 *   - every `launchEvent` source name exists in the KIN-845
 *     launch event contract — this is the key cross-catalog
 *     guarantee that dashboards won't reference phantom events
 *
 * Pass the launch contract in so tests can supply a minimal
 * fixture without the full catalog noise.
 */
export function validateKpiCatalog(
  catalog: KpiCatalog,
  launchEventNames: ReadonlySet<string> = new Set(
    Object.keys(LAUNCH_EVENT_CONTRACT.events)
  )
): KpiValidation {
  const errors: KpiValidationError[] = [];
  const seen = new Set<string>();

  for (const def of catalog.definitions) {
    if (!isValidKpiId(def.id)) {
      errors.push({ kind: "invalidId", id: def.id });
    }
    if (seen.has(def.id)) {
      errors.push({ kind: "duplicateId", id: def.id });
    }
    seen.add(def.id);

    if (!def.formulaEnglish.trim() || !def.formulaSymbolic.trim()) {
      errors.push({ kind: "missingFormula", id: def.id });
    }

    switch (def.source.kind) {
      case "launchEvent":
        if (def.source.eventNames.length === 0) {
          errors.push({ kind: "emptyLaunchEventList", id: def.id });
        }
        for (const eventName of def.source.eventNames) {
          if (!launchEventNames.has(eventName)) {
            errors.push({
              kind: "unknownEventName",
              id: def.id,
              eventName,
            });
          }
        }
        break;
      case "derivedState":
        if (def.source.tables.length === 0) {
          errors.push({ kind: "emptyTableList", id: def.id });
        }
        break;
      case "external":
        // External sources are opaque — nothing to validate
        // beyond the presence of system + reference (enforced by
        // the TypeScript type).
        break;
      default: {
        // Exhaustiveness guard — typed as `never` so a new source
        // kind added to the union fails compile here.
        const _exhaustive: never = def.source;
        void _exhaustive;
        errors.push({ kind: "missingSource", id: def.id });
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// MARK: - Summary

export interface KpiCatalogSummary {
  total: number;
  byCategory: Record<KpiCategory, number>;
  launchEventBacked: number;
  derivedStateBacked: number;
  externalBacked: number;
}

/**
 * Return a count projection of the catalog. Used by the dashboard
 * header and by the launch runbook to verify coverage.
 */
export function summarizeCatalog(
  catalog: KpiCatalog
): KpiCatalogSummary {
  const byCategory: Record<KpiCategory, number> = {
    product: 0,
    ops: 0,
    broker: 0,
    ai: 0,
  };
  let launchEventBacked = 0;
  let derivedStateBacked = 0;
  let externalBacked = 0;

  for (const def of catalog.definitions) {
    byCategory[def.category]++;
    switch (def.source.kind) {
      case "launchEvent":
        launchEventBacked++;
        break;
      case "derivedState":
        derivedStateBacked++;
        break;
      case "external":
        externalBacked++;
        break;
    }
  }

  return {
    total: catalog.definitions.length,
    byCategory,
    launchEventBacked,
    derivedStateBacked,
    externalBacked,
  };
}

// Re-export catalog for consumers that only want logic.ts
export { KPI_CATALOG } from "./catalog";
