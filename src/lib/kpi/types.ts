/**
 * Typed KPI catalog (KIN-861 phase 1).
 *
 * This is the data-layer foundation for the product/ops/broker/AI
 * KPI dashboards. Every KPI the business cares about at launch is
 * declared here with:
 *   - a stable id (referenced by dashboards and runbooks)
 *   - a human label + description
 *   - a category (product / ops / broker / ai)
 *   - a formula in both plain-english and symbolic form
 *   - a list of source events from the launch event contract
 *     (KIN-845) — or "derivedState" / "external" for KPIs that
 *     don't bottom out at events
 *   - a refresh cadence hint (realtime / hourly / daily / weekly)
 *   - a presentation hint (percentage / count / duration / currency)
 *
 * The UI dashboards (follow-up card, design-reviewed) read from
 * this catalog so dashboards never re-define KPIs inline. When a
 * new event lands in the launch contract, the affected KPIs are
 * updated here in one place.
 *
 * Intentionally NOT included in this phase:
 *   - Dashboard UI render components (needs design review)
 *   - PostHog dashboard wiring (per-deployment config)
 *   - Aggregation SQL / Convex queries (wired per-KPI by the
 *     dashboard implementation)
 */

// MARK: - Categories

/**
 * KPI category — product/funnel, ops/fulfillment, broker/commercial,
 * and AI engine observability. Every KPI belongs to exactly one.
 */
export type KpiCategory = "product" | "ops" | "broker" | "ai";

// MARK: - Presentation

/**
 * How the value should render on the dashboard. Dashboards use
 * this to pick the right formatter (percentage with 1 decimal,
 * count as integer, duration as "4h 12m", currency with commas).
 */
export type KpiPresentation =
  | "percentage"
  | "count"
  | "duration_ms"
  | "duration_hours"
  | "duration_days"
  | "currency_usd"
  | "ratio"
  | "score";

// MARK: - Cadence

/**
 * How often the dashboard should refresh the KPI. Dashboards
 * respect this when deciding polling frequency; realtime implies
 * a live subscription; weekly means the value only moves in
 * weekly rollups.
 */
export type KpiCadence = "realtime" | "hourly" | "daily" | "weekly";

// MARK: - Source

/**
 * Where the KPI data comes from. The discriminated union forces
 * the catalog to be explicit about provenance:
 *
 * - `launchEvent`    — computed by counting / grouping one or
 *                      more events from the KIN-845 launch event
 *                      contract. `eventNames` are the canonical
 *                      event names.
 * - `derivedState`   — computed from a Convex table projection
 *                      (e.g. dealRoom statuses, fileFact counts).
 * - `external`       — from a third-party system we don't own
 *                      (PostHog funnels, Sentry, Railway). The
 *                      KPI is documented here for completeness
 *                      but the compute layer doesn't touch it.
 */
export type KpiSource =
  | {
      kind: "launchEvent";
      eventNames: readonly string[];
      /**
       * Plain-english note describing how the events combine
       * into the KPI value (e.g. "count of deal_room_entered /
       * count of teaser_viewed").
       */
      combiner: string;
    }
  | {
      kind: "derivedState";
      /**
       * Convex table(s) the KPI reads from.
       */
      tables: readonly string[];
      combiner: string;
    }
  | {
      kind: "external";
      system: string;
      reference: string;
    };

// MARK: - Definition

/**
 * A single KPI entry. Every dashboard that renders this KPI
 * reads the entry directly; nothing is re-defined inline.
 */
export interface KpiDefinition {
  /** Stable id, namespaced by category. */
  id: string;
  category: KpiCategory;
  label: string;
  description: string;
  /**
   * Plain-english formula — what the KPI means in a sentence
   * a non-engineer can understand.
   */
  formulaEnglish: string;
  /**
   * Symbolic formula using event names from the launch contract
   * or table-derived quantities. Readers cross-reference this
   * against `source` to find the exact event ids.
   */
  formulaSymbolic: string;
  source: KpiSource;
  cadence: KpiCadence;
  presentation: KpiPresentation;
  /** Business owner — which team watches the KPI. */
  owner: "growth" | "ops" | "brokerage" | "ai" | "platform";
  /**
   * Catalog version the KPI was introduced in. Allows a future
   * validator to tell which KPIs a given dashboard build expects.
   */
  introducedIn: string;
}

// MARK: - Catalog

export interface KpiCatalog {
  version: string;
  /** ISO-8601 date of the last edit. */
  lastUpdated: string;
  definitions: readonly KpiDefinition[];
}

// MARK: - Validation

/**
 * Discriminated errors returned by `validateKpiCatalog`. Keeps the
 * same shape as the other catalog validators in the codebase so
 * dashboards can branch on error kind.
 */
export type KpiValidationError =
  | { kind: "duplicateId"; id: string }
  | { kind: "invalidId"; id: string }
  | { kind: "missingFormula"; id: string }
  | { kind: "missingSource"; id: string }
  | {
      kind: "emptyLaunchEventList";
      id: string;
    }
  | {
      kind: "emptyTableList";
      id: string;
    }
  | {
      kind: "unknownEventName";
      id: string;
      eventName: string;
    }
  | {
      kind: "unknownTableName";
      id: string;
      tableName: string;
    };

export type KpiValidation =
  | { ok: true }
  | { ok: false; errors: KpiValidationError[] };
