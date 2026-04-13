"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { resolveBuyerDashboardState } from "@/lib/dashboard/deal-index-state";
import { cn } from "@/lib/utils";
import { DealRoomGrid } from "./DealRoomGrid";
import { EmptyDashboardState } from "./EmptyDashboardState";
import { PasteLinkCTA } from "./PasteLinkCTA";

interface BuyerDashboardProps {
  now: string;
}

export function BuyerDashboard({ now }: BuyerDashboardProps) {
  const dealIndex = useQuery(api.dashboard.getDealIndex, {});
  const state = resolveBuyerDashboardState(dealIndex);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Welcome back
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Buyer Dashboard
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pick up where you left off or analyze a new listing.
        </p>
      </header>

      <PasteLinkCTA />

      {state.kind !== "loading" && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {state.summaryBadges.map((badge) => (
            <Card
              key={badge.kind}
              className={cn(
                "border-neutral-200 bg-white",
                badge.tone === "primary" && "border-primary-200 bg-primary-50/40",
                badge.tone === "warning" && "border-warning-200 bg-warning-50/60",
              )}
            >
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  {badge.label}
                </p>
                <p
                  className={cn(
                    "mt-1 text-lg font-semibold text-neutral-900",
                    badge.isEmpty && "text-neutral-500",
                  )}
                >
                  {badge.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-neutral-900">Your deals</h2>
          {state.kind === "ready" && (
            <span className="text-xs text-neutral-500">
              {state.activeDeals.length} active · {state.recentDeals.length} recent
              {state.hasPartialDeals ? " · details still loading" : ""}
            </span>
          )}
        </div>

        {state.kind === "loading" ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-neutral-500">
              Loading your deals…
            </CardContent>
          </Card>
        ) : state.kind === "empty" ? (
          <EmptyDashboardState />
        ) : (
          <div className="flex flex-col gap-6">
            {state.activeDeals.length > 0 && (
              <DealRoomGrid rows={state.activeDeals} now={now} />
            )}
            {state.recentDeals.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-neutral-600">
                  Recently wrapped up
                </h3>
                <DealRoomGrid rows={state.recentDeals} now={now} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
