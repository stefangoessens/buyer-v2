"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { trackClosingEvent } from "@/lib/analytics/closing-events";

interface ClosingWireFraudBannerProps {
  dealRoomId: string;
}

export function ClosingWireFraudBanner({
  dealRoomId,
}: ClosingWireFraudBannerProps) {
  useEffect(() => {
    trackClosingEvent("WIRE_FRAUD_BANNER_VIEWED", { dealRoomId });
  }, [dealRoomId]);

  return (
    <div
      role="alert"
      data-testid="closing-wire-fraud-banner"
      className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground shadow-sm"
    >
      <div className="mt-0.5 shrink-0 text-destructive">
        <HugeiconsIcon icon={Alert02Icon} size={22} strokeWidth={2} />
      </div>
      <div className="text-foreground">
        <div className="mb-1 font-semibold text-destructive">
          Wire fraud warning
        </div>
        <p className="leading-relaxed">
          Before wiring any funds, verify wire instructions by{" "}
          <span className="font-semibold">
            calling the title company at the number on their official website
          </span>
          . Never trust emailed wire instructions alone. Closing-day wire
          fraud costs Florida buyers millions annually.
        </p>
      </div>
    </div>
  );
}
