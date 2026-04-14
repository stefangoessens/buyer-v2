"use client";

import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Client-only wrapper for BuyerDashboard. The inner component uses
 * `useQuery` from convex/react which requires a ConvexProvider in the
 * tree. In CI builds (and any environment without NEXT_PUBLIC_CONVEX_URL)
 * the provider isn't mounted, so we disable SSR entirely and render a
 * deterministic placeholder until the browser hydrates.
 */
const BuyerDashboardInner = dynamic(
  () => import("./BuyerDashboard").then((m) => m.BuyerDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Welcome back
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Buyer Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up where you left off or analyze a new listing.
          </p>
        </header>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading your searches…
          </CardContent>
        </Card>
      </div>
    ),
  },
);

interface BuyerDashboardClientProps {
  now: string;
}

export function BuyerDashboardClient({ now }: BuyerDashboardClientProps) {
  return <BuyerDashboardInner now={now} />;
}
