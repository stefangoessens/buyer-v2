"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiChat02Icon,
  InformationCircleIcon,
  ToolsIcon,
} from "@hugeicons/core-free-icons";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackInspectionEvent } from "@/lib/analytics/inspection-analysis-events";

type FindingDoc = Doc<"fileAnalysisFindings">;
type BuyerSeverity = NonNullable<FindingDoc["buyerSeverity"]>;

interface InspectionFindingRowProps {
  finding: FindingDoc;
  packetId: Id<"disclosurePackets">;
  packetVersion: number;
  dealRoomId: Id<"dealRooms">;
  expandedValue: string;
  onAskAboutFinding: (finding: FindingDoc) => void;
  onRequestSpecialistConsult: (finding: FindingDoc) => void;
}

const SEVERITY_LABEL: Record<BuyerSeverity, string> = {
  life_safety: "Life-safety",
  major_repair: "Major repair",
  monitor: "Monitor",
  cosmetic: "Cosmetic",
};

function severityClassName(severity: BuyerSeverity | undefined): string {
  switch (severity) {
    case "life_safety":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "major_repair":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "monitor":
      return "border-border bg-muted text-foreground";
    case "cosmetic":
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function inspectionFindingKey(finding: FindingDoc): string {
  return finding.findingKey ?? `${finding.rule}:${finding._id}`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function InspectionFindingRow({
  finding,
  packetId,
  packetVersion,
  dealRoomId,
  expandedValue,
  onAskAboutFinding,
  onRequestSpecialistConsult,
}: InspectionFindingRowProps) {
  const key = inspectionFindingKey(finding);
  const expanded = expandedValue === key;
  const hasFiredExpandRef = useRef(false);

  useEffect(() => {
    if (expanded && !hasFiredExpandRef.current) {
      hasFiredExpandRef.current = true;
      trackInspectionEvent("FINDING_EXPANDED", {
        dealRoomId,
        packetId,
        packetVersion,
        findingKey: key,
        system: finding.system,
        buyerSeverity: finding.buyerSeverity,
      });
    }
  }, [
    expanded,
    dealRoomId,
    packetId,
    packetVersion,
    key,
    finding.system,
    finding.buyerSeverity,
  ]);

  const handleAskClick = () => {
    trackInspectionEvent("FINDING_CHAT_OPENED", {
      dealRoomId,
      packetId,
      packetVersion,
      findingKey: key,
    });
    onAskAboutFinding(finding);
  };

  const handleSpecialistClick = () => {
    trackInspectionEvent("SPECIALIST_CONSULT_REQUESTED", {
      dealRoomId,
      packetId,
      packetVersion,
      findingKey: key,
      system: finding.system,
    });
    onRequestSpecialistConsult(finding);
  };

  const hasNumericCostRange =
    typeof finding.estimatedCostLowUsd === "number" &&
    typeof finding.estimatedCostHighUsd === "number";

  return (
    <AccordionItem
      value={key}
      className="rounded-3xl border border-border bg-card data-[state=open]:border-primary/30"
    >
      <AccordionTrigger className="px-5 py-4 hover:no-underline">
        <div className="flex flex-1 flex-col gap-2 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                severityClassName(finding.buyerSeverity),
              )}
            >
              {finding.buyerSeverity
                ? SEVERITY_LABEL[finding.buyerSeverity]
                : "Finding"}
            </span>
            {finding.system && (
              <Badge
                variant="outline"
                className="border-border text-foreground"
              >
                {finding.system}
              </Badge>
            )}
            {typeof finding.confidence === "number" && (
              <span className="text-[11px] text-muted-foreground">
                {Math.round(finding.confidence * 100)}% confidence
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground sm:text-base">
            {finding.label}
          </p>
          {(finding.sourceFileName || finding.pageReference) && (
            <p className="text-xs text-muted-foreground">
              {finding.sourceFileName}
              {finding.sourceFileName && finding.pageReference ? " · " : ""}
              {finding.pageReference}
            </p>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5">
        <div className="flex flex-col gap-4">
          {finding.buyerFriendlyExplanation && (
            <p className="text-sm leading-relaxed text-foreground">
              {finding.buyerFriendlyExplanation}
            </p>
          )}
          {finding.evidenceQuote && (
            <blockquote
              data-testid="inspection-finding-evidence"
              className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs italic leading-relaxed text-muted-foreground"
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                From the report
              </p>
              <p>“{finding.evidenceQuote}”</p>
            </blockquote>
          )}
          {finding.recommendedAction && (
            <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <HugeiconsIcon
                icon={InformationCircleIcon}
                size={16}
                strokeWidth={2}
                className="mt-0.5 shrink-0 text-primary"
              />
              <p className="text-foreground">{finding.recommendedAction}</p>
            </div>
          )}

          {hasNumericCostRange && (
            <div
              className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm"
              data-testid="inspection-finding-cost"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-foreground">
                  Estimated cost: {formatUsd(finding.estimatedCostLowUsd!)}–
                  {formatUsd(finding.estimatedCostHighUsd!)}
                </p>
                {typeof finding.costEstimateConfidence === "number" && (
                  <span className="text-[11px] text-muted-foreground">
                    {Math.round(finding.costEstimateConfidence * 100)}%
                    confidence
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Market-based estimate, not a contractor quote — always get 3
                real quotes.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAskClick}
              className="gap-2"
            >
              <HugeiconsIcon
                icon={AiChat02Icon}
                size={16}
                strokeWidth={2}
              />
              Ask about this
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSpecialistClick}
              className="gap-2"
            >
              <HugeiconsIcon icon={ToolsIcon} size={16} strokeWidth={2} />
              Request specialist consult
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
