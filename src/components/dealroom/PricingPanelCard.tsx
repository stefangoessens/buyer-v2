"use client";

import { cn } from "@/lib/utils";

type PricingData = {
  fairValue: number;
  likelyAccepted: number;
  strongOpener: number;
  walkAway: number;
  overallConfidence: number;
  consensusEstimate: number;
} | null;

interface PricingPanelCardProps {
  status: "available" | "pending" | "unavailable";
  data: PricingData;
  reason?: string;
  confidence?: number;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function percent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function deltaTone(delta: number): string {
  if (delta > 0.005) return "text-emerald-600";
  if (delta < -0.005) return "text-rose-600";
  return "text-neutral-500";
}

interface PricePillProps {
  label: string;
  value: number;
  consensus: number;
  accent?: "primary" | "neutral";
}

function PricePill({ label, value, consensus, accent = "neutral" }: PricePillProps) {
  const delta = consensus > 0 ? (value - consensus) / consensus : 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border p-5",
        accent === "primary"
          ? "border-primary-200 bg-primary-50/40"
          : "border-neutral-200 bg-neutral-50",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <span className="text-2xl font-bold text-neutral-900">
        {currency.format(value)}
      </span>
      <span className={cn("text-xs font-semibold", deltaTone(delta))}>
        {percent(delta)} vs market
      </span>
    </div>
  );
}

export function PricingPanelCard({
  status,
  data,
  reason,
}: PricingPanelCardProps) {
  return (
    <section className="col-span-1 rounded-[24px] border border-neutral-200 bg-white p-8 transition-shadow hover:shadow-md lg:col-span-2">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
            Pricing panel
          </p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-800">
            Where this price sits in the market
          </h2>
        </div>
        {status === "available" && data ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-neutral-400">
              Consensus
            </p>
            <p className="text-sm font-semibold text-neutral-700">
              {currency.format(data.consensusEstimate)}
            </p>
          </div>
        ) : null}
      </header>

      {status === "available" && data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PricePill
            label="Fair value"
            value={data.fairValue}
            consensus={data.consensusEstimate}
            accent="primary"
          />
          <PricePill
            label="Likely accepted"
            value={data.likelyAccepted}
            consensus={data.consensusEstimate}
          />
          <PricePill
            label="Strong opener"
            value={data.strongOpener}
            consensus={data.consensusEstimate}
          />
          <PricePill
            label="Walk away"
            value={data.walkAway}
            consensus={data.consensusEstimate}
          />
        </div>
      ) : (
        <EmptyPricingState status={status} reason={reason} />
      )}

      {status === "available" && data ? (
        <p className="mt-6 text-xs text-neutral-500">
          Confidence {Math.round(data.overallConfidence * 100)}% — blended from
          portal estimates and recent comparables.
        </p>
      ) : null}
    </section>
  );
}

function EmptyPricingState({
  status,
  reason,
}: {
  status: "pending" | "unavailable" | "available";
  reason?: string;
}) {
  const label =
    status === "pending" ? "Analysis in progress" : "Pricing not available yet";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
      <p className="text-sm font-semibold text-neutral-700">{label}</p>
      <p className="text-xs text-neutral-500">
        {reason ??
          "We'll fill in the pricing picture as soon as the engine finishes."}
      </p>
    </div>
  );
}
