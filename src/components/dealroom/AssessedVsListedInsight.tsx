"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AssessedVsListedInsightProps {
  listPrice: number | null;
  papaAssessedValue?: number;
  papaJustValue?: number;
  papaCurrentOwner?: string;
  papaIsCorporate?: boolean;
  papaFolio?: string;
  papaExemptions?: string[];
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function AssessedVsListedInsight(props: AssessedVsListedInsightProps) {
  const hasPapaData = props.papaAssessedValue !== undefined;

  if (!hasPapaData) {
    return (
      <Card>
        <CardHeader>
          <p className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-700">
            County records
          </p>
          <CardTitle className="mt-2 text-xl">
            Assessed value vs list price
          </CardTitle>
          <CardDescription className="mt-1.5">
            Broward County Property Appraiser data not yet available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Coming soon — this property hasn&apos;t been crawled by the BCPA
              integration yet. Available for Broward County listings once the
              crawler is enabled.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const listPrice = props.listPrice ?? 0;
  const assessed = props.papaAssessedValue ?? 0;
  const just = props.papaJustValue ?? 0;
  const delta =
    listPrice > 0 && assessed > 0 ? (listPrice - assessed) / assessed : 0;
  const deltaPct = (delta * 100).toFixed(0);
  const isInflated = delta > 0.25;

  return (
    <Card>
      <CardHeader>
        <p className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-700">
          County records
        </p>
        <CardTitle className="mt-2 text-xl">
          Assessed value vs list price
        </CardTitle>
        <CardDescription className="mt-1.5">
          Broward County Property Appraiser snapshot
          {props.papaFolio ? ` · folio ${props.papaFolio}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              List price
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {listPrice ? currency.format(listPrice) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Just value
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {just ? currency.format(just) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Assessed value
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {currency.format(assessed)}
            </p>
          </div>
        </div>

        {listPrice > 0 && assessed > 0 ? (
          <div
            className={cn(
              "mt-4 rounded-2xl px-4 py-3 ring-1",
              isInflated
                ? "bg-warning-50 ring-warning-500/30 text-warning-700"
                : "bg-success-50 ring-success-500/30 text-success-700",
            )}
          >
            <p className="text-sm font-medium">
              List price is {deltaPct}% {delta >= 0 ? "above" : "below"} assessed
              value
              {isInflated ? " — flag for negotiation leverage" : ""}
            </p>
          </div>
        ) : null}

        {props.papaCurrentOwner ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Current owner:</span>
            <span className="text-sm font-medium text-foreground">
              {props.papaCurrentOwner}
            </span>
            {props.papaIsCorporate ? (
              <Badge variant="outline" className="text-[10px]">
                Corporate
              </Badge>
            ) : null}
            {props.papaExemptions?.includes("homestead") ? (
              <Badge variant="outline" className="text-[10px]">
                Homestead
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
