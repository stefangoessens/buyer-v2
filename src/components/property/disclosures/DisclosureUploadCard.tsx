"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useMutation } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Camera02Icon,
  CloudUploadIcon,
  Delete02Icon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { trackDisclosureEvent } from "@/lib/analytics/disclosure-events";

const PER_FILE_MAX_BYTES = 20 * 1024 * 1024;
const PACKET_MAX_BYTES = 100 * 1024 * 1024;
const COMPRESSION_TRIGGER_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

type UploadErrorKind =
  | "size_exceeded"
  | "invalid_mime"
  | "hash_failed"
  | "upload_http_error"
  | "commit_failed";

interface DisclosureUploadCardProps {
  dealRoomId: Id<"dealRooms">;
  propertyId: string;
  nextPacketVersion: number;
  isReplacement?: boolean;
  onUploadComplete?: (result: { wasDuplicate: boolean }) => void;
  onCancelReplace?: () => void;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (ev: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(ev.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function sha256HexOfFile(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= COMPRESSION_TRIGGER_BYTES) return file;
  if (typeof document === "undefined") return file;
  try {
    const imageUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image decode failed"));
        el.src = imageUrl;
      });
      const scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / Math.max(img.width, img.height),
      );
      const targetWidth = Math.round(img.width * scale);
      const targetHeight = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const gfx = canvas.getContext("2d");
      if (!gfx) return file;
      gfx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(
          (b) => resolve(b),
          "image/jpeg",
          0.85,
        ),
      );
      if (!blob) return file;
      const renamed = file.name.replace(/\.(png|jpe?g)$/i, ".jpg");
      return new File([blob], renamed, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  } catch {
    return file;
  }
}

interface PendingFile {
  id: string;
  file: File;
  sizeLabel: string;
}

export function DisclosureUploadCard({
  dealRoomId,
  propertyId,
  nextPacketVersion,
  isReplacement = false,
  onUploadComplete,
  onCancelReplace,
}: DisclosureUploadCardProps) {
  const isMobile = useIsMobile();
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.disclosures.generateUploadUrl);
  const commitUpload = useMutation(api.disclosures.commitUpload);

  const totalBytes = useMemo(
    () => pending.reduce((sum, p) => sum + p.file.size, 0),
    [pending],
  );

  const fireError = useCallback(
    (kind: UploadErrorKind, message: string) => {
      setError(message);
      trackDisclosureEvent("UPLOAD_ERROR", {
        dealRoomId,
        propertyId,
        packetVersion: nextPacketVersion,
        kind,
      });
    },
    [dealRoomId, propertyId, nextPacketVersion],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setError(null);
      const list = Array.from(incoming);
      const accepted: PendingFile[] = [];
      let rejected: UploadErrorKind | null = null;
      let rejectedMessage = "";

      for (const f of list) {
        if (!ALLOWED_MIME_TYPES.has(f.type)) {
          rejected = "invalid_mime";
          rejectedMessage = `${f.name} is not a supported file type. Upload PDF, JPEG, or PNG.`;
          continue;
        }
        if (f.size <= 0 || f.size > PER_FILE_MAX_BYTES) {
          rejected = "size_exceeded";
          rejectedMessage = `${f.name} exceeds the 20 MB per-file limit.`;
          continue;
        }
        accepted.push({
          id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          sizeLabel: formatBytes(f.size),
        });
      }

      const nextTotal =
        totalBytes + accepted.reduce((sum, p) => sum + p.file.size, 0);
      if (nextTotal > PACKET_MAX_BYTES) {
        fireError(
          "size_exceeded",
          "Total packet size exceeds the 100 MB limit. Remove a file or split the upload.",
        );
        return;
      }

      if (accepted.length > 0) {
        setPending((prev) => [...prev, ...accepted]);
      }
      if (rejected) {
        fireError(rejected, rejectedMessage);
      }
    },
    [totalBytes, fireError],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        addFiles(files);
      }
      event.target.value = "";
    },
    [addFiles],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleUpload = useCallback(async () => {
    if (pending.length === 0 || uploading) return;
    setError(null);
    setUploading(true);
    trackDisclosureEvent("UPLOAD_STARTED", {
      dealRoomId,
      propertyId,
      packetVersion: nextPacketVersion,
      fileCount: pending.length,
      totalBytes,
    });

    try {
      const committed: Array<{
        storageId: Id<"_storage">;
        fileName: string;
        fileHash: string;
        byteSize: number;
        mimeType: string;
      }> = [];

      for (const p of pending) {
        const prepared = await maybeCompressImage(p.file);

        let fileHash: string;
        try {
          fileHash = await sha256HexOfFile(prepared);
        } catch {
          fireError(
            "hash_failed",
            `Could not hash ${p.file.name}. Try again or pick a different file.`,
          );
          setUploading(false);
          return;
        }

        const { uploadUrl } = await generateUploadUrl({
          dealRoomId,
          packetVersion: nextPacketVersion,
          fileName: prepared.name,
          byteSize: prepared.size,
          mimeType: prepared.type,
        });

        const postResult = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": prepared.type || "application/octet-stream",
          },
          body: prepared,
        });
        if (!postResult.ok) {
          fireError(
            "upload_http_error",
            `Upload failed for ${p.file.name} (HTTP ${postResult.status}).`,
          );
          setUploading(false);
          return;
        }
        const { storageId } = (await postResult.json()) as {
          storageId: Id<"_storage">;
        };

        committed.push({
          storageId,
          fileName: prepared.name,
          fileHash,
          byteSize: prepared.size,
          mimeType: prepared.type,
        });
      }

      const commitResult = await commitUpload({
        dealRoomId,
        packetVersion: nextPacketVersion,
        files: committed,
      });

      trackDisclosureEvent("UPLOAD_COMPLETED", {
        dealRoomId,
        propertyId,
        packetVersion: nextPacketVersion,
        fileCount: committed.length,
        totalBytes: committed.reduce((sum, f) => sum + f.byteSize, 0),
        wasDuplicate: commitResult.wasDuplicate,
      });

      if (isReplacement) {
        trackDisclosureEvent("PACKET_REPLACED", {
          dealRoomId,
          propertyId,
          packetVersion: nextPacketVersion,
        });
      }

      setPending([]);
      onUploadComplete?.({ wasDuplicate: commitResult.wasDuplicate });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to upload packet.";
      fireError("commit_failed", message);
    } finally {
      setUploading(false);
    }
  }, [
    pending,
    uploading,
    totalBytes,
    dealRoomId,
    propertyId,
    nextPacketVersion,
    generateUploadUrl,
    commitUpload,
    isReplacement,
    onUploadComplete,
    fireError,
  ]);

  const openFilePicker = () => fileInputRef.current?.click();
  const openCameraPicker = () => cameraInputRef.current?.click();

  const headlineId = "disclosure-upload-heading";

  return (
    <Card className="rounded-4xl border-border" data-testid="disclosure-upload-card">
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isReplacement ? "Upload new version" : "Seller disclosures"}
          </p>
          <h2
            id={headlineId}
            className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            {isReplacement
              ? "Replace the packet"
              : "Upload the disclosure packet"}
          </h2>
          <p className="text-sm text-muted-foreground">
            PDFs or photos of every disclosure the seller shared. We&apos;ll
            extract the text, surface red flags, and explain each one in plain
            English.
          </p>
        </div>

        <div
          role="presentation"
          aria-labelledby={headlineId}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors",
            dragActive && "border-primary bg-primary/5",
          )}
          data-testid="disclosure-drop-zone"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={CloudUploadIcon}
              size={28}
              strokeWidth={2}
            />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-base font-medium text-foreground">
              {isMobile ? "Add the packet from your phone" : "Drag PDFs or photos here"}
            </p>
            <p className="text-xs text-muted-foreground">
              Up to 20 MB per file, 100 MB per packet. PDF, JPEG, or PNG.
            </p>
          </div>
          <div
            className={cn(
              "flex w-full flex-col gap-2",
              !isMobile && "sm:flex-row sm:justify-center",
            )}
          >
            {isMobile && (
              <Button
                type="button"
                size="lg"
                onClick={openCameraPicker}
                className="gap-2"
              >
                <HugeiconsIcon
                  icon={Camera02Icon}
                  size={18}
                  strokeWidth={2}
                />
                Take photo
              </Button>
            )}
            <Button
              type="button"
              variant={isMobile ? "outline" : "default"}
              size="lg"
              onClick={openFilePicker}
              className="gap-2"
            >
              <HugeiconsIcon icon={File01Icon} size={18} strokeWidth={2} />
              Choose files
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            onChange={handleFileInputChange}
            data-testid="disclosure-file-input"
          />
          <input
            ref={cameraInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={handleFileInputChange}
            data-testid="disclosure-camera-input"
          />
        </div>

        {pending.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {pending.length} file{pending.length === 1 ? "" : "s"} ready —{" "}
                {formatBytes(totalBytes)}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <HugeiconsIcon
                    icon={File01Icon}
                    size={16}
                    strokeWidth={2}
                    className="text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {p.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.sizeLabel}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePending(p.id)}
                    disabled={uploading}
                    aria-label={`Remove ${p.file.name}`}
                    className="text-muted-foreground"
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      size={16}
                      strokeWidth={2}
                    />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {isReplacement && onCancelReplace && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={onCancelReplace}
              disabled={uploading}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            onClick={handleUpload}
            disabled={pending.length === 0 || uploading}
            className="gap-2"
          >
            <HugeiconsIcon
              icon={CloudUploadIcon}
              size={18}
              strokeWidth={2}
            />
            {uploading
              ? "Uploading…"
              : isReplacement
                ? "Upload new version"
                : "Analyze packet"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
