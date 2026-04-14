"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface CompsSummaryCardProps {
  propertyId: Id<"properties">;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const psf = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type CompResult = {
  candidate: {
    canonicalId: string;
    address: string;
    soldPrice: number;
    sqft: number;
  };
};

type CompsOutput = {
  comps: CompResult[];
  aggregates: {
    medianSoldPrice: number;
    medianPricePerSqft: number;
    medianDom: number;
    medianSaleToListRatio: number;
  };
  totalCandidates: number;
};

function parseCompsDoc(doc: unknown): {
  status: "available" | "pending" | "unavailable";
  data: CompsOutput | null;
} {
  if (!doc || typeof doc !== "object") {
    return { status: "unavailable", data: null };
  }
  const record = doc as {
    output?: string;
    reviewState?: "pending" | "approved" | "rejected";
  };
  // Render pending outputs — reviewState stays in DB for broker queue.
  if (record.reviewState === "rejected" || !record.output) {
    return { status: "unavailable", data: null };
  }
  try {
    const parsed = JSON.parse(record.output) as CompsOutput;
    if (!parsed || !Array.isArray(parsed.comps) || !parsed.aggregates) {
      return { status: "unavailable", data: null };
    }
    return { status: "available", data: parsed };
  } catch {
    return { status: "unavailable", data: null };
  }
}

export function CompsSummaryCard({ propertyId }: CompsSummaryCardProps) {
  const doc = useQuery(api.aiEngineOutputs.getLatest, {
    propertyId,
    engineType: "comps",
  });

  if (doc === undefined) {
    return (
      <section className="rounded-[24px] border border-border bg-white p-6 sm:p-8">
        <div className="h-5 w-40 animate-pulse rounded-full bg-neutral-200" />
        <div className="mt-4 h-10 w-48 animate-pulse rounded-xl bg-neutral-200" />
        <div className="mt-5 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
        </div>
      </section>
    );
  }

  const { status, data } = parseCompsDoc(doc);

  return (
    <section className="rounded-[24px] border border-border bg-white p-6 transition-shadow hover:shadow-md sm:p-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Comparable sales
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          What similar homes closed for
        </h2>
      </header>

      {status === "available" && data ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {data.comps.length} comparable{" "}
              {data.comps.length === 1 ? "sale" : "sales"} found
            </span>
            <span className="text-3xl font-bold text-foreground">
              {psf.format(data.aggregates.medianPricePerSqft)}
              <span className="ml-1 text-base font-medium text-muted-foreground">
                / sqft
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              Median sold price{" "}
              {currency.format(data.aggregates.medianSoldPrice)}
            </span>
          </div>

          <ul className="mt-5 space-y-3 border-t border-neutral-100 pt-4">
            {data.comps.slice(0, 3).map((comp) => {
              const compPsf =
                comp.candidate.sqft > 0
                  ? comp.candidate.soldPrice / comp.candidate.sqft
                  : 0;
              return (
                <li
                  key={comp.candidate.canonicalId}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="truncate font-medium text-neutral-700">
                    {comp.candidate.address}
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-semibold text-foreground">
                      {currency.format(comp.candidate.soldPrice)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {compPsf > 0 ? `${psf.format(compPsf)}/sqft` : "—"}
                    </span>
                  </span>
                </li>
              );
            })}
            {data.comps.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                No comparable sales yet.
              </li>
            ) : null}
          </ul>

          <a
            href="#comps"
            className="mt-5 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            View all comps →
          </a>
        </>
      ) : (
        <CompsEmptyState status={status} />
      )}
    </section>
  );
}

function CompsEmptyState({
  status,
}: {
  status: "pending" | "unavailable" | "available";
}) {
  const label =
    status === "pending" ? "Gathering comps" : "No comps available yet";
  const body =
    status === "pending"
      ? "We're pulling recent sales in the neighborhood. Check back shortly."
      : "Comparable sales will appear once we match subdivision or ZIP-level sold listings.";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-muted p-6 text-center">
      <p className="text-sm font-semibold text-neutral-700">{label}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
