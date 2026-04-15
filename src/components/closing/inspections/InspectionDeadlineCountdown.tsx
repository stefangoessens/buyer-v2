"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StopWatchIcon } from "@hugeicons/core-free-icons";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { trackInspectionEvent } from "@/lib/analytics/inspection-analysis-events";

interface InspectionDeadlineCountdownProps {
  inspectionPeriodEnd: string | null;
  dealRoomId: Id<"dealRooms">;
}

type Urgency = "amber" | "red";

interface CountdownState {
  hoursRemaining: number;
  urgency: Urgency | null;
}

function computeCountdown(deadlineIso: string | null): CountdownState {
  if (!deadlineIso) return { hoursRemaining: Infinity, urgency: null };
  const end = Date.parse(deadlineIso);
  if (Number.isNaN(end)) return { hoursRemaining: Infinity, urgency: null };
  const diffMs = end - Date.now();
  const hours = Math.max(0, diffMs / (1000 * 60 * 60));
  if (hours > 48) return { hoursRemaining: hours, urgency: null };
  if (hours >= 24) return { hoursRemaining: hours, urgency: "amber" };
  return { hoursRemaining: hours, urgency: "red" };
}

export function InspectionDeadlineCountdown({
  inspectionPeriodEnd,
  dealRoomId,
}: InspectionDeadlineCountdownProps) {
  const [state, setState] = useState<CountdownState>(() =>
    computeCountdown(inspectionPeriodEnd),
  );
  const lastFiredUrgencyRef = useRef<Urgency | null>(null);

  useEffect(() => {
    setState(computeCountdown(inspectionPeriodEnd));
    if (!inspectionPeriodEnd) return;
    const interval = window.setInterval(() => {
      setState(computeCountdown(inspectionPeriodEnd));
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [inspectionPeriodEnd]);

  useEffect(() => {
    if (state.urgency && state.urgency !== lastFiredUrgencyRef.current) {
      lastFiredUrgencyRef.current = state.urgency;
      trackInspectionEvent("DEADLINE_WARNING_SHOWN", {
        dealRoomId,
        urgency: state.urgency,
        hoursRemaining: Math.round(state.hoursRemaining),
      });
    }
  }, [state.urgency, state.hoursRemaining, dealRoomId]);

  if (state.urgency === null) return null;

  const hours = Math.max(1, Math.floor(state.hoursRemaining));
  const isAmber = state.urgency === "amber";

  return (
    <Card
      className={cn(
        "rounded-3xl",
        isAmber
          ? "border-amber-300 bg-amber-50"
          : "border-destructive/40 bg-destructive/5",
      )}
      data-testid="inspection-deadline-countdown"
      role="status"
    >
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-2xl",
            isAmber
              ? "bg-amber-100 text-amber-900"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <HugeiconsIcon icon={StopWatchIcon} size={20} strokeWidth={2} />
        </span>
        <div className="flex flex-col gap-0.5">
          {isAmber ? (
            <>
              <p className="text-sm font-semibold text-amber-900">
                You have {hours} hour{hours === 1 ? "" : "s"} left to raise
                concerns with the seller.
              </p>
              <p className="text-xs text-amber-800">
                The inspection period closes soon. Get any open questions in
                front of your broker now.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-destructive">
                URGENT: less than 24 hours left to raise concerns.
              </p>
              <p className="text-xs text-destructive/80">
                After the inspection period closes, you can&apos;t request
                repair concessions for these items.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
