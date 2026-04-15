"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { Card, CardContent } from "@/components/ui/card";

// TODO: wire real `broker.fl_license_number` once a buyer-safe settings
// read lands. Matches the placeholder used by BrokeragePhoneGateModal.
const LICENSE_PLACEHOLDER = "[Brokerage License #]";

export function DisclosureLegalDisclaimer() {
  return (
    <Card
      className="rounded-4xl border-border bg-muted/30"
      data-testid="disclosure-legal-disclaimer"
    >
      <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-4 sm:p-8">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={20}
            strokeWidth={2}
          />
        </span>
        <div className="flex flex-col gap-1">
          <h4 className="font-heading text-base font-semibold text-foreground">
            AI analysis is not legal advice
          </h4>
          <p className="text-sm text-muted-foreground">
            Consult a FL-licensed attorney or your broker for binding
            interpretation of any disclosure.
          </p>
          <p className="text-xs text-muted-foreground">
            buyer-v2 is a licensed Florida real estate brokerage,{" "}
            {LICENSE_PLACEHOLDER}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
