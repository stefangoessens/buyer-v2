import type { KpiUnit } from "./kpiCatalog";

/**
 * Presentation helpers for KPI values. The backend always returns a
 * numeric `value` field — these helpers turn it into user-facing text.
 */

/** Format a raw KPI value based on its unit. */
export function formatKpiValue(value: number | null | undefined, unit: KpiUnit): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (unit) {
    case "count":
      return new Intl.NumberFormat("en-US").format(value);
    case "percent":
      return `${(value * 100).toLocaleString("en-US", {
        maximumFractionDigits: 1,
      })}%`;
    case "duration_ms":
      return formatDuration(value);
    case "currency_usd":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

/**
 * Compute a delta between current and previous values and classify it
 * relative to the metric's `direction`. `current` or `previous` may be
 * missing → returns a flat/neutral delta.
 */
export interface KpiDelta {
  rawDelta: number;
  percentDelta: number | null;
  direction: "up" | "down" | "flat";
  tone: "positive" | "negative" | "neutral";
  text: string;
}

export function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  metricDirection: "higher_better" | "lower_better" | "neutral",
): KpiDelta {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return {
      rawDelta: 0,
      percentDelta: null,
      direction: "flat",
      tone: "neutral",
      text: "—",
    };
  }
  const rawDelta = current - previous;
  let percentDelta: number | null = null;
  if (previous !== 0) percentDelta = rawDelta / Math.abs(previous);
  const direction: KpiDelta["direction"] =
    rawDelta > 0 ? "up" : rawDelta < 0 ? "down" : "flat";

  let tone: KpiDelta["tone"] = "neutral";
  if (metricDirection === "higher_better") {
    tone = direction === "up" ? "positive" : direction === "down" ? "negative" : "neutral";
  } else if (metricDirection === "lower_better") {
    tone = direction === "down" ? "positive" : direction === "up" ? "negative" : "neutral";
  }

  const text = percentDelta === null
    ? direction === "flat"
      ? "no change"
      : `${rawDelta > 0 ? "+" : ""}${rawDelta}`
    : `${percentDelta > 0 ? "+" : ""}${(percentDelta * 100).toFixed(1)}%`;

  return { rawDelta, percentDelta, direction, tone, text };
}
