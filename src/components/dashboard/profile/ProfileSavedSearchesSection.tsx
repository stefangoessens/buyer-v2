"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type SavedSearchCriteria = {
  preferredAreas: string[];
  propertyTypes?: string[];
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  bathsMin?: number;
  yearBuiltMin?: number;
  mustHaves?: string[];
};

type SavedSearch = {
  id: string;
  name: string;
  criteria: SavedSearchCriteria;
  createdAt: string;
  lastRunAt?: string;
};

type ProfileWithSavedSearches = {
  savedSearches?: SavedSearch[];
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function parseZips(input: string): string[] {
  return input
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{5}$/.test(s));
}

function formatPriceRange(min?: number, max?: number): string | null {
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined) {
    return `${currencyFormatter.format(min)} – ${currencyFormatter.format(max)}`;
  }
  if (min !== undefined) return `From ${currencyFormatter.format(min)}`;
  return `Up to ${currencyFormatter.format(max!)}`;
}

export function ProfileSavedSearchesSection() {
  const profile = useQuery(api.buyerProfiles.getMyProfile, {}) as
    | (ProfileWithSavedSearches & Record<string, unknown>)
    | null
    | undefined;
  const addSavedSearch = useMutation(api.buyerProfiles.addSavedSearch);
  const removeSavedSearch = useMutation(api.buyerProfiles.removeSavedSearch);

  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [zipsInput, setZipsInput] = useState("");
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const savedSearches = profile?.savedSearches ?? [];
  const isLoading = profile === undefined;

  const resetForm = () => {
    setName("");
    setZipsInput("");
    setPriceMinInput("");
    setPriceMaxInput("");
    setError(null);
  };

  const handleAdd = () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give your search a name.");
      return;
    }
    const zips = parseZips(zipsInput);
    if (zips.length === 0) {
      setError("Add at least one 5-digit ZIP.");
      return;
    }
    const priceMin = priceMinInput ? Number(priceMinInput) : undefined;
    const priceMax = priceMaxInput ? Number(priceMaxInput) : undefined;
    if (priceMin !== undefined && Number.isNaN(priceMin)) {
      setError("Min price must be a number.");
      return;
    }
    if (priceMax !== undefined && Number.isNaN(priceMax)) {
      setError("Max price must be a number.");
      return;
    }
    if (
      priceMin !== undefined &&
      priceMax !== undefined &&
      priceMin > priceMax
    ) {
      setError("Min price can't exceed max.");
      return;
    }

    startTransition(async () => {
      try {
        await addSavedSearch({
          name: trimmedName,
          criteria: {
            preferredAreas: zips,
            ...(priceMin !== undefined ? { priceMin } : {}),
            ...(priceMax !== undefined ? { priceMax } : {}),
          },
        });
        resetForm();
        setDialogOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save search.");
      }
    });
  };

  const handleRemove = (id: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Delete this saved search? This can't be undone.",
      );
      if (!ok) return;
    }
    startTransition(async () => {
      try {
        await removeSavedSearch({ id });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete search.");
      }
    });
  };

  return (
    <Card id="saved-searches">
      <CardHeader>
        <CardTitle>Saved searches</CardTitle>
        <CardDescription>
          Quick filters you&apos;ve pinned for your home hunt.
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                Add saved search
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New saved search</DialogTitle>
                <DialogDescription>
                  Pin a name + ZIPs + price range so you can rerun it anytime.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="saved-search-name">Name</Label>
                  <Input
                    id="saved-search-name"
                    placeholder="Wynwood condos"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="saved-search-zips">ZIP codes</Label>
                  <Input
                    id="saved-search-zips"
                    placeholder="33127, 33136"
                    value={zipsInput}
                    onChange={(e) => setZipsInput(e.target.value)}
                    autoComplete="off"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma- or space-separated, 5 digits each.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="saved-search-price-min">Min price</Label>
                    <Input
                      id="saved-search-price-min"
                      placeholder="350000"
                      value={priceMinInput}
                      onChange={(e) => setPriceMinInput(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="saved-search-price-max">Max price</Label>
                    <Input
                      id="saved-search-price-max"
                      placeholder="650000"
                      value={priceMaxInput}
                      onChange={(e) => setPriceMaxInput(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </div>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetForm();
                    setDialogOpen(false);
                  }}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={isPending}>
                  {isPending ? "Saving…" : "Save search"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <div className="rounded-3xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            Loading saved searches…
          </div>
        ) : savedSearches.length === 0 ? (
          <div className="rounded-3xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            No saved searches yet. Pin one to come back to it later.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {savedSearches.map((search) => {
              const priceLabel = formatPriceRange(
                search.criteria.priceMin,
                search.criteria.priceMax,
              );
              return (
                <li
                  key={search.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {search.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      ZIPs {search.criteria.preferredAreas.join(", ") || "—"}
                      {priceLabel ? ` · ${priceLabel}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/dashboard/favourites?savedSearch=${encodeURIComponent(search.id)}`}
                      >
                        Run
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemove(search.id)}
                      disabled={isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {error && savedSearches.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm text-destructive">{error}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
