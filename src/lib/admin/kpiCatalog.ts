/**
 * KPI catalog for the internal dashboard (KIN-800).
 *
 * Every metric the dashboard can render is declared here with its
 * canonical key, label, category, and description. The backend query
 * reads the same list so client and server never drift on metric
 * identity or grouping.
 *
 * Metric values are always computed server-side from the canonical
 * event/state model — this file only holds presentation metadata.
 */

export const KPI_CATEGORIES = [
  "funnel",
  "engagement",
  "ops",
  "ai",
] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

export const KPI_CATEGORY_LABELS: Readonly<Record<KpiCategory, string>> = {
  funnel: "Funnel",
  engagement: "Deal room engagement",
  ops: "Ops throughput",
  ai: "AI engines",
};

export type KpiUnit = "count" | "percent" | "duration_ms" | "currency_usd";

export interface KpiMetricDef {
  /** Stable machine key — matches the `metricKey` column in kpiSnapshots. */
  key: string;
  label: string;
  category: KpiCategory;
  unit: KpiUnit;
  description: string;
  /** Higher-is-better for delta tone in UI. */
  direction: "higher_better" | "lower_better" | "neutral";
}

export const KPI_CATALOG: readonly KpiMetricDef[] = [
  // ─── Funnel ──────────────────────────────────────────────────────────────
  {
    key: "funnel.visits",
    label: "Unique visits",
    category: "funnel",
    unit: "count",
    description: "Distinct anonymous sessions that landed on any public page.",
    direction: "higher_better",
  },
  {
    key: "funnel.paste_link_submissions",
    label: "Paste-a-link submissions",
    category: "funnel",
    unit: "count",
    description: "Number of property URLs pasted into the intake hero.",
    direction: "higher_better",
  },
  {
    key: "funnel.registrations",
    label: "Registrations",
    category: "funnel",
    unit: "count",
    description: "Anonymous visitors who created an account.",
    direction: "higher_better",
  },
  {
    key: "funnel.registration_rate",
    label: "Registration rate",
    category: "funnel",
    unit: "percent",
    description: "Registrations divided by unique visits.",
    direction: "higher_better",
  },

  // ─── Deal room engagement ───────────────────────────────────────────────
  {
    key: "engagement.deal_rooms_created",
    label: "Deal rooms created",
    category: "engagement",
    unit: "count",
    description: "New deal rooms opened in the period.",
    direction: "higher_better",
  },
  {
    key: "engagement.tours_requested",
    label: "Tours requested",
    category: "engagement",
    unit: "count",
    description: "Tour requests submitted by buyers.",
    direction: "higher_better",
  },
  {
    key: "engagement.offers_submitted",
    label: "Offers submitted",
    category: "engagement",
    unit: "count",
    description: "Offers a buyer has actually submitted to a listing side.",
    direction: "higher_better",
  },
  {
    key: "engagement.deal_room_to_offer_rate",
    label: "Deal room → offer rate",
    category: "engagement",
    unit: "percent",
    description: "Deal rooms that reached an offer during the window.",
    direction: "higher_better",
  },

  // ─── Ops throughput ──────────────────────────────────────────────────────
  {
    key: "ops.queue_items_resolved",
    label: "Queue items resolved",
    category: "ops",
    unit: "count",
    description: "Review queue items transitioned to resolved.",
    direction: "higher_better",
  },
  {
    key: "ops.queue_items_opened",
    label: "Queue items opened",
    category: "ops",
    unit: "count",
    description: "New ops review items raised.",
    direction: "neutral",
  },
  {
    key: "ops.avg_queue_resolution_ms",
    label: "Avg resolution time",
    category: "ops",
    unit: "duration_ms",
    description: "Average time between open and resolved for queue items.",
    direction: "lower_better",
  },

  // ─── AI engines ─────────────────────────────────────────────────────────
  {
    key: "ai.engine_outputs_generated",
    label: "AI engine outputs",
    category: "ai",
    unit: "count",
    description: "Total AI engine outputs produced (pricing, comps, leverage, offer).",
    direction: "higher_better",
  },
  {
    key: "ai.engine_review_rate",
    label: "Needs-review rate",
    category: "ai",
    unit: "percent",
    description: "Share of engine outputs flagged for internal review.",
    direction: "lower_better",
  },
];

export const KPI_BY_KEY: Readonly<Record<string, KpiMetricDef>> = Object.freeze(
  Object.fromEntries(KPI_CATALOG.map((m) => [m.key, m])),
);

/** Group the catalog into sections for the dashboard layout. */
export function groupCatalogByCategory(): Array<{
  category: KpiCategory;
  label: string;
  metrics: KpiMetricDef[];
}> {
  return KPI_CATEGORIES.map((category) => ({
    category,
    label: KPI_CATEGORY_LABELS[category],
    metrics: KPI_CATALOG.filter((m) => m.category === category),
  }));
}

/** True if `key` is a declared KPI metric. */
export function isKnownMetricKey(key: string): boolean {
  return key in KPI_BY_KEY;
}
