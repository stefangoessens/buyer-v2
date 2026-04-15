"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon } from "@hugeicons/core-free-icons";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { DisclosureUploadCard } from "./DisclosureUploadCard";
import { DisclosureProcessingState } from "./DisclosureProcessingState";
import { DisclosureFindingsList } from "./DisclosureFindingsList";
import { DisclosurePacketHistory } from "./DisclosurePacketHistory";
import { DisclosureLegalDisclaimer } from "./DisclosureLegalDisclaimer";
import { DisclosurePerFileStatus } from "./DisclosurePerFileStatus";

type FindingDoc = Doc<"fileAnalysisFindings">;

interface DisclosuresClientProps {
  dealRoomId: Id<"dealRooms">;
  propertyId: string;
}

export function DisclosuresClient({
  dealRoomId,
  propertyId,
}: DisclosuresClientProps) {
  const latest = useQuery(api.disclosures.getLatestPacket, { dealRoomId });
  const history = useQuery(api.disclosures.listPacketHistory, { dealRoomId });
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

  const handleAskAboutFinding = useCallback(
    async (finding: FindingDoc) => {
      try {
        const question = `Tell me about the finding: ${finding.label}. What should I do?`;
        await sendChatMessage({
          propertyId: propertyId as Id<"properties">,
          wizardStep: "disclosures",
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

  const handleUploadComplete = useCallback(
    ({ wasDuplicate }: { wasDuplicate: boolean }) => {
      setReplacing(false);
      if (wasDuplicate) {
        toast.info(
          "This packet has already been analyzed — showing existing findings.",
        );
      } else {
        toast.success("Packet received — analyzing now.");
      }
    },
    [],
  );

  if (latest === undefined || history === undefined) {
    return (
      <Card className="rounded-4xl border-border">
        <CardContent className="p-8 text-sm text-muted-foreground">
          Loading disclosures…
        </CardContent>
      </Card>
    );
  }

  const activePacket = latest?.packet ?? null;
  const findings = latest?.findings ?? [];
  const historyPackets = history ?? [];

  const showUpload =
    activePacket === null ||
    replacing ||
    activePacket.status === "failed";

  const isProcessing =
    activePacket !== null &&
    (activePacket.status === "uploading" ||
      activePacket.status === "processing");

  const isReady =
    activePacket !== null &&
    (activePacket.status === "ready" ||
      activePacket.status === "partial_failure");

  return (
    <div className="flex flex-col gap-6">
      {showUpload && (
        <DisclosureUploadCard
          dealRoomId={dealRoomId}
          propertyId={propertyId}
          nextPacketVersion={nextPacketVersion}
          isReplacement={replacing && activePacket !== null}
          onUploadComplete={handleUploadComplete}
          onCancelReplace={() => setReplacing(false)}
        />
      )}

      {!showUpload && isProcessing && activePacket && (
        <DisclosureProcessingState
          packet={activePacket}
          propertyId={propertyId}
        />
      )}

      {!showUpload && isReady && activePacket && (
        <>
          <DisclosureFindingsList
            findings={findings}
            packetId={activePacket._id}
            packetVersion={activePacket.version}
            dealRoomId={dealRoomId}
            propertyId={propertyId}
            onAskAboutFinding={handleAskAboutFinding}
          />

          {activePacket.status === "partial_failure" && (
            <Card className="rounded-4xl border-amber-200 bg-amber-50">
              <CardContent className="flex flex-col gap-4 p-6 sm:p-8">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Some files couldn&apos;t be analyzed
                  </p>
                  <p className="mt-1 text-sm text-amber-800">
                    We processed everything we could. Review the file list
                    below and re-upload any that failed.
                  </p>
                </div>
                <DisclosurePerFileStatus files={activePacket.files} />
              </CardContent>
            </Card>
          )}

          {(activePacket.status === "ready" ||
            activePacket.status === "partial_failure") && (
            <div className="flex flex-col gap-3 rounded-4xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Got a newer packet?
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
          )}
        </>
      )}

      {historyPackets.length > 0 && (
        <DisclosurePacketHistory packets={historyPackets} />
      )}

      <DisclosureLegalDisclaimer />
    </div>
  );
}
