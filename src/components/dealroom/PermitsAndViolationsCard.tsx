"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PermitsAndViolationsCardProps {
  propertyId: string;
}

export function PermitsAndViolationsCard({
  propertyId,
}: PermitsAndViolationsCardProps) {
  const data = useQuery(api.permits.getForProperty, {
    propertyId: propertyId as Id<"properties">,
  });

  if (data === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Permits &amp; violations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (data === null) {
    return (
      <Card>
        <CardHeader>
          <p className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-700">
            Building permits
          </p>
          <CardTitle className="mt-2 text-xl">
            Permits &amp; violations
          </CardTitle>
          <CardDescription className="mt-1.5">
            Broward Building Department records not yet available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Coming soon — this property hasn&apos;t been crawled by the
              Broward Building Department integration yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const yearsSinceLastPermit = data.lastPermitDate
    ? Math.floor(
        (Date.now() - new Date(data.lastPermitDate).getTime()) /
          (1000 * 60 * 60 * 24 * 365),
      )
    : null;

  return (
    <Card>
      <CardHeader>
        <p className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-700">
          Building permits
        </p>
        <CardTitle className="mt-2 text-xl">Permits &amp; violations</CardTitle>
        <CardDescription className="mt-1.5">
          Broward County Building Department snapshot
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Total permits
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {data.permitsCount}
            </p>
            {data.openPermitsCount > 0 ? (
              <p className="mt-1 text-xs text-warning-700">
                {data.openPermitsCount} open
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Violations
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {data.violationsCount}
            </p>
            {data.unresolvedViolationsCount > 0 ? (
              <p className="mt-1 text-xs text-error-700">
                {data.unresolvedViolationsCount} unresolved
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Last permit
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {data.lastPermitDate ?? "—"}
            </p>
            {yearsSinceLastPermit !== null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {yearsSinceLastPermit}y ago
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.openPermitsCount > 0 ? (
            <Badge variant="outline" className="text-[11px]">
              Open permits — may affect closing
            </Badge>
          ) : null}
          {data.unresolvedViolationsCount > 0 ? (
            <Badge variant="outline" className="text-[11px]">
              Unresolved violations — negotiation leverage
            </Badge>
          ) : null}
          {yearsSinceLastPermit !== null && yearsSinceLastPermit >= 20 ? (
            <Badge variant="outline" className="text-[11px]">
              No permit in 20+ years — insurance risk
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
