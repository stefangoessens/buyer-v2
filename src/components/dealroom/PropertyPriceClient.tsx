"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { PricingPanelCard } from "./PricingPanelCard";
import { LeverageScoreCard } from "./LeverageScoreCard";
import { CostEstimateCard } from "./CostEstimateCard";

interface PropertyPriceClientProps {
  propertyId: string;
}

export function PropertyPriceClient({ propertyId }: PropertyPriceClientProps) {
  const dealRoomId = useQuery(api.dealRooms.getUserDealRoomForProperty, {
    propertyId: propertyId as Id<"properties">,
  });

  if (dealRoomId === undefined) {
    return <PriceSkeleton />;
  }

  if (dealRoomId === null) {
    return (
      <section className="rounded-3xl border border-dashed border-neutral-200 bg-white p-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Pricing
        </p>
        <h2 className="mt-2 text-lg font-semibold text-neutral-800">
          Start your analysis to unlock pricing
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          The fair-price range, leverage score, and monthly cost estimate live
          inside your private deal room.
        </p>
        <Button asChild className="mt-5">
          <Link href={`/property/${propertyId}/details`}>
            Start your analysis
          </Link>
        </Button>
      </section>
    );
  }

  return <PriceOverview dealRoomId={dealRoomId} />;
}

function PriceOverview({ dealRoomId }: { dealRoomId: Id<"dealRooms"> }) {
  const overview = useQuery(api.dealRoomOverview.getOverview, { dealRoomId });

  if (overview === undefined) {
    return <PriceSkeleton />;
  }

  if (overview === null) {
    return (
      <section className="rounded-3xl border border-neutral-200 bg-white p-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Pricing
        </p>
        <h2 className="mt-2 text-lg font-semibold text-neutral-800">
          Pricing not available
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          We couldn&apos;t load the pricing overview for this deal room.
        </p>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <PricingPanelCard
        status={overview.pricing.status}
        data={overview.pricing.data}
        reason={overview.pricing.reason}
        confidence={overview.pricing.confidence}
      />
      <LeverageScoreCard
        status={overview.leverage.status}
        data={overview.leverage.data}
        reason={overview.leverage.reason}
      />
      <CostEstimateCard
        status={overview.cost.status}
        data={overview.cost.data}
        reason={overview.cost.reason}
      />
    </div>
  );
}

function PriceSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SkeletonCard className="lg:col-span-2" />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <section
      className={`rounded-3xl border border-neutral-200 bg-white p-6 sm:p-8 ${className ?? ""}`}
    >
      <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
      <div className="mt-3 h-6 w-56 animate-pulse rounded-full bg-neutral-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl bg-neutral-100"
          />
        ))}
      </div>
    </section>
  );
}
