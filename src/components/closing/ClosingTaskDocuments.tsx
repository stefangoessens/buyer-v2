"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Attachment01Icon,
  Delete02Icon,
  Download04Icon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { trackClosingEvent } from "@/lib/analytics/closing-events";

interface ClosingTaskDocumentsProps {
  taskId: Id<"closeTasks">;
  viewerLevel: "buyer" | "broker" | "admin";
  dealRoomId: Id<"dealRooms">;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClosingTaskDocuments({
  taskId,
  viewerLevel,
  dealRoomId,
}: ClosingTaskDocumentsProps) {
  const docs = useQuery(api.closeTaskDocuments.listByTaskId, { taskId });
  const removeDoc = useMutation(api.closeTaskDocuments.remove);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isStaff = viewerLevel === "broker" || viewerLevel === "admin";

  const handleRemove = async (documentId: Id<"closeTaskDocuments">) => {
    if (!isStaff) return;
    try {
      await removeDoc({ documentId });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to delete");
    }
  };

  const handleUploadStub = () => {
    setErrorMsg(
      "Uploads are temporarily handled by your broker — drop the file in chat and we'll attach it here.",
    );
    trackClosingEvent("TASK_DOCUMENT_UPLOADED", {
      taskId,
      dealRoomId,
      stubbed: true,
    });
  };

  if (docs === undefined) {
    return (
      <p className="text-xs text-muted-foreground">Loading documents…</p>
    );
  }

  return (
    <div className="space-y-3">
      {docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No documents attached yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li
              key={doc._id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2"
            >
              <HugeiconsIcon
                icon={Attachment01Icon}
                size={16}
                strokeWidth={2}
                className="text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {doc.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(doc.sizeBytes)} ·{" "}
                  {doc.visibility === "internal_only"
                    ? "Internal only"
                    : "Visible to buyer"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Download ${doc.fileName}`}
                className="text-muted-foreground"
                disabled
                title="Download coming soon"
              >
                <HugeiconsIcon
                  icon={Download04Icon}
                  size={16}
                  strokeWidth={2}
                />
              </Button>
              {isStaff && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${doc.fileName}`}
                  onClick={() => handleRemove(doc._id)}
                  className="text-destructive"
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={16}
                    strokeWidth={2}
                  />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={handleUploadStub}
        className="w-full"
      >
        <HugeiconsIcon
          icon={Attachment01Icon}
          size={16}
          strokeWidth={2}
        />
        Attach document
      </Button>
      {errorMsg && (
        <p className="text-xs text-muted-foreground">{errorMsg}</p>
      )}
    </div>
  );
}
