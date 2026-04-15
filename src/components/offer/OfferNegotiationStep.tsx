// Fourth wizard step — post-submission negotiation tracker placeholder (KIN-1077).
"use client";

import { Card, CardContent } from "@/components/ui/card";

export function OfferNegotiationStep() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <p className="text-base font-semibold text-foreground">
          Offer Negotiation
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Available after first submission
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Once your offer is submitted, this is where you&apos;ll track
          counters, conditions, and final acceptance.
        </p>
      </CardContent>
    </Card>
  );
}
