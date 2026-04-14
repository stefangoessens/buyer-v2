"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackJourneyEvent } from "@/lib/analytics/journey-events";

interface JourneyStaleWarningProps {
  dealRoomId: string;
  daysSinceLastActivity: number;
  onArchive: () => void;
  onContinue: () => void;
  onDismiss: () => void;
  className?: string;
}

type StaleActionKind = "archived" | "continued" | "dismissed";

export function JourneyStaleWarning({
  dealRoomId,
  daysSinceLastActivity,
  onArchive,
  onContinue,
  onDismiss,
  className,
}: JourneyStaleWarningProps) {
  const firedShownRef = useRef(false);

  useEffect(() => {
    if (firedShownRef.current) return;
    firedShownRef.current = true;
    trackJourneyEvent("STALE_WARNING_SHOWN", { dealRoomId });
  }, [dealRoomId]);

  const handleAction = (kind: StaleActionKind, fn: () => void) => {
    trackJourneyEvent("STALE_WARNING_ACTION", {
      dealRoomId,
      action: kind,
    });
    fn();
  };

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-4xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10",
        className,
      )}
    >
      <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-amber-400/30 text-amber-900 dark:text-amber-200">
        <HugeiconsIcon icon={Alert01Icon} className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-foreground">
          Still considering this one?{" "}
          <span className="text-muted-foreground">
            {daysSinceLastActivity} days since your last visit. Archive or
            continue?
          </span>
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => handleAction("archived", onArchive)}
          >
            Archive
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => handleAction("continued", onContinue)}
          >
            Continue
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss stale warning"
        onClick={() => handleAction("dismissed", onDismiss)}
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </div>
  );
}
