"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { PriceSpectrumBar } from "./PriceSpectrumBar";
import { PricingPanelCard } from "./PricingPanelCard";
import {
  LeverageScoreCard,
  type LeverageSignal,
} from "./LeverageScoreCard";
import { CostEstimateCard } from "./CostEstimateCard";
import { PreApprovalCtaCard } from "./PreApprovalCtaCard";
import { NextStepFooter } from "./NextStepFooter";

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

  return <PriceOverview dealRoomId={dealRoomId} propertyId={propertyId} />;
}

function PriceOverview({
  dealRoomId,
  propertyId,
}: {
  dealRoomId: Id<"dealRooms">;
  propertyId: string;
}) {
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

  const pricingData = overview.pricing.data;
  const leverageData = overview.leverage.data;

  // Map pricing engine output to the spectrum bar's anchor props.
  // The pricing engine doesn't currently expose an explicit listingPrice — we
  // use consensusEstimate as a proxy (it blends portal estimates with comps,
  // which is the closest thing to "what the seller is asking"). Portal AVMs
  // (Zestimate, Redfin Estimate) come from the property record via
  // dealRoomOverview; lowestPossible is still TBD.
  const showSpectrum =
    pricingData !== null &&
    Number.isFinite(pricingData.fairValue) &&
    Number.isFinite(pricingData.consensusEstimate);

  // Build placeholder LeverageSignal[] from the engine's topSignals so the
  // expanded card has source/confidence metadata to render. Until we plumb
  // real source attribution through the engine, everything is "ai" with the
  // engine's overall confidence.
  const leverageSignals: LeverageSignal[] | undefined = leverageData
    ? leverageData.topSignals.map((signal) => ({
        label: signal.name,
        delta: signal.delta,
        source: "ai" as const,
        confidence: leverageData.overallConfidence,
      }))
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      {showSpectrum && pricingData ? (
        <section className="rounded-[24px] border border-neutral-200 bg-white p-6 sm:p-8">
          <header className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
              Price spectrum
            </p>
            <h2 className="mt-1 text-lg font-semibold text-neutral-800">
              Where every anchor sits on the price line
            </h2>
          </header>
          <PriceSpectrumBar
            fairPrice={pricingData.fairValue}
            zestimate={pricingData.zestimate}
            redfinEstimate={pricingData.redfinEstimate}
            listingPrice={pricingData.consensusEstimate}
            walkAway={pricingData.walkAway}
            strongOpener={pricingData.strongOpener}
            confidence={pricingData.overallConfidence}
          />
        </section>
      ) : null}

      <LeverageScoreCard
        status={overview.leverage.status}
        data={overview.leverage.data}
        reason={overview.leverage.reason}
        signals={leverageSignals}
      />

      <PricingPanelCard
        status={overview.pricing.status}
        data={overview.pricing.data}
        reason={overview.pricing.reason}
        confidence={overview.pricing.confidence}
      />

      <CostEstimateCard
        status={overview.cost.status}
        data={overview.cost.data}
        reason={overview.cost.reason}
        enableCustomize={true}
      />

      <PreApprovalCtaCard />

      <NextStepFooter
        href={`/property/${propertyId}/disclosures`}
        label="Review disclosures"
        description="See seller disclosures, inspection report, and Florida-specific risk signals."
      />
    </div>
  );
}

function PriceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonCard />
      <SkeletonCard />
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
