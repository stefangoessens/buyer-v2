import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

/**
 * Single-metric detail route. KIN-800 owns the chart rendering and
 * bucket selection. This card just proves the detail route slot exists.
 */
export default async function MetricDetailPage({
  params,
}: {
  params: Promise<{ metric: string }>;
}) {
  const { metric } = await params;
  const label = metric.replace(/[-_]/g, " ");
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Metric"
        title={label.replace(/\b\w/g, (c) => c.toUpperCase())}
        description="Metric detail view. KIN-800 fills this with the trend chart and bucket selector."
      />
      <AdminEmptyState
        title="No snapshots yet"
        description="The detail view needs at least one kpiSnapshot row for this metric key."
      />
    </AdminShell>
  );
}
