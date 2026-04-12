import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

export const metadata = { title: "KPI dashboard" };

/**
 * KPI dashboard landing route. KIN-800 owns the actual tiles, filters,
 * and backend aggregation. The shell routes it here and provides the
 * layout chrome.
 */
export default function MetricsIndexPage() {
  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Metrics"
        title="KPI dashboard"
        description="Backend-computed funnel KPIs, deal room engagement, and conversion metrics. The range filter is added in KIN-800."
      />
      <AdminEmptyState
        title="No KPI snapshots yet"
        description="KIN-800 replaces this with the full backend-aggregated dashboard. Values will come from the kpiSnapshots table."
      />
    </AdminShell>
  );
}
