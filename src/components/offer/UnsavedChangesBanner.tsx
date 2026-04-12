// Sticky banner that surfaces dirty / saving state for the offer draft with discard + save actions.
"use client";

import { Button } from "@/components/ui/button";

interface UnsavedChangesBannerProps {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  onSave: () => void;
  onDiscard: () => void;
}

function formatLastSaved(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}

export function UnsavedChangesBanner({
  dirty,
  saving,
  lastSavedAt,
  onSave,
  onDiscard,
}: UnsavedChangesBannerProps) {
  if (!dirty && !saving) {
    return null;
  }

  const primaryLabel = dirty ? "Unsaved changes" : "Saving…";
  const formattedTime = formatLastSaved(lastSavedAt);
  const subLine = formattedTime ? `Last saved ${formattedTime}` : "Not yet saved";

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div>
        <p className="text-sm font-medium text-neutral-900">{primaryLabel}</p>
        <p className="text-xs text-neutral-500">{subLine}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={saving}
        >
          Discard
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onSave}
          disabled={saving}
        >
          Save draft
        </Button>
      </div>
    </div>
  );
}
