"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trackJourneyEvent } from "@/lib/analytics/journey-events";

const SEVERITY_PILL_CLASSES: Record<
  "info" | "warning" | "error",
  string
> = {
  info: "bg-primary/10 text-primary ring-primary/20",
  warning:
    "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  error: "bg-destructive/10 text-destructive ring-destructive/20",
};

type JourneyTeaser = {
  dealRoomId: string;
  propertyId: string;
  address: string;
  cityState: string;
  photoUrl: string | null;
  buyerFacingStatusLabel: string;
  stepLabel: string;
  percentComplete: number;
  nextActionLabel: string;
  nextActionHref: string;
  nextActionSeverity: "info" | "warning" | "error";
};

const TEASER_LIMIT = 3;

export function ActiveDealsGrid() {
  const journeys = useQuery(api.dashboard.getJourneys, { view: "active" });

  if (journeys === undefined) {
    return (
      <Card className="py-16 text-center text-sm text-muted-foreground">
        Loading journeys…
      </Card>
    );
  }

  if (journeys.length === 0) {
    return null;
  }

  const topJourneys = journeys.slice(0, TEASER_LIMIT);
  const hasMore = journeys.length > TEASER_LIMIT;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          Your journeys
        </h2>
        {hasMore && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/journeys">
              View all {journeys.length} journeys
            </Link>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {topJourneys.map((journey) => (
          <JourneyTeaserCard key={journey.dealRoomId} journey={journey} />
        ))}
      </div>
      {!hasMore && (
        <div className="mt-4 flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/journeys">View all journeys</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function JourneyTeaserCard({ journey }: { journey: JourneyTeaser }) {
  const handleClick = () => {
    trackJourneyEvent("RESUME_FROM_HOME_TEASER", {
      dealRoomId: journey.dealRoomId,
      propertyId: journey.propertyId,
    });
  };

  const progress = Math.min(100, Math.max(0, journey.percentComplete));

  return (
    <Link
      href={journey.nextActionHref}
      onClick={handleClick}
      className="group block rounded-4xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Card className="h-full overflow-hidden p-0 transition-all hover:shadow-md hover:ring-2 hover:ring-primary/40">
        <div className="relative aspect-video bg-muted">
          {journey.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={journey.photoUrl}
              alt={journey.address}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Photo unavailable
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-foreground ring-1 ring-inset ring-foreground/10 backdrop-blur">
            {journey.buyerFacingStatusLabel}
          </span>
        </div>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {journey.address}
          </p>
          {journey.cityState && (
            <p className="text-xs text-muted-foreground">{journey.cityState}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${journey.stepLabel} progress`}
            >
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {journey.stepLabel}
            </span>
          </div>
          <span
            className={`mt-2 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${SEVERITY_PILL_CLASSES[journey.nextActionSeverity]}`}
          >
            {journey.nextActionLabel}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
