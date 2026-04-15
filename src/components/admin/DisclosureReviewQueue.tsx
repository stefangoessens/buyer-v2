"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { trackDisclosureEvent } from "@/lib/analytics/disclosure-events";

type Severity = "info" | "low" | "medium" | "high" | "critical";

function severityClass(severity: Severity): string {
  switch (severity) {
    case "critical":
    case "high":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DisclosureReviewQueue() {
  const queue = useQuery(api.disclosures.listBrokerReviewQueue, { limit: 50 });
  const queuedEventRef = useRef(false);

  useEffect(() => {
    if (queue === undefined || queue.length === 0) return;
    if (queuedEventRef.current) return;
    queuedEventRef.current = true;
    trackDisclosureEvent("BROKER_REVIEW_QUEUED", {
      packetCount: queue.length,
      worstSeverity: queue[0]?.worstSeverity,
    });
  }, [queue]);

  return (
    <Card className="rounded-4xl border-border">
      <CardHeader className="pb-3">
        <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Disclosure review
        </CardDescription>
        <CardTitle className="text-lg font-semibold text-foreground">
          Flagged disclosure packets
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Packets with at least one high-severity or low-confidence finding,
          ordered by worst risk first.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {queue === undefined && (
          <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Loading review queue…
          </p>
        )}
        {queue && queue.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No packets require broker review right now.
          </p>
        )}
        {queue && queue.length > 0 && (
          <ul className="flex flex-col gap-2">
            {queue.map((row) => {
              const propertyId = row.packet.propertyId;
              return (
                <li key={row.packet._id}>
                  <Link
                    href={`/property/${propertyId}/disclosures`}
                    className="group flex items-center gap-3 rounded-3xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30 hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        severityClass(row.worstSeverity as Severity),
                      )}
                    >
                      {SEVERITY_LABEL[row.worstSeverity as Severity]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        Packet v{row.packet.version}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.flaggedFindingCount} flagged finding
                        {row.flaggedFindingCount === 1 ? "" : "s"} ·{" "}
                        updated {formatDate(row.packet.updatedAt)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-primary">
                      Review
                    </span>
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      size={16}
                      strokeWidth={2}
                      className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
