"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { trackDisclosureEvent } from "@/lib/analytics/disclosure-events";
import {
  DisclosureFindingItem,
  findingKeyFor,
  severityRank,
} from "./DisclosureFindingItem";

export type FindingDoc = Doc<"fileAnalysisFindings">;

interface DisclosureFindingsListProps {
  findings: FindingDoc[];
  packetId: Id<"disclosurePackets">;
  packetVersion: number;
  dealRoomId: Id<"dealRooms">;
  propertyId: string;
  onAskAboutFinding: (finding: FindingDoc) => void;
}

function bucketCounts(findings: FindingDoc[]) {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const f of findings) {
    if (f.severity === "critical" || f.severity === "high") high += 1;
    else if (f.severity === "medium") medium += 1;
    else low += 1;
  }
  return { high, medium, low };
}

export function DisclosureFindingsList({
  findings,
  packetId,
  packetVersion,
  dealRoomId,
  propertyId,
  onAskAboutFinding,
}: DisclosureFindingsListProps) {
  const [expandedValue, setExpandedValue] = useState<string>("");
  const firedRef = useRef(false);

  const sortedFindings = useMemo(() => {
    return [...findings].sort((a, b) => {
      const rankDiff = severityRank(a.severity) - severityRank(b.severity);
      if (rankDiff !== 0) return rankDiff;
      return a.label.localeCompare(b.label);
    });
  }, [findings]);

  const counts = useMemo(() => bucketCounts(findings), [findings]);

  useEffect(() => {
    if (findings.length === 0 || firedRef.current) return;
    firedRef.current = true;
    trackDisclosureEvent("FINDINGS_RENDERED", {
      dealRoomId,
      propertyId,
      packetId,
      packetVersion,
      total: findings.length,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
    });
  }, [
    findings.length,
    counts.high,
    counts.medium,
    counts.low,
    dealRoomId,
    propertyId,
    packetId,
    packetVersion,
  ]);

  if (findings.length === 0) {
    return (
      <Card className="rounded-4xl border-border">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center sm:px-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={26}
              strokeWidth={2}
            />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg font-semibold text-foreground">
              No red flags surfaced
            </h3>
            <p className="text-sm text-muted-foreground">
              We scanned the packet and didn&apos;t find anything alarming.
              Still review the full documents before you submit an offer.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-4xl border-border">
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI-flagged items
          </p>
          <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {findings.length} finding{findings.length === 1 ? "" : "s"} to review
          </h3>
          <p className="text-sm text-muted-foreground">
            Tap any item to see the buyer-friendly explanation, the exact
            phrase from the packet, and what to do next.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-destructive">
            {counts.high} high
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
            {counts.medium} medium
          </span>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-muted-foreground">
            {counts.low} low
          </span>
        </div>

        <Accordion
          type="single"
          collapsible
          value={expandedValue}
          onValueChange={(value) => setExpandedValue(value)}
          className="flex flex-col gap-3 border-0"
        >
          {sortedFindings.map((finding) => (
            <DisclosureFindingItem
              key={findingKeyFor(finding)}
              finding={finding}
              packetVersion={packetVersion}
              dealRoomId={dealRoomId}
              propertyId={propertyId}
              expandedValue={expandedValue}
              onAskAboutFinding={onAskAboutFinding}
            />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
