"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { trackInspectionEvent } from "@/lib/analytics/inspection-analysis-events";
import {
  InspectionFindingRow,
  inspectionFindingKey,
} from "./InspectionFindingRow";

type FindingDoc = Doc<"fileAnalysisFindings">;
type System = NonNullable<FindingDoc["system"]>;
type BuyerSeverity = NonNullable<FindingDoc["buyerSeverity"]>;

interface InspectionFindingsListProps {
  findings: FindingDoc[];
  packetId: Id<"disclosurePackets">;
  packetVersion: number;
  dealRoomId: Id<"dealRooms">;
  onAskAboutFinding: (finding: FindingDoc) => void;
  onRequestSpecialistConsult: (finding: FindingDoc) => void;
}

const SEVERITY_RANK: Record<BuyerSeverity, number> = {
  life_safety: 0,
  major_repair: 1,
  monitor: 2,
  cosmetic: 3,
};

const SYSTEM_ORDER: System[] = [
  "roof",
  "hvac",
  "electrical",
  "plumbing",
  "structural",
  "exterior",
  "interior",
  "grounds",
  "appliances",
  "pest",
];

const SYSTEM_LABEL: Record<System, string> = {
  roof: "Roof",
  hvac: "HVAC",
  electrical: "Electrical",
  plumbing: "Plumbing",
  structural: "Structural",
  exterior: "Exterior",
  interior: "Interior",
  grounds: "Grounds",
  appliances: "Appliances",
  pest: "Pest & WDO",
};

interface SystemGroup {
  system: System | "other";
  label: string;
  findings: FindingDoc[];
  hasLifeSafety: boolean;
}

function groupFindingsBySystem(findings: FindingDoc[]): SystemGroup[] {
  const buckets = new Map<string, FindingDoc[]>();
  for (const finding of findings) {
    const key = finding.system ?? "other";
    const existing = buckets.get(key);
    if (existing) {
      existing.push(finding);
    } else {
      buckets.set(key, [finding]);
    }
  }

  const orderedKeys: string[] = [
    ...SYSTEM_ORDER.filter((s) => buckets.has(s)),
    ...Array.from(buckets.keys()).filter(
      (k) => k === "other" || !SYSTEM_ORDER.includes(k as System),
    ),
  ];

  return orderedKeys.map((key) => {
    const groupFindings = buckets.get(key) ?? [];
    const sorted = [...groupFindings].sort((a, b) => {
      const aRank =
        a.buyerSeverity !== undefined ? SEVERITY_RANK[a.buyerSeverity] : 99;
      const bRank =
        b.buyerSeverity !== undefined ? SEVERITY_RANK[b.buyerSeverity] : 99;
      if (aRank !== bRank) return aRank - bRank;
      return a.label.localeCompare(b.label);
    });
    return {
      system: key as System | "other",
      label:
        key === "other"
          ? "Other"
          : SYSTEM_LABEL[key as System] ?? (key as string),
      findings: sorted,
      hasLifeSafety: sorted.some((f) => f.buyerSeverity === "life_safety"),
    };
  });
}

export function InspectionFindingsList({
  findings,
  packetId,
  packetVersion,
  dealRoomId,
  onAskAboutFinding,
  onRequestSpecialistConsult,
}: InspectionFindingsListProps) {
  const [expandedValue, setExpandedValue] = useState<string>("");
  const firedRef = useRef(false);

  const groups = useMemo(() => groupFindingsBySystem(findings), [findings]);

  useEffect(() => {
    if (findings.length === 0 || firedRef.current) return;
    firedRef.current = true;
    trackInspectionEvent("FINDINGS_RENDERED", {
      dealRoomId,
      packetId,
      packetVersion,
      total: findings.length,
      lifeSafety: findings.filter((f) => f.buyerSeverity === "life_safety")
        .length,
      majorRepair: findings.filter((f) => f.buyerSeverity === "major_repair")
        .length,
      monitor: findings.filter((f) => f.buyerSeverity === "monitor").length,
      cosmetic: findings.filter((f) => f.buyerSeverity === "cosmetic").length,
    });
  }, [findings, dealRoomId, packetId, packetVersion]);

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
              No findings to flag yet
            </h3>
            <p className="text-sm text-muted-foreground">
              The inspector didn&apos;t surface anything alarming. Still review
              the full report and ask questions before deciding.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find the first group that contains a life-safety finding so we can
  // visually emphasize it. Life-safety items must be visible without an
  // extra click.
  const firstLifeSafetyGroupKey = groups.find((g) => g.hasLifeSafety)?.system;

  return (
    <Card className="rounded-4xl border-border">
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI-flagged inspection items
          </p>
          <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {findings.length} finding{findings.length === 1 ? "" : "s"} to
            review
          </h3>
          <p className="text-sm text-muted-foreground">
            Grouped by system. Tap any item to see the buyer-friendly
            explanation, the inspector quote, and the recommended next step.
          </p>
        </div>

        <Accordion
          type="single"
          collapsible
          value={expandedValue}
          onValueChange={(value) => setExpandedValue(value)}
          className="flex flex-col gap-5 border-0"
        >
          {groups.map((group) => (
            <div
              key={group.system}
              className="flex flex-col gap-3"
              data-testid={`inspection-system-group-${group.system}`}
              data-life-safety={
                group.system === firstLifeSafetyGroupKey ? "true" : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-heading text-base font-semibold text-foreground">
                  {group.label}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({group.findings.length} finding
                    {group.findings.length === 1 ? "" : "s"})
                  </span>
                </h4>
                {group.hasLifeSafety && (
                  <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                    Life-safety
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {group.findings.map((finding) => (
                  <InspectionFindingRow
                    key={inspectionFindingKey(finding)}
                    finding={finding}
                    packetId={packetId}
                    packetVersion={packetVersion}
                    dealRoomId={dealRoomId}
                    expandedValue={expandedValue}
                    onAskAboutFinding={onAskAboutFinding}
                    onRequestSpecialistConsult={onRequestSpecialistConsult}
                  />
                ))}
              </div>
            </div>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
