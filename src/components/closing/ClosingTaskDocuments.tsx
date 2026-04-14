"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Attachment01Icon,
  Delete02Icon,
  Download04Icon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const generateUploadUrl = useMutation(
    api.closeTaskDocuments.generateUploadUrl,
  );
  const createDoc = useMutation(api.closeTaskDocuments.create);
  const removeDoc = useMutation(api.closeTaskDocuments.remove);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [visibility, setVisibility] = useState<
    "buyer_visible" | "internal_only"
  >("buyer_visible");

  const isStaff = viewerLevel === "broker" || viewerLevel === "admin";

  const handleRemove = async (documentId: Id<"closeTaskDocuments">) => {
    if (!isStaff) return;
    try {
      await removeDoc({ documentId });
      toast.success("Document deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to delete document",
      );
    }
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected later.
    e.target.value = "";

    const effectiveVisibility = isStaff ? visibility : "buyer_visible";

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ taskId });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!result.ok) {
        throw new Error(`Upload failed (${result.status})`);
      }
      const { storageId } = (await result.json()) as {
        storageId: Id<"_storage">;
      };
      await createDoc({
        taskId,
        storageId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        visibility: effectiveVisibility,
      });
      trackClosingEvent("TASK_DOCUMENT_UPLOADED", {
        taskId,
        dealRoomId,
        visibility: effectiveVisibility,
      });
      toast.success("Document attached");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to upload document",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
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
          {docs.map((doc) => {
            const hasDownload = doc.downloadUrl !== null;
            return (
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
                  {hasDownload ? (
                    <a
                      href={doc.downloadUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {doc.fileName}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-medium text-muted-foreground">
                      {doc.fileName}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(doc.sizeBytes)} ·{" "}
                    {doc.visibility === "internal_only"
                      ? "Internal only"
                      : "Visible to buyer"}
                  </p>
                </div>
                {hasDownload ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                  >
                    <a
                      href={doc.downloadUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Download ${doc.fileName}`}
                    >
                      <HugeiconsIcon
                        icon={Download04Icon}
                        size={16}
                        strokeWidth={2}
                      />
                    </a>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled
                    aria-label={`${doc.fileName} unavailable`}
                    className="text-muted-foreground"
                    title="File unavailable"
                  >
                    <HugeiconsIcon
                      icon={Download04Icon}
                      size={16}
                      strokeWidth={2}
                    />
                  </Button>
                )}
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
            );
          })}
        </ul>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <div className="flex items-center gap-2">
        {isStaff && (
          <Select
            value={visibility}
            onValueChange={(v) =>
              setVisibility(v as "buyer_visible" | "internal_only")
            }
            disabled={uploading}
          >
            <SelectTrigger className="h-9 w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="buyer_visible">Visible to buyer</SelectItem>
              <SelectItem value="internal_only">Internal only</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleAttachClick}
          disabled={uploading}
          className="flex-1"
        >
          <HugeiconsIcon
            icon={Attachment01Icon}
            size={16}
            strokeWidth={2}
          />
          {uploading ? "Uploading…" : "Attach document"}
        </Button>
      </div>
    </div>
  );
}
