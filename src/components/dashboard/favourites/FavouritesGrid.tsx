"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { PasteLinkCTA } from "@/components/dealroom/PasteLinkCTA";
import { FavouritesCompareSheet } from "./FavouritesCompareSheet";

import { FavouritePropertyCard } from "./FavouritePropertyCard";
import { FavouritesToolbar } from "./FavouritesToolbar";
import type { FavouriteRow } from "./types";

const MAX_COMPARE = 4;

export function FavouritesGrid() {
  const favourites = useQuery(api.buyerFavourites.listFavourites, {});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const handleToggleSelect = useCallback((favouriteId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(favouriteId)) {
        next.delete(favouriteId);
        return next;
      }
      if (next.size >= MAX_COMPARE) return prev;
      next.add(favouriteId);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleOpenCompare = useCallback(() => {
    if (selectedIds.size < 2) return;
    setIsCompareOpen(true);
  }, [selectedIds.size]);

  const selectedFavourites = useMemo<FavouriteRow[]>(() => {
    if (!favourites) return [];
    return favourites.filter((f) => selectedIds.has(f.favouriteId));
  }, [favourites, selectedIds]);

  if (favourites === undefined) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Loading your favourites…
        </CardContent>
      </Card>
    );
  }

  if (favourites.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-base font-semibold text-foreground">
              No saved properties yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Star any listing from a deal room to save it here, or paste a
              link below to analyze something new.
            </p>
          </CardContent>
        </Card>
        <PasteLinkCTA />
      </div>
    );
  }

  const isCompareMode = selectedIds.size > 0;

  return (
    <div className="flex flex-col gap-6">
      <FavouritesToolbar
        totalCount={favourites.length}
        selectedCount={selectedIds.size}
        onOpenCompare={handleOpenCompare}
        onClearSelection={handleClearSelection}
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {favourites.map((favourite) => (
          <FavouritePropertyCard
            key={favourite.favouriteId}
            favourite={favourite}
            isSelected={selectedIds.has(favourite.favouriteId)}
            onToggleSelect={handleToggleSelect}
            isCompareMode={isCompareMode}
          />
        ))}
      </div>
      <FavouritesCompareSheet
        open={isCompareOpen}
        onOpenChange={setIsCompareOpen}
        favourites={selectedFavourites}
      />
    </div>
  );
}
