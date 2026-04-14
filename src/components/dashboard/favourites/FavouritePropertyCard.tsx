"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import type { FavouriteRow } from "./types";

interface FavouritePropertyCardProps {
  favourite: FavouriteRow;
  isSelected: boolean;
  onToggleSelect: (favouriteId: string) => void;
  isCompareMode: boolean;
}

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatAddress(
  address: NonNullable<FavouriteRow["property"]>["address"],
): string {
  if (address.formatted) return address.formatted;
  const parts = [address.street, address.city, address.state]
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.trim());
  return parts.join(", ") || "Address unavailable";
}

function formatBaths(full?: number, half?: number): string | null {
  const total = (full ?? 0) + (half ?? 0) * 0.5;
  if (total <= 0) return null;
  return Number.isInteger(total) ? `${total} ba` : `${total.toFixed(1)} ba`;
}

function formatSavedDate(createdAt?: string): string {
  if (!createdAt) return "Recently saved";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "Recently saved";
  return `Saved ${dateFormatter.format(d)}`;
}

export function FavouritePropertyCard({
  favourite,
  isSelected,
  onToggleSelect,
  isCompareMode,
}: FavouritePropertyCardProps) {
  const removeFavourite = useMutation(api.buyerFavourites.removeFavourite);
  const [isRemoving, startRemove] = useTransition();

  const property = favourite.property;
  const photo = property?.photoUrls?.[0];
  const address = property
    ? formatAddress(property.address)
    : "Property unavailable";
  const listPrice = property?.listPrice;
  const beds = property?.beds;
  const bathsLabel = formatBaths(property?.bathsFull, property?.bathsHalf);
  const sqft = property?.sqftLiving;

  const propertyHref = property
    ? `/property/${favourite.propertyId}/details`
    : "#";

  const handleRemove = () => {
    if (isRemoving) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Remove this property from your favourites?",
      );
      if (!ok) return;
    }
    startRemove(async () => {
      try {
        await removeFavourite({ propertyId: favourite.propertyId });
      } catch {
        // parent-level toast wiring comes in a follow-up card
      }
    });
  };

  const handleToggleSelect = () => {
    onToggleSelect(favourite.favouriteId);
  };

  return (
    <Card
      size="sm"
      className={cn(
        "group relative gap-3 transition-all",
        isSelected && "ring-2 ring-primary",
      )}
    >
      <Link
        href={propertyHref}
        aria-label={`Open ${address}`}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-t-4xl bg-muted"
      >
        {photo ? (
          <Image
            src={photo}
            alt={address}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No photo
          </div>
        )}
      </Link>

      <div
        className={cn(
          "pointer-events-none absolute top-3 right-3 transition-opacity",
          isCompareMode || isSelected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        )}
      >
        <label
          className="pointer-events-auto flex size-7 cursor-pointer items-center justify-center rounded-full bg-background/95 shadow-sm ring-1 ring-foreground/10 backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleToggleSelect}
            aria-label={`Select ${address} to compare`}
          />
        </label>
      </div>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-foreground">
            {listPrice != null ? priceFormatter.format(listPrice) : "—"}
          </p>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {address}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {beds != null ? <dd>{beds} bd</dd> : null}
          {bathsLabel ? <dd>{bathsLabel}</dd> : null}
          {sqft ? <dd>{sqft.toLocaleString()} sqft</dd> : null}
        </dl>

        <p className="text-xs text-muted-foreground">
          {formatSavedDate(favourite.createdAt)}
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link href={propertyHref}>Open</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleRemove}
            disabled={isRemoving}
          >
            {isRemoving ? "Removing…" : "Remove"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
