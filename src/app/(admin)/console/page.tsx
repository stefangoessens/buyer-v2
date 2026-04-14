"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AdminShell, type AdminShellSession } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatConsoleTimestamp, pluralize } from "@/lib/admin/format";

/**
 * Console overview — the home page for brokers and admins. All values
 * come from the `adminShell.getCurrentSession` snapshot so the client
 * never recomputes metrics.
 */
export default function ConsoleOverviewPage() {
  return (
    <AdminShell>
      <ConsoleOverviewContent />
    </AdminShell>
  );
}

function ConsoleOverviewContent() {
  const session = useQuery(api.adminShell.getCurrentSession) as
    | AdminShellSession
    | null
    | undefined;

  const snapshot = session?.snapshot;
  const latestKpi = snapshot?.latestKpiComputedAt
    ? formatConsoleTimestamp(snapshot.latestKpiComputedAt)
    : "No snapshots yet";

  return (
    <>
      <AdminPageHeader
        eyebrow="Overview"
        title={
          session?.user.name
            ? `Welcome back, ${session.user.name.split(" ")[0] ?? "there"}`
            : "Internal console"
        }
        description="At-a-glance look at the queues, KPIs, and tools you own. Dive into any tile below for the full view."
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Open review items"
          value={snapshot ? snapshot.openReviewItems.toLocaleString("en-US") : "—"}
          helper={
            snapshot
              ? snapshot.openReviewItems === 0
                ? "All queues clear"
                : pluralize(snapshot.openReviewItems, "item") + " waiting"
              : "Loading…"
          }
          tone={snapshot && snapshot.openReviewItems > 0 ? "warning" : "default"}
        />
        <AdminMetricCard
          label="Urgent review items"
          value={snapshot ? snapshot.urgentReviewItems.toLocaleString("en-US") : "—"}
          helper={
            snapshot && snapshot.urgentReviewItems === 0
              ? "No urgent escalations"
              : "Needs attention"
          }
          tone={snapshot && snapshot.urgentReviewItems > 0 ? "error" : "default"}
        />
        <AdminMetricCard
          label="Latest KPI snapshot"
          value={latestKpi}
          helper="Backend-computed; no client recompute"
        />
        <AdminMetricCard
          label="Pending overrides"
          value={snapshot ? snapshot.pendingOverrideCount.toLocaleString("en-US") : "—"}
          helper="Manual changes awaiting reversal review"
          tone={snapshot && snapshot.pendingOverrideCount > 0 ? "warning" : "default"}
        />
      </section>

      <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Review queues
          </h2>
          <AdminEmptyState
            title="Review queues land with KIN-798"
            description="This card will show open items across intake, offers, contracts, and escalations with age and priority filters."
          />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Closing deals
          </h2>
          <Link
            href="/console/closing"
            className="block rounded-4xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Closing command center
                </CardDescription>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Active deals board
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every under-contract and closing deal in one view, with
                  stuck-deal signals for blocked, overdue, and stale handoffs.
                </p>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center text-sm font-medium text-primary">
                  Open the board →
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            KPI dashboard
          </h2>
          <AdminEmptyState
            title="KPI tiles land with KIN-800"
            description="Backend-computed funnel metrics, deal room engagement, and conversion rates with a date-range filter."
          />
        </div>
      </section>
    </>
  );
}
