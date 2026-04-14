"use client";

import Link from "next/link";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type OfferData = {
  recommendedScenarioName: string;
  recommendedPrice: number;
  competitivenessScore: number;
  scenarioCount: number;
} | null;

interface OfferRecommendationCardProps {
  status: "available" | "pending" | "unavailable";
  data: OfferData;
  reason?: string;
  dealRoomId: Id<"dealRooms">;
  propertyId?: string;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function competitivenessTone(score: number) {
  if (score >= 70) return "bg-emerald-50 text-emerald-700";
  if (score >= 40) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export function OfferRecommendationCard({
  status,
  data,
  reason,
  dealRoomId,
  propertyId,
}: OfferRecommendationCardProps) {
  return (
    <section className="flex flex-col rounded-[24px] border border-border bg-white p-6 transition-shadow hover:shadow-md sm:p-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Offer recommendation
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          Where we&apos;d open negotiations
        </h2>
      </header>

      {status === "available" && data ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {data.recommendedScenarioName}
            </span>
            <span className="text-3xl font-bold text-foreground">
              {currency.format(data.recommendedPrice)}
            </span>
            <p className="mt-1 text-sm text-muted-foreground">
              Balances seller momentum with buyer protections. Based on{" "}
              {data.scenarioCount}{" "}
              {data.scenarioCount === 1 ? "scenario" : "scenarios"} modeled for
              this deal.
            </p>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Competitiveness
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                competitivenessTone(data.competitivenessScore),
              )}
            >
              {Math.round(data.competitivenessScore)} / 100
            </span>
          </div>

          <Link
            href={propertyId ? `/property/${propertyId}/offer` : `/dealroom/${dealRoomId}/offer`}
            className="mt-auto inline-flex w-fit items-center justify-center gap-2 rounded-full bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600"
          >
            Open offer cockpit
            <span aria-hidden>→</span>
          </Link>
        </>
      ) : (
        <OfferEmptyState status={status} reason={reason} />
      )}
    </section>
  );
}

function OfferEmptyState({
  status,
  reason,
}: {
  status: "pending" | "unavailable" | "available";
  reason?: string;
}) {
  const label =
    status === "pending" ? "Modeling scenarios" : "Scenarios not ready";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-muted p-6 text-center">
      <p className="text-sm font-semibold text-neutral-700">{label}</p>
      <p className="text-xs text-muted-foreground">
        {reason ?? "The offer engine will recommend scenarios once pricing and leverage land."}
      </p>
    </div>
  );
}
