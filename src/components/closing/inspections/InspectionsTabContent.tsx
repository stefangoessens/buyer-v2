"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CloudUploadIcon,
  InformationCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InspectionUploadPanel } from "./InspectionUploadPanel";
import { InspectionBigTicketTiles } from "./InspectionBigTicketTiles";
import { InspectionLifeSafetyBanner } from "./InspectionLifeSafetyBanner";
import { InspectionFindingsList } from "./InspectionFindingsList";
import { InspectionNegotiationSummary } from "./InspectionNegotiationSummary";
import { InspectionDeadlineCountdown } from "./InspectionDeadlineCountdown";

type FindingDoc = Doc<"fileAnalysisFindings">;
type FileFactDoc = Doc<"fileFacts">;
type ClosingPacketDoc = Doc<"disclosurePackets">;

interface InspectionsTabContentProps {
  dealRoomId: Id<"dealRooms">;
  propertyId: Id<"properties">;
}

const INSPECTION_PERIOD_MILESTONE_KEY = "inspection_period_end";
const INSPECTION_FACT_SLUG_PREFIX = "inspection.";

export function InspectionsTabContent({
  dealRoomId,
  propertyId,
}: InspectionsTabContentProps) {
  const latest = useQuery(api.disclosures.getLatestPacket, {
    dealRoomId,
    workflow: "inspection",
  });
  const history = useQuery(api.disclosures.listPacketHistory, {
    dealRoomId,
    workflow: "inspection",
  });
  const findings = useQuery(
    api.fileAnalysis.getInspectionFindingsByPacket,
    latest?.packet ? { packetId: latest.packet._id } : "skip",
  ) as FindingDoc[] | undefined;
  const milestones = useQuery(api.contractMilestones.listByDealRoom, {
    dealRoomId,
  });
  const propertyFacts = useQuery(api.fileFacts.listByProperty, {
    propertyId,
  });
  const sendChatMessage = useMutation(api.propertyChat.sendMessage);

  const [replacing, setReplacing] = useState(false);

  const nextPacketVersion = useMemo(() => {
    if (!history || history.length === 0) return 1;
    const maxVersion = history.reduce(
      (max, p) => (p.version > max ? p.version : max),
      0,
    );
    return maxVersion + 1;
  }, [history]);

  const inspectionFacts = useMemo<FileFactDoc[]>(() => {
    if (!Array.isArray(propertyFacts)) return [];
    return propertyFacts.filter((f) =>
      f.factSlug.startsWith(INSPECTION_FACT_SLUG_PREFIX),
    );
  }, [propertyFacts]);

  const inspectionPeriodEnd = useMemo<string | null>(() => {
    if (!Array.isArray(milestones)) return null;
    const match = milestones.find(
      (m) =>
        (m as { milestoneKey?: string }).milestoneKey ===
        INSPECTION_PERIOD_MILESTONE_KEY,
    );
    if (!match) return null;
    const dueDate = (match as { dueDate?: string }).dueDate;
    return typeof dueDate === "string" ? dueDate : null;
  }, [milestones]);

  const handleUploadComplete = useCallback(
    ({ wasDuplicate }: { wasDuplicate: boolean }) => {
      setReplacing(false);
      if (wasDuplicate) {
        toast.info(
          "This inspection report has already been analyzed — showing existing findings.",
        );
      } else {
        toast.success("Inspection received — analyzing now.");
      }
    },
    [],
  );

  const handleAskAboutFinding = useCallback(
    async (finding: FindingDoc) => {
      try {
        const question = `Tell me about the inspection finding: ${finding.label}. What should I do?`;
        await sendChatMessage({
          propertyId,
          wizardStep: "close",
          content: question,
        });
        toast.success(
          "Question sent — open Ask AI (bottom-right) for the answer.",
        );
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Couldn't send your question. Try again from the Ask AI panel.",
        );
      }
    },
    [sendChatMessage, propertyId],
  );

  const handleRequestSpecialistConsult = useCallback(
    (finding: FindingDoc) => {
      toast.success(
        `Consultation requested for ${finding.label}. Your broker will reach out.`,
      );
    },
    [],
  );

  const handleDraftRepairAddendum = useCallback(async () => {
    try {
      await sendChatMessage({
        propertyId,
        wizardStep: "close",
        content:
          "Draft a repair request addendum for this inspection based on the broker-approved negotiation summary.",
      });
      toast.success(
        "Drafting started — open Ask AI (bottom-right) for the draft.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Couldn't open the chat — try again from the Ask AI panel.",
      );
    }
  }, [sendChatMessage, propertyId]);

  if (latest === undefined || history === undefined) {
    return (
      <Card className="rounded-4xl border-border">
        <CardContent className="p-8 text-sm text-muted-foreground">
          Loading inspection workspace…
        </CardContent>
      </Card>
    );
  }

  const activePacket: ClosingPacketDoc | null = latest?.packet ?? null;
  const lifeSafetyFindings = (findings ?? []).filter(
    (f) => f.buyerSeverity === "life_safety",
  );

  const showUploadPanel =
    activePacket === null || replacing || activePacket.status === "failed";

  const isProcessing =
    activePacket !== null &&
    (activePacket.status === "uploading" ||
      activePacket.status === "processing");

  const isReady =
    activePacket !== null &&
    (activePacket.status === "ready" ||
      activePacket.status === "partial_failure");

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="inspections-tab-content"
    >
      <InspectionDeadlineCountdown
        inspectionPeriodEnd={inspectionPeriodEnd}
        dealRoomId={dealRoomId}
      />

      {isReady && lifeSafetyFindings.length > 0 && (
        <InspectionLifeSafetyBanner
          findings={lifeSafetyFindings}
          dealRoomId={dealRoomId}
        />
      )}

      {showUploadPanel && (
        <InspectionUploadPanel
          dealRoomId={dealRoomId}
          propertyId={propertyId}
          nextPacketVersion={nextPacketVersion}
          isReplacement={replacing && activePacket !== null}
          onUploadComplete={handleUploadComplete}
          onCancelReplace={() => setReplacing(false)}
        />
      )}

      {!showUploadPanel && isProcessing && activePacket && (
        <Card
          className="rounded-4xl border-border"
          data-testid="inspection-processing-state"
        >
          <CardContent className="flex flex-col gap-4 p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={22}
                  strokeWidth={2}
                  className="animate-spin"
                />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {activePacket.status === "uploading"
                    ? "Uploading inspection…"
                    : "Analyzing your inspection"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {activePacket.status === "uploading"
                    ? "Saving each file to secure storage."
                    : "Usually 30–90 seconds."}
                </p>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
            </div>
            <ul className="flex flex-col gap-2">
              {activePacket.files.map((file) => (
                <li
                  key={file.storageId}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium text-foreground">
                    {file.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {file.status === "done" ? "Ready" : file.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!showUploadPanel && isReady && activePacket && (
        <>
          <InspectionBigTicketTiles facts={inspectionFacts} />

          <InspectionFindingsList
            findings={findings ?? []}
            packetId={activePacket._id}
            packetVersion={activePacket.version}
            dealRoomId={dealRoomId}
            onAskAboutFinding={handleAskAboutFinding}
            onRequestSpecialistConsult={handleRequestSpecialistConsult}
          />

          <InspectionNegotiationSummary
            packet={activePacket}
            dealRoomId={dealRoomId}
            onDraftRepairAddendum={handleDraftRepairAddendum}
          />

          {activePacket.status === "partial_failure" && (
            <Card
              className="rounded-4xl border-amber-200 bg-amber-50"
              data-testid="inspection-partial-failure"
            >
              <CardContent className="flex flex-col gap-3 p-6 sm:p-8">
                <p className="text-sm font-semibold text-amber-900">
                  Some files couldn&apos;t be analyzed
                </p>
                <p className="text-sm text-amber-800">
                  We processed everything we could. Review the file list below
                  and re-upload any that failed.
                </p>
                <ul className="flex flex-col gap-2">
                  {activePacket.files.map((file) => (
                    <li
                      key={file.storageId}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-100/60 px-3 py-2 text-xs text-amber-900"
                    >
                      <span className="truncate font-medium">
                        {file.fileName}
                      </span>
                      <span className="text-amber-800">
                        {file.status === "failed"
                          ? `Failed${file.failureReason ? ` — ${file.failureReason}` : ""}`
                          : file.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-3 rounded-4xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Got an updated inspection report?
              </p>
              <p className="text-xs text-muted-foreground">
                Uploading a new version supersedes the current findings.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setReplacing(true)}
              className="gap-2"
            >
              <HugeiconsIcon
                icon={CloudUploadIcon}
                size={18}
                strokeWidth={2}
              />
              Upload new version
            </Button>
          </div>
        </>
      )}

      {Array.isArray(history) && history.length > 0 && (
        <Card className="rounded-4xl border-border">
          <CardContent className="flex flex-col gap-3 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inspection history
            </p>
            <ul className="flex flex-col gap-2">
              {history.map((p) => (
                <li
                  key={p._id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-foreground">
                    Version {p.version}
                  </span>
                  <span className="text-muted-foreground">{p.status}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card
        className="rounded-4xl border-border bg-muted/30"
        data-testid="inspection-legal-disclaimer"
      >
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-4 sm:p-8">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              size={20}
              strokeWidth={2}
            />
          </span>
          <div className="flex flex-col gap-1">
            <h4 className="font-heading text-base font-semibold text-foreground">
              Inspection analysis is informational only
            </h4>
            <p className="text-sm text-muted-foreground">
              Not a contractor quote. Consult a FL-licensed inspector or
              contractor for binding guidance on any item flagged above.
            </p>
            <p className="text-xs text-muted-foreground">
              buyer-v2 is a licensed Florida real estate brokerage,{" "}
              [Brokerage License #].
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
