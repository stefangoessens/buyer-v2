"use client";

import { Button } from "@/components/ui/button";

interface FavouritesToolbarProps {
  totalCount: number;
  selectedCount: number;
  onOpenCompare: () => void;
  onClearSelection: () => void;
}

const MIN_COMPARE = 2;
const MAX_COMPARE = 4;

export function FavouritesToolbar({
  totalCount,
  selectedCount,
  onOpenCompare,
  onClearSelection,
}: FavouritesToolbarProps) {
  const canCompare = selectedCount >= MIN_COMPARE && selectedCount <= MAX_COMPARE;
  const helpText =
    selectedCount === 0
      ? `Select ${MIN_COMPARE}–${MAX_COMPARE} properties to compare side-by-side.`
      : selectedCount === 1
        ? `Pick one more to compare (up to ${MAX_COMPARE}).`
        : selectedCount > MAX_COMPARE
          ? `Compare supports up to ${MAX_COMPARE} properties.`
          : `Ready to compare ${selectedCount} favourites.`;

  return (
    <div className="sticky top-0 z-20 -mx-2 flex flex-col gap-3 rounded-4xl bg-background/80 px-4 py-3 shadow-sm ring-1 ring-foreground/5 backdrop-blur sm:-mx-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-foreground">
          {totalCount} {totalCount === 1 ? "favourite" : "favourites"}
        </p>
        <p className="text-xs text-muted-foreground">{helpText}</p>
      </div>
      <div className="flex items-center gap-2">
        {selectedCount > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            aria-label="Clear selection"
          >
            Clear
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={onOpenCompare}
          disabled={!canCompare}
          aria-label={
            canCompare
              ? `Compare ${selectedCount} favourites`
              : "Compare unavailable"
          }
        >
          Compare{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
      </div>
    </div>
  );
}
