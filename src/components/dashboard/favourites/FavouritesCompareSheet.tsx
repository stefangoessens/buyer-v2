"use client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FavouriteForCompare {
  favouriteId: string;
  property: {
    address: { formatted?: string; street?: string; city?: string; state?: string };
    listPrice?: number;
    beds?: number;
    bathsFull?: number;
    bathsHalf?: number;
    sqftLiving?: number;
    yearBuilt?: number;
    photoUrls?: string[];
  } | null;
}

interface FavouritesCompareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  favourites: FavouriteForCompare[];
}

export function FavouritesCompareSheet({ open, onOpenChange, favourites }: FavouritesCompareSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Compare {favourites.length} favourites</SheetTitle>
          <SheetDescription>Side-by-side view of your saved properties</SheetDescription>
        </SheetHeader>
        <ScrollArea className="mt-6 max-h-[calc(100vh-8rem)]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pr-4">
            {favourites.map((fav) => (
              <CompareColumn key={fav.favouriteId} fav={fav} />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function CompareColumn({ fav }: { fav: FavouriteForCompare }) {
  const p = fav.property;
  if (!p) return <div className="text-sm text-muted-foreground">Property unavailable</div>;

  const rows: Array<[string, string]> = [];
  if (p.listPrice) rows.push(["List price", `$${p.listPrice.toLocaleString()}`]);
  if (p.beds != null) rows.push(["Beds", String(p.beds)]);
  const baths = (p.bathsFull ?? 0) + (p.bathsHalf ?? 0) * 0.5;
  if (baths > 0) rows.push(["Baths", String(baths)]);
  if (p.sqftLiving) rows.push(["Sqft", p.sqftLiving.toLocaleString()]);
  if (p.yearBuilt) rows.push(["Year built", String(p.yearBuilt)]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      {p.photoUrls?.[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photoUrls[0]} alt="" className="aspect-video w-full rounded-xl object-cover" />
      ) : (
        <div className="aspect-video w-full rounded-xl bg-muted" />
      )}
      <p className="text-sm font-medium text-foreground line-clamp-2">
        {p.address.formatted || `${p.address.street}, ${p.address.city}, ${p.address.state}`}
      </p>
      <dl className="text-xs space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-border/50 pb-1">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
