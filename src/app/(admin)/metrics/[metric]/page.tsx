"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { KPI_BY_KEY, isKnownMetricKey } from "@/lib/admin/kpiCatalog";

/**
 * Single-metric detail route. Full trend charts + bucket selection are
 * scoped out to KIN-861; this route renders the metric header so the
 * /metrics/[metric] slot exists and resolves correctly from dashboard
 * deep links.
 */
export default function MetricDetailPage({
  params,
}: {
  params: Promise<{ metric: string }>;
}) {
  const { metric } = use(params);
  if (!isKnownMetricKey(metric)) notFound();
  const def = KPI_BY_KEY[metric]!;

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Metric"
        title={def.label}
        description={def.description}
      />
      <AdminEmptyState
        title="Detail view scoped to KIN-861"
        description="KIN-861 adds the trend chart, bucket selector, and drill-through for each metric."
      />
    </AdminShell>
  );
}
