"use client";

import { useEffect, useMemo, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiChat02Icon,
  Edit02Icon,
  InformationCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackInspectionEvent } from "@/lib/analytics/inspection-analysis-events";

type PacketDoc = Doc<"disclosurePackets">;

interface InspectionNegotiationSummaryProps {
  packet: PacketDoc;
  dealRoomId: Id<"dealRooms">;
  onDraftRepairAddendum: () => void;
}

interface ParsedSummaryItem {
  title?: string;
  rationale?: string;
  estimatedCostLowUsd?: number;
  estimatedCostHighUsd?: number;
}

interface ParsedSummary {
  items: ParsedSummaryItem[];
  estimatedTotalLowUsd?: number;
  estimatedTotalHighUsd?: number;
  buyerNote?: string;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function tryParseSummary(raw: string | undefined): {
  parsed: ParsedSummary | null;
  error: boolean;
} {
  if (!raw) return { parsed: null, error: false };
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") {
      return { parsed: null, error: true };
    }
    const obj = data as Record<string, unknown>;
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const items: ParsedSummaryItem[] = itemsRaw
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => ({
        title: typeof i.title === "string" ? i.title : undefined,
        rationale: typeof i.rationale === "string" ? i.rationale : undefined,
        estimatedCostLowUsd:
          typeof i.estimatedCostLowUsd === "number"
            ? i.estimatedCostLowUsd
            : undefined,
        estimatedCostHighUsd:
          typeof i.estimatedCostHighUsd === "number"
            ? i.estimatedCostHighUsd
            : undefined,
      }));
    return {
      parsed: {
        items,
        estimatedTotalLowUsd:
          typeof obj.estimatedTotalLowUsd === "number"
            ? obj.estimatedTotalLowUsd
            : undefined,
        estimatedTotalHighUsd:
          typeof obj.estimatedTotalHighUsd === "number"
            ? obj.estimatedTotalHighUsd
            : undefined,
        buyerNote:
          typeof obj.buyerNote === "string" ? obj.buyerNote : undefined,
      },
      error: false,
    };
  } catch {
    return { parsed: null, error: true };
  }
}

export function InspectionNegotiationSummary({
  packet,
  dealRoomId,
  onDraftRepairAddendum,
}: InspectionNegotiationSummaryProps) {
  const reviewState = packet.negotiationSummaryReviewState;
  const isApproved = reviewState === "approved";
  const isPending = reviewState === "pending" || reviewState === undefined;

  const { parsed, error } = useMemo(
    () => tryParseSummary(packet.negotiationSummaryBuyer),
    [packet.negotiationSummaryBuyer],
  );

  const viewedRef = useRef(false);
  useEffect(() => {
    if (!isApproved || viewedRef.current) return;
    viewedRef.current = true;
    trackInspectionEvent("NEGOTIATION_SUMMARY_VIEWED", {
      dealRoomId,
      packetId: packet._id,
      packetVersion: packet.version,
      reviewState,
    });
  }, [isApproved, reviewState, dealRoomId, packet._id, packet.version]);

  const handleDraftClick = () => {
    trackInspectionEvent("REPAIR_ADDENDUM_DRAFT_REQUESTED", {
      dealRoomId,
      packetId: packet._id,
      packetVersion: packet.version,
    });
    onDraftRepairAddendum();
  };

  if (isPending) {
    return (
      <Card
        className="rounded-4xl border-border bg-muted/30"
        data-testid="inspection-negotiation-summary-pending"
      >
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-4 sm:p-8">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={20}
              strokeWidth={2}
              className="animate-spin"
            />
          </span>
          <div className="flex flex-col gap-1">
            <h4 className="font-heading text-base font-semibold text-foreground">
              Your broker is reviewing this summary
            </h4>
            <p className="text-sm text-muted-foreground">
              Come back in a bit — we&apos;ll publish the negotiation summary
              once your broker signs off.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (reviewState === "rejected") {
    return null;
  }

  if (error || !parsed) {
    return (
      <Card
        className="rounded-4xl border-amber-200 bg-amber-50"
        data-testid="inspection-negotiation-summary-error"
      >
        <CardContent className="flex flex-col gap-2 p-6 sm:p-8">
          <h4 className="font-heading text-base font-semibold text-amber-900">
            Negotiation summary couldn&apos;t be displayed
          </h4>
          <p className="text-sm text-amber-800">
            Something looks off with the saved summary. Your broker has been
            notified — please refresh in a few minutes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="rounded-4xl border-border bg-card"
      data-testid="inspection-negotiation-summary"
    >
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Negotiation summary
          </p>
          <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            What to ask the seller for
          </h3>
          <p className="text-sm text-muted-foreground">
            Broker-reviewed list of repair concessions you can raise within the
            inspection period.
          </p>
        </div>

        {parsed.buyerNote && (
          <div className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-foreground">
            {parsed.buyerNote}
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {parsed.items.map((item, idx) => (
            <li
              key={`${item.title ?? "item"}-${idx}`}
              className="rounded-2xl bg-muted/40 px-4 py-3"
              data-testid="inspection-negotiation-summary-item"
            >
              <p className="font-semibold text-foreground">
                {item.title ?? `Item ${idx + 1}`}
              </p>
              {item.rationale && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.rationale}
                </p>
              )}
              {typeof item.estimatedCostLowUsd === "number" &&
                typeof item.estimatedCostHighUsd === "number" && (
                  <p className="mt-2 text-xs font-medium text-foreground">
                    Estimated cost: {formatUsd(item.estimatedCostLowUsd)}–
                    {formatUsd(item.estimatedCostHighUsd)}
                  </p>
                )}
            </li>
          ))}
        </ul>

        {typeof parsed.estimatedTotalLowUsd === "number" &&
          typeof parsed.estimatedTotalHighUsd === "number" && (
            <div className="flex flex-col gap-1 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Estimated total range
              </p>
              <p className="text-lg font-semibold text-foreground">
                {formatUsd(parsed.estimatedTotalLowUsd)}–
                {formatUsd(parsed.estimatedTotalHighUsd)}
              </p>
            </div>
          )}

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={16}
            strokeWidth={2}
            className="mt-0.5 shrink-0 text-primary"
          />
          <p>
            This analysis is informational only and broker-reviewed. It is not
            legal advice, not a contractor quote, and not a final repair list.
            Consult your FL broker and licensed specialists for binding
            guidance.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleDraftClick}
            className="gap-2"
          >
            <HugeiconsIcon icon={Edit02Icon} size={18} strokeWidth={2} />
            Draft repair request addendum
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={handleDraftClick}
            className="gap-2"
          >
            <HugeiconsIcon icon={AiChat02Icon} size={18} strokeWidth={2} />
            Talk through this with AI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
