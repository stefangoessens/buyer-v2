import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { computeDelta, formatKpiValue } from "@/lib/admin/kpiFormat";
import type { KpiMetricDef } from "@/lib/admin/kpiCatalog";

export interface KpiMetricValue {
  key: string;
  label: string;
  value: number | null;
  previousValue: number | null;
  source: "snapshot" | "computed" | "unavailable";
}

interface KpiMetricTileProps {
  metric: KpiMetricDef;
  value: KpiMetricValue;
}

/**
 * Single metric tile for the KPI dashboard. Shows current value, delta
 * vs. previous range, and data source (snapshot vs. computed) so ops
 * can tell precomputed rollups from on-demand aggregates.
 */
export function KpiMetricTile({ metric, value }: KpiMetricTileProps) {
  const current = value.value;
  const delta = computeDelta(current, value.previousValue, metric.direction);
  const formatted = formatKpiValue(current, metric.unit);

  return (
    <Card
      className={cn(
        "gap-2 transition-shadow hover:shadow-md",
        value.source === "unavailable" && "border-dashed border-neutral-300",
      )}
    >
      <CardHeader className="pb-0">
        <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {metric.label}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight text-neutral-900">
          {formatted}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-neutral-500">{metric.description}</span>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={cn(
              "font-medium tabular-nums",
              delta.tone === "positive" && "text-success-700",
              delta.tone === "negative" && "text-error-700",
              delta.tone === "neutral" && "text-neutral-500",
            )}
          >
            {delta.direction === "up"
              ? "▲"
              : delta.direction === "down"
                ? "▼"
                : "—"}{" "}
            {delta.text}
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider",
              value.source === "snapshot" && "text-primary-600",
              value.source === "computed" && "text-neutral-400",
              value.source === "unavailable" && "text-error-600",
            )}
          >
            {value.source === "snapshot"
              ? "Snapshot"
              : value.source === "computed"
                ? "Computed"
                : "No data"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
