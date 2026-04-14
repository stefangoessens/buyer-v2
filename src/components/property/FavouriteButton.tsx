"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FavouriteIcon } from "@hugeicons/core-free-icons";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FavouriteButtonProps {
  propertyId: Id<"properties">;
  isAuthenticated: boolean;
}

export function FavouriteButton({
  propertyId,
  isAuthenticated,
}: FavouriteButtonProps) {
  const isFavourite = useQuery(
    api.buyerFavourites.isFavourite,
    isAuthenticated ? { propertyId } : "skip",
  );
  const addFavourite = useMutation(api.buyerFavourites.addFavourite);
  const removeFavourite = useMutation(api.buyerFavourites.removeFavourite);

  if (!isAuthenticated) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/sign-up?next=/property/${propertyId}`}>
          <HugeiconsIcon icon={FavouriteIcon} className="size-4" />
          Save
        </Link>
      </Button>
    );
  }

  const filled = isFavourite === true;

  async function handleClick() {
    if (filled) {
      await removeFavourite({ propertyId });
    } else {
      await addFavourite({ propertyId });
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      aria-pressed={filled}
    >
      <HugeiconsIcon
        icon={FavouriteIcon}
        className={cn("size-4", filled && "fill-primary text-primary")}
      />
      {filled ? "Saved" : "Save"}
    </Button>
  );
}
