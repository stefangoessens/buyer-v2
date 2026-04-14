"use client";

import Link from "next/link";
import { useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Archive01Icon, Home01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackJourneyEvent } from "@/lib/analytics/journey-events";

type JourneysEmptyStateProps =
  | { variant: "never"; onShowActive?: never }
  | { variant: "allArchived"; onShowActive: () => void };

export function JourneysEmptyState(props: JourneysEmptyStateProps) {
  const handleNeverClick = useCallback(() => {
    trackJourneyEvent("LIST_EMPTY_CTA_CLICKED", { cta: "paste-link" });
  }, []);

  const handleAllArchivedClick = useCallback(() => {
    if (props.variant !== "allArchived") return;
    trackJourneyEvent("LIST_EMPTY_CTA_CLICKED", { cta: "show-archived" });
    props.onShowActive();
  }, [props]);

  if (props.variant === "never") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={Home01Icon} className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground">
              You haven&apos;t started any journeys yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Paste a Zillow, Redfin, or Realtor link to start your first
              journey.
            </p>
          </div>
          <Button asChild className="rounded-full" onClick={handleNeverClick}>
            <Link href="/">Paste a link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <HugeiconsIcon icon={Archive01Icon} className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-foreground">
            You&apos;ve archived all your journeys
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Switch to the Archived view to review them, or paste a new link to
            start fresh.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="rounded-full"
            onClick={handleAllArchivedClick}
          >
            Show archived
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link
              href="/"
              onClick={() =>
                trackJourneyEvent("LIST_EMPTY_CTA_CLICKED", {
                  cta: "paste-link",
                })
              }
            >
              Paste a link
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
