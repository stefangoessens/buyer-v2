"use client";

import { PasteLinkCTA } from "./PasteLinkCTA";
import { ActiveDealsGrid } from "@/components/dashboard/ActiveDealsGrid";
import { MarketDigestSection } from "@/components/dashboard/MarketDigestSection";
import { RecentInsightsFeed } from "@/components/dashboard/RecentInsightsFeed";
import { DashboardNotificationsInbox } from "@/components/dashboard/DashboardNotificationsInbox";

interface BuyerDashboardProps {
  now: string;
}

export function BuyerDashboard({ now }: BuyerDashboardProps) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Welcome back
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Your buyer command center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last updated{" "}
          {new Date(now).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </header>

      <PasteLinkCTA />
      <ActiveDealsGrid />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <MarketDigestSection />
        <DashboardNotificationsInbox />
      </div>

      <RecentInsightsFeed />
    </div>
  );
}
