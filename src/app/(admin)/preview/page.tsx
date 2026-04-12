"use client";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  STATIC_NAV_ITEMS,
  filterNavItemsForRole,
  type NavItem,
} from "@/lib/admin/nav";
import { formatConsoleTimestamp, pluralize } from "@/lib/admin/format";

/**
 * Dev-only preview route for the internal console shell. Renders the
 * full shell with mocked session data so designers and reviewers can
 * see it without a live Convex backend. This route bypasses the
 * AdminShell wrapper entirely — it imports the primitives directly so
 * it can render with static mock data.
 */
export default function AdminShellPreviewPage() {
  const navItems = filterNavItemsForRole(STATIC_NAV_ITEMS, "admin") as NavItem[];
  const snapshot = {
    openReviewItems: 14,
    urgentReviewItems: 2,
    latestKpiComputedAt: "2026-04-12T21:00:00Z",
    pendingOverrideCount: 3,
  };
  // Non-identifying placeholders. This route is a bundled client page
  // any visitor can hit, so it must never leak real staff names or
  // emails. Keep these synthetic.
  const user = {
    name: "Ops Preview",
    email: "preview@example.test",
    role: "admin" as const,
  };

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <AdminSidebar
        navItems={navItems}
        pathname="/console"
        role={user.role}
        openReviewItems={snapshot.openReviewItems}
        urgentReviewItems={snapshot.urgentReviewItems}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar user={user} snapshot={snapshot} />
        <main className="flex-1 min-w-0 px-8 py-8">
          <AdminPageHeader
            eyebrow="Preview"
            title="Internal console shell preview"
            description="Dev-only mock render of the admin shell. Wire to the live Convex query via /console in production."
          />
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard
              label="Open review items"
              value={snapshot.openReviewItems.toLocaleString("en-US")}
              helper={pluralize(snapshot.openReviewItems, "item") + " waiting"}
              tone="warning"
            />
            <AdminMetricCard
              label="Urgent review items"
              value={snapshot.urgentReviewItems.toLocaleString("en-US")}
              helper="Needs attention"
              tone="error"
            />
            <AdminMetricCard
              label="Latest KPI snapshot"
              value={formatConsoleTimestamp(snapshot.latestKpiComputedAt)}
              helper="Backend-computed"
            />
            <AdminMetricCard
              label="Pending overrides"
              value={snapshot.pendingOverrideCount.toLocaleString("en-US")}
              helper="Manual changes awaiting reversal review"
              tone="warning"
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
                KPI dashboard
              </h2>
              <AdminEmptyState
                title="KPI tiles land with KIN-800"
                description="Backend-computed funnel metrics, deal room engagement, and conversion rates with a date-range filter."
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
