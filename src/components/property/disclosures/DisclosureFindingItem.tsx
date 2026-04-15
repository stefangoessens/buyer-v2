"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiChat02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackDisclosureEvent } from "@/lib/analytics/disclosure-events";

export type FindingDoc = Doc<"fileAnalysisFindings">;

interface DisclosureFindingItemProps {
  finding: FindingDoc;
  packetVersion: number;
  dealRoomId: string;
  propertyId: string;
  expandedValue: string;
  onAskAboutFinding: (finding: FindingDoc) => void;
}

type Severity = FindingDoc["severity"];
// KIN-1081: the schema-level `category` union now includes inspection
// categories too, but this component only renders disclosure findings.
// Narrow locally so the label table stays disclosure-only.
type Category =
  | "structural"
  | "water"
  | "hoa"
  | "legal"
  | "insurance"
  | "environmental"
  | "title"
  | "not_disclosed";

const CATEGORY_LABELS: Record<Category, string> = {
  structural: "Structural",
  water: "Water",
  hoa: "HOA",
  legal: "Legal",
  insurance: "Insurance",
  environmental: "Environmental",
  title: "Title",
  not_disclosed: "Not disclosed",
};

const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High risk",
  medium: "Needs attention",
  low: "FYI",
  info: "Info",
};

function severityClassName(severity: Severity): string {
  switch (severity) {
    case "critical":
    case "high":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "low":
      return "border-border bg-muted text-muted-foreground";
    case "info":
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function severityRank(severity: Severity): number {
  const idx = SEVERITY_ORDER.indexOf(severity);
  return idx === -1 ? SEVERITY_ORDER.length : idx;
}

export function findingKeyFor(finding: FindingDoc): string {
  return finding.findingKey ?? `${finding.rule}:${finding._id}`;
}

export function DisclosureFindingItem({
  finding,
  packetVersion,
  dealRoomId,
  propertyId,
  expandedValue,
  onAskAboutFinding,
}: DisclosureFindingItemProps) {
  const key = findingKeyFor(finding);
  const expanded = expandedValue === key;
  const hasFiredExpandRef = useRef(false);

  useEffect(() => {
    if (expanded && !hasFiredExpandRef.current) {
      hasFiredExpandRef.current = true;
      trackDisclosureEvent("FINDING_EXPANDED", {
        dealRoomId,
        propertyId,
        packetVersion,
        findingKey: key,
        category: finding.category,
        severity: finding.severity,
      });
    }
  }, [
    expanded,
    dealRoomId,
    propertyId,
    packetVersion,
    key,
    finding.category,
    finding.severity,
  ]);

  const isNotDisclosed = finding.category === "not_disclosed";
  const disclosureCategory =
    finding.category && finding.category in CATEGORY_LABELS
      ? (finding.category as Category)
      : null;
  const categoryLabel = disclosureCategory
    ? CATEGORY_LABELS[disclosureCategory]
    : null;

  const handleAskClick = () => {
    trackDisclosureEvent("FINDING_CHAT_OPENED", {
      dealRoomId,
      propertyId,
      packetVersion,
      findingKey: key,
    });
    onAskAboutFinding(finding);
  };

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
                severityClassName(finding.severity),
              )}
            >
              {SEVERITY_LABEL[finding.severity]}
            </span>
            {categoryLabel && (
              <Badge variant="outline" className="border-border text-foreground">
                {categoryLabel}
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
          <p className="text-sm leading-relaxed text-foreground">
            {finding.buyerFriendlyExplanation ?? finding.summary}
          </p>
          {!isNotDisclosed && finding.evidenceQuote && (
            <blockquote
              data-testid="disclosure-finding-evidence"
              className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs italic leading-relaxed text-muted-foreground"
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Evidence
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
          {isNotDisclosed && !finding.recommendedAction && (
            <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <HugeiconsIcon
                icon={InformationCircleIcon}
                size={16}
                strokeWidth={2}
                className="mt-0.5 shrink-0 text-primary"
              />
              <p className="text-foreground">
                This isn&apos;t mentioned in the packet. Consider asking the
                seller directly.
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAskClick}
              className="gap-2"
            >
              <HugeiconsIcon icon={AiChat02Icon} size={16} strokeWidth={2} />
              Ask about this
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
