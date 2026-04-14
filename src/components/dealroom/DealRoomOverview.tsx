"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PricingPanelCard } from "./PricingPanelCard";
import { CompsSummaryCard } from "./CompsSummaryCard";
import { LeverageScoreCard } from "./LeverageScoreCard";
import { OfferRecommendationCard } from "./OfferRecommendationCard";
import { CostEstimateCard } from "./CostEstimateCard";
import { PropertyInsightsCard } from "./PropertyInsightsCard";

interface DealRoomOverviewProps {
  dealRoomId: Id<"dealRooms">;
}

export function DealRoomOverview({ dealRoomId }: DealRoomOverviewProps) {
  const overview = useQuery(api.dealRoomOverview.getOverview, { dealRoomId });

  if (overview === undefined) {
    return <OverviewSkeleton />;
  }

  if (overview === null) {
    return (
      <section className="rounded-[24px] border border-neutral-200 bg-white p-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Overview
        </p>
        <h2 className="mt-2 text-lg font-semibold text-neutral-800">
          Overview not available
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          We couldn&apos;t load the overview for this deal room. It may have been
          withdrawn or you may not have access.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <PropertyInsightsCard
          variant="registered"
          dealRoomId={dealRoomId}
        />
      </div>

      <PricingPanelCard
        status={overview.pricing.status}
        data={overview.pricing.data}
        reason={overview.pricing.reason}
        confidence={overview.pricing.confidence}
      />

      <CompsSummaryCard
        propertyId={overview.propertyId as Id<"properties">}
      />

      <LeverageScoreCard
        status={overview.leverage.status}
        data={overview.leverage.data}
        reason={overview.leverage.reason}
      />

      <OfferRecommendationCard
        status={overview.offer.status}
        data={overview.offer.data}
        reason={overview.offer.reason}
        dealRoomId={dealRoomId}
      />

      <CostEstimateCard
        status={overview.cost.status}
        data={overview.cost.data}
        reason={overview.cost.reason}
      />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SkeletonCard tall className="lg:col-span-2" />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

function SkeletonCard({
  tall,
  className,
}: {
  tall?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[24px] border border-neutral-200 bg-white p-6 sm:p-8 ${className ?? ""}`}
    >
      <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
      <div className="mt-3 h-6 w-56 animate-pulse rounded-full bg-neutral-200" />
      <div
        className={`mt-6 grid gap-3 ${tall ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}
      >
        {Array.from({ length: tall ? 4 : 3 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl bg-neutral-100"
          />
        ))}
      </div>
    </section>
  );
}
