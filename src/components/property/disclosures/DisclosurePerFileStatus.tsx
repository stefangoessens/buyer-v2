"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  CancelCircleIcon,
} from "@hugeicons/core-free-icons";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type PacketFile = Doc<"disclosurePackets">["files"][number];

interface DisclosurePerFileStatusProps {
  files: PacketFile[];
}

const STATUS_COPY: Record<PacketFile["status"], string> = {
  pending: "Queued",
  ocr: "Extracting text…",
  parsing: "Analyzing…",
  done: "Ready",
  failed: "Failed",
};

export function DisclosurePerFileStatus({
  files,
}: DisclosurePerFileStatusProps) {
  if (files.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2" data-testid="disclosure-per-file-status">
      {files.map((file) => (
        <li
          key={file.storageId}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-sm"
        >
          <StatusIndicator status={file.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">
              {file.fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {STATUS_COPY[file.status]}
              {file.status === "failed" && file.failureReason
                ? ` — ${file.failureReason}`
                : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusIndicator({ status }: { status: PacketFile["status"] }) {
  if (status === "done") {
    return (
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          size={16}
          strokeWidth={2}
        />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
      >
        <HugeiconsIcon icon={CancelCircleIcon} size={16} strokeWidth={2} />
      </span>
    );
  }
  const pulsing = status === "ocr" || status === "parsing";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          pulsing ? "animate-pulse bg-primary" : "bg-muted-foreground/50",
        )}
      />
    </span>
  );
}
