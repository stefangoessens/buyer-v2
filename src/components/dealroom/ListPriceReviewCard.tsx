"use client";

import { useEffect, useId, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ListPriceReviewCardProps {
  dealRoomId: Id<"dealRooms">;
  className?: string;
}

type Assessment =
  | "at_market"
  | "under_market"
  | "over_market"
  | "insufficient";

type ReferenceKind =
  | "suggested_list_price"
  | "avm_estimate"
  | "comp_median"
  | "market_velocity_dom";

interface PriceReferenceTile {
  kind: ReferenceKind;
  value: number | null;
  provenance: string;
  sourceCount?: number;
  isAvailable: boolean;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const TILE_LABELS: Record<ReferenceKind, string> = {
  suggested_list_price: "Suggested list price",
  avm_estimate: "AVM estimate",
  comp_median: "Comp median",
  market_velocity_dom: "Market velocity",
};

const ASSESSMENT_LABELS: Record<Assessment, string> = {
  at_market: "At market",
  under_market: "Under market",
  over_market: "Over market",
  insufficient: "Insufficient pricing context",
};

const ASSESSMENT_CHIP_CLASSES: Record<Assessment, string> = {
  at_market: "bg-primary/10 text-primary border-primary/20",
  under_market: "bg-emerald-50 text-emerald-800 border-emerald-200",
  over_market: "bg-amber-50 text-amber-800 border-amber-200",
  insufficient: "bg-muted text-muted-foreground border-border",
};

function formatTileValue(tile: PriceReferenceTile): string {
  if (!tile.isAvailable || tile.value === null) {
    return "Not available yet";
  }
  if (tile.kind === "market_velocity_dom") {
    return `${tile.value} DOM`;
  }
  return currency.format(tile.value);
}

export function ListPriceReviewCard({
  dealRoomId,
  className,
}: ListPriceReviewCardProps) {
  const data = useQuery(api.propertyPricingReview.getListPriceReview, {
    dealRoomId,
  });
  const titleId = useId();
  const trackedRef = useRef(false);

  useEffect(() => {
    if (data === undefined || data === null) return;
    if (trackedRef.current) return;
    trackedRef.current = true;
    track("list_price_review_viewed", { assessment: data.assessment });
    track("list_price_review_assessment_rendered", {
      assessment: data.assessment,
      referencesAvailable: data.referencesAvailable,
      signalsAgreed: data.signalsAgreed,
    });
  }, [data]);

  if (data === undefined) {
    return <ListPriceReviewSkeleton className={className} />;
  }

  if (data === null) {
    return (
      <section
        className={cn(
          "rounded-4xl border border-border bg-card p-6 text-center sm:p-8",
          className,
        )}
        aria-label="List price review"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          List price review
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          List price review unavailable for this property
        </p>
      </section>
    );
  }

  const assessment = data.assessment as Assessment;
  const tiles: PriceReferenceTile[] = [
    data.tiles.suggestedListPrice,
    data.tiles.avmEstimate,
    data.tiles.compMedian,
    data.tiles.marketVelocityDom,
  ];
  const chipTooltip =
    assessment === "insufficient"
      ? "Not enough pricing references (need at least 2)"
      : `${data.signalsAgreed} of ${data.totalSignals} signals agree`;
  const announcedAssessment =
    assessment === "insufficient"
      ? `Assessment: ${ASSESSMENT_LABELS[assessment]}.`
      : `Assessment: ${ASSESSMENT_LABELS[assessment]}. ${data.signalsAgreed} of ${data.totalSignals} signals agree.`;

  return (
    <TooltipProvider>
      <section
        className={cn(
          "rounded-4xl border border-border bg-card p-6 text-card-foreground sm:p-8",
          className,
        )}
        aria-labelledby={titleId}
      >
        <header className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            List price review
          </p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2
              id={titleId}
              className="font-heading text-xl font-semibold text-foreground sm:text-2xl"
            >
              Is this priced right?
            </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="status"
                  aria-live="polite"
                  aria-label={announcedAssessment}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ASSESSMENT_CHIP_CLASSES[assessment],
                  )}
                  tabIndex={0}
                >
                  {ASSESSMENT_LABELS[assessment]}
                </span>
              </TooltipTrigger>
              <TooltipContent>{chipTooltip}</TooltipContent>
            </Tooltip>
          </div>
          {data.explainer ? (
            <p className="text-sm text-muted-foreground">{data.explainer}</p>
          ) : null}
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {tiles.map((tile) => (
            <ReferenceTile key={tile.kind} tile={tile} />
          ))}
        </div>
      </section>
    </TooltipProvider>
  );
}

function ReferenceTile({ tile }: { tile: PriceReferenceTile }) {
  const label = TILE_LABELS[tile.kind];
  const formatted = formatTileValue(tile);
  const ariaLabel = `${label}: ${formatted} from ${tile.provenance}`;
  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    track("list_price_review_reference_tooltip_opened", { referenceKey: tile.kind });
  };

  return (
    <Tooltip onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          role="group"
          aria-label={ariaLabel}
          className="flex flex-col gap-1 rounded-3xl border border-border bg-muted/40 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              "text-lg font-semibold",
              tile.isAvailable ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {formatted}
          </span>
          <span className="text-xs text-muted-foreground">
            {tile.provenance}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tile.provenance}</TooltipContent>
    </Tooltip>
  );
}

function ListPriceReviewSkeleton({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "rounded-4xl border border-border bg-card p-6 sm:p-8",
        className,
      )}
      aria-label="List price review loading"
    >
      <div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
      <div className="mt-3 h-7 w-56 animate-pulse rounded-full bg-muted" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-3xl bg-muted/40"
          />
        ))}
      </div>
    </section>
  );
}
