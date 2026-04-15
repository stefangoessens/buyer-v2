"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { trackDisclosureEvent } from "@/lib/analytics/disclosure-events";
import { DisclosurePerFileStatus } from "./DisclosurePerFileStatus";

type PacketDoc = Doc<"disclosurePackets">;

interface DisclosureProcessingStateProps {
  packet: PacketDoc;
  propertyId: string;
}

const LONG_PROCESSING_THRESHOLD_MS = 2 * 60 * 1000;

export function DisclosureProcessingState({
  packet,
  propertyId,
}: DisclosureProcessingStateProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const processingStartRef = useRef<number | null>(null);
  const startedEventFiredRef = useRef(false);
  const completedEventFiredRef = useRef(false);
  const failedEventFiredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (packet.status !== "processing" && packet.status !== "uploading") {
      processingStartRef.current = null;
      setElapsedMs(0);
      return;
    }
    if (processingStartRef.current === null) {
      processingStartRef.current = Date.now();
    }
    const tick = () => {
      if (processingStartRef.current === null) return;
      setElapsedMs(Date.now() - processingStartRef.current);
    };
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [packet.status]);

  useEffect(() => {
    if (
      packet.status === "processing" &&
      !startedEventFiredRef.current
    ) {
      startedEventFiredRef.current = true;
      trackDisclosureEvent("PROCESSING_STARTED", {
        dealRoomId: packet.dealRoomId,
        propertyId,
        packetId: packet._id,
        packetVersion: packet.version,
        fileCount: packet.files.length,
      });
    }
    if (
      (packet.status === "ready" || packet.status === "partial_failure") &&
      !completedEventFiredRef.current
    ) {
      completedEventFiredRef.current = true;
      const elapsedSec = Math.round(elapsedMs / 1000);
      trackDisclosureEvent("PROCESSING_COMPLETED", {
        dealRoomId: packet.dealRoomId,
        propertyId,
        packetId: packet._id,
        packetVersion: packet.version,
        status: packet.status,
        elapsedSec,
      });
    }
    if (packet.status === "failed" && !failedEventFiredRef.current.has("packet")) {
      failedEventFiredRef.current.add("packet");
      trackDisclosureEvent("PROCESSING_FAILED", {
        dealRoomId: packet.dealRoomId,
        propertyId,
        packetId: packet._id,
        packetVersion: packet.version,
        errorKind: "packet_failed",
      });
    }
    for (const file of packet.files) {
      if (
        file.status === "failed" &&
        !failedEventFiredRef.current.has(file.storageId)
      ) {
        failedEventFiredRef.current.add(file.storageId);
        trackDisclosureEvent("PROCESSING_FAILED", {
          dealRoomId: packet.dealRoomId,
          propertyId,
          packetId: packet._id,
          packetVersion: packet.version,
          errorKind: "file_failed",
          fileName: file.fileName,
          failureReason: file.failureReason,
        });
      }
    }
  }, [packet, propertyId, elapsedMs]);

  if (packet.status === "failed") {
    return (
      <Card className="rounded-4xl border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col gap-4 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <HugeiconsIcon
                icon={AlertCircleIcon}
                size={22}
                strokeWidth={2}
              />
            </span>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Packet couldn&apos;t be processed
              </h3>
              <p className="text-sm text-muted-foreground">
                Something broke while analyzing this packet. Try uploading it
                again.
              </p>
            </div>
          </div>
          <DisclosurePerFileStatus files={packet.files} />
        </CardContent>
      </Card>
    );
  }

  const isUploading = packet.status === "uploading";
  const isStuck = elapsedMs >= LONG_PROCESSING_THRESHOLD_MS;

  return (
    <Card className="rounded-4xl border-border" data-testid="disclosure-processing-state">
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
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
              {isUploading ? "Uploading…" : "Analyzing your packet"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isUploading
                ? "Saving each file to secure storage."
                : "Usually 30–90 seconds"}
            </p>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
        </div>

        <DisclosurePerFileStatus files={packet.files} />

        {isStuck && (
          <p className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
            Still working — you can close this tab and come back later.
            Findings will be ready when you return.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
