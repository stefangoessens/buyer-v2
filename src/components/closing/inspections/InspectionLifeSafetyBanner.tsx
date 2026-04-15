"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { trackInspectionEvent } from "@/lib/analytics/inspection-analysis-events";

type FindingDoc = Doc<"fileAnalysisFindings">;

interface InspectionLifeSafetyBannerProps {
  findings: FindingDoc[];
  dealRoomId: Id<"dealRooms">;
}

export function InspectionLifeSafetyBanner({
  findings,
  dealRoomId,
}: InspectionLifeSafetyBannerProps) {
  const acknowledge = useMutation(api.fileAnalysis.acknowledgeLifeSafetyFinding);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const handleAcknowledge = useCallback(
    async (findingId: Id<"fileAnalysisFindings">) => {
      const idStr = String(findingId);
      if (pendingIds.has(idStr)) return;
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(idStr);
        return next;
      });
      try {
        await acknowledge({ findingId });
        trackInspectionEvent("LIFE_SAFETY_ACKNOWLEDGED", {
          dealRoomId,
          findingId: idStr,
        });
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(idStr);
          return next;
        });
      }
    },
    [acknowledge, pendingIds, dealRoomId],
  );

  const unacknowledged = findings.filter((f) => !f.acknowledgedAt);
  if (unacknowledged.length === 0) return null;

  return (
    <Card
      className="rounded-4xl border-destructive/40 bg-destructive/5"
      data-testid="inspection-life-safety-banner"
      role="alert"
    >
      <CardContent className="flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={Alert01Icon} size={22} strokeWidth={2} />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg font-semibold text-foreground">
              Life-safety findings require your acknowledgment
            </h3>
            <p className="text-sm text-muted-foreground">
              Confirm you&apos;ve seen each item before your broker can publish
              the negotiation summary.
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {unacknowledged.map((finding) => {
            const idStr = String(finding._id);
            const isPending = pendingIds.has(idStr);
            const checkboxId = `life-safety-ack-${idStr}`;
            return (
              <li
                key={idStr}
                className="flex items-start gap-3 rounded-3xl border border-destructive/30 bg-card px-4 py-3 text-sm"
                data-testid="inspection-life-safety-row"
              >
                <Checkbox
                  id={checkboxId}
                  disabled={isPending}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      void handleAcknowledge(finding._id);
                    }
                  }}
                  className="mt-1"
                />
                <div className="flex flex-1 flex-col gap-1">
                  <p className="font-medium text-foreground">{finding.label}</p>
                  {finding.buyerFriendlyExplanation && (
                    <p className="text-xs text-muted-foreground">
                      {finding.buyerFriendlyExplanation}
                    </p>
                  )}
                  <Label
                    htmlFor={checkboxId}
                    className="mt-1 cursor-pointer text-xs font-medium text-destructive"
                  >
                    I understand this finding
                  </Label>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
