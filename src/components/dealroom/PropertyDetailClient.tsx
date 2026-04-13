"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PropertyPhotoGallery } from "./PropertyPhotoGallery";
import { PropertyStatsBar } from "./PropertyStatsBar";
import { PropertySkeletonLoader } from "./PropertySkeletonLoader";
import { PropertyInsightsCard } from "./PropertyInsightsCard";

interface PropertyDetailClientProps {
  propertyId: string;
}

const PRICE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

const SOURCE_LABELS: Record<string, string> = {
  zillow: "Zillow",
  redfin: "Redfin",
  realtor: "Realtor.com",
  manual: "manual entry",
};

const DESCRIPTION_LIMIT = 400;

function formatBaths(full?: number, half?: number): string | null {
  if (full == null && half == null) return null;
  const total = (full ?? 0) + (half ?? 0) * 0.5;
  if (total === 0) return null;
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return `${diffMo} month${diffMo === 1 ? "" : "s"} ago`;
  const diffYr = Math.round(diffMo / 12);
  return `${diffYr} year${diffYr === 1 ? "" : "s"} ago`;
}

function formatAddressLine(
  street: string,
  unit: string | undefined,
  city: string,
  state: string,
  zip: string,
  formatted: string | undefined,
): { line1: string; line2: string } {
  if (formatted) {
    const [first, ...rest] = formatted.split(",");
    return {
      line1: first?.trim() ?? street,
      line2: rest.join(",").trim() || `${city}, ${state} ${zip}`,
    };
  }
  return {
    line1: unit ? `${street}, ${unit}` : street,
    line2: `${city}, ${state} ${zip}`,
  };
}

function NotFoundView() {
  return (
    <div className="relative w-full overflow-hidden bg-[#FCFBFF]">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_20%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
      </div>
      <div className="relative mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
          <span className="inline-block size-1.5 rounded-full bg-primary-400" />
          Property not found
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.006em] text-neutral-800 lg:text-4xl">
          We couldn&apos;t find that listing
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-500">
          The property may have been removed, or the link may be broken. Try
          pasting a fresh Zillow, Redfin, or Realtor.com URL on the home page.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
        >
          <svg
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
          Back to home
        </Link>
      </div>
    </div>
  );
}

export function PropertyDetailClient({
  propertyId,
}: PropertyDetailClientProps) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const property = useQuery(api.properties.getPublic, {
    propertyId: propertyId as Id<"properties">,
  });

  if (property === undefined) {
    return <PropertySkeletonLoader />;
  }

  if (property === null) {
    return <NotFoundView />;
  }

  const {
    address,
    listPrice,
    beds,
    bathsFull,
    bathsHalf,
    sqftLiving,
    lotSize,
    yearBuilt,
    description,
    photoUrls,
    sourcePlatform,
    updatedAt,
  } = property;

  const { line1, line2 } = formatAddressLine(
    address.street,
    address.unit,
    address.city,
    address.state,
    address.zip,
    address.formatted,
  );

  const fullAddress = `${line1}, ${line2}`;
  const sourceLabel = SOURCE_LABELS[sourcePlatform] ?? sourcePlatform;
  const priceDisplay = listPrice ? PRICE_FORMATTER.format(listPrice) : null;
  const bathsDisplay = formatBaths(bathsFull, bathsHalf);

  const stats: Array<{ label: string; value: string }> = [];
  if (beds != null) stats.push({ label: "Beds", value: String(beds) });
  if (bathsDisplay) stats.push({ label: "Baths", value: bathsDisplay });
  if (sqftLiving != null)
    stats.push({
      label: "Sqft",
      value: NUMBER_FORMATTER.format(sqftLiving),
    });
  if (yearBuilt != null)
    stats.push({ label: "Year built", value: String(yearBuilt) });
  if (lotSize != null)
    stats.push({
      label: "Lot size",
      value: `${NUMBER_FORMATTER.format(lotSize)} sqft`,
    });

  const hasStats = stats.length > 0;
  const descriptionText = description?.trim() ?? "";
  const needsCollapse = descriptionText.length > DESCRIPTION_LIMIT;
  const visibleDescription =
    needsCollapse && !descriptionExpanded
      ? `${descriptionText.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`
      : descriptionText;

  return (
    <div className="w-full bg-white">
      {/* Hero / Gallery section with gradient */}
      <section className="relative w-full overflow-hidden bg-[#FCFBFF]">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_20%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
        </div>

        <div className="relative mx-auto max-w-[1248px] px-6 py-8 lg:py-12">
          <div className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-primary-700"
            >
              <svg
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              Back to search
            </Link>
          </div>

          <PropertyPhotoGallery
            photoUrls={photoUrls ?? []}
            address={fullAddress}
          />

          {/* Header row */}
          <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              {priceDisplay ? (
                <h1 className="text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.05]">
                  {priceDisplay}
                </h1>
              ) : (
                <h1 className="text-3xl font-semibold tracking-[-0.006em] text-neutral-800 lg:text-4xl">
                  Price unavailable
                </h1>
              )}
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
                <span className="inline-block size-1.5 rounded-full bg-primary-400" />
                Listed on {sourceLabel}
              </div>
            </div>

            <div className="lg:text-right">
              <p className="text-xl font-semibold text-neutral-800">
                {line1}
              </p>
              <p className="mt-1 text-base text-neutral-500">{line2}</p>
            </div>
          </div>

          {/* Stats bar */}
          {hasStats && (
            <div className="mt-8">
              <PropertyStatsBar stats={stats} />
            </div>
          )}
        </div>
      </section>

      {/* AI insights — the hero of the page */}
      <section className="w-full bg-white pt-12 lg:pt-16">
        <div className="mx-auto max-w-[1248px] px-6">
          <PropertyInsightsCard
            variant="public"
            propertyId={propertyId}
          />
        </div>
      </section>

      {/* Description + CTA */}
      <section className="w-full bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
                About this home
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[32px] lg:leading-[1.2]">
                Listing description
              </h2>
              <div className="mt-6 text-[17px] leading-[1.65] text-neutral-600">
                {descriptionText ? (
                  <>
                    <p className="whitespace-pre-line">{visibleDescription}</p>
                    {needsCollapse && (
                      <button
                        type="button"
                        onClick={() =>
                          setDescriptionExpanded((prev) => !prev)
                        }
                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-600"
                      >
                        {descriptionExpanded ? "Show less" : "Show more"}
                        <svg
                          className={cn(
                            "size-4 transition-transform duration-200",
                            descriptionExpanded && "rotate-180",
                          )}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m19.5 8.25-7.5 7.5-7.5-7.5"
                          />
                        </svg>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="italic text-neutral-400">
                    No description available for this listing.
                  </p>
                )}
              </div>
            </div>

            {/* Gated AI CTA — bento-style card */}
            <div className="lg:col-span-5">
              <div className="relative h-full overflow-hidden rounded-[24px] bg-gradient-to-br from-primary-700 to-primary-600 p-8 shadow-lg md:p-10">
                <div
                  className="pointer-events-none absolute inset-0"
                  aria-hidden="true"
                >
                  <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/[0.06] blur-3xl" />
                  <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/[0.05] blur-3xl" />
                </div>

                <div className="relative flex h-full flex-col">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-100 ring-1 ring-white/15 backdrop-blur">
                    <span className="inline-block size-1.5 rounded-full bg-primary-100" />
                    Full deal room
                  </div>
                  <h3 className="mt-5 text-[28px] font-semibold leading-[1.15] tracking-[-0.006em] text-white md:text-[32px]">
                    Unlock every insight + full deal room
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-primary-100/90">
                    Get every premium insight, comparable sales, a leverage
                    score, and a tailored offer strategy — all reviewed by a
                    licensed Florida broker.
                  </p>

                  <ul className="mt-6 space-y-3">
                    {[
                      "Fair-price range and overpay risk",
                      "Comparable sales with feature adjustments",
                      "Leverage signals and timing advantages",
                      "Suggested offer and counter strategy",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-sm text-primary-100/95"
                      >
                        <svg
                          className="mt-0.5 size-4 shrink-0 text-primary-100"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-8">
                    <Link
                      href={`/register?next=/property/${propertyId}`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-50"
                    >
                      Create free account
                      <svg
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                        />
                      </svg>
                    </Link>
                    <p className="mt-3 text-center text-xs text-primary-100/70">
                      Free forever. No credit card required.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer meta */}
      <section className="w-full bg-neutral-50 py-8">
        <div className="mx-auto max-w-[1248px] px-6 text-center text-xs text-neutral-500">
          Data from{" "}
          <span className="font-medium text-neutral-600">{sourceLabel}</span>
          {" · "}Extracted {formatRelativeTime(updatedAt)}
        </div>
      </section>
    </div>
  );
}
