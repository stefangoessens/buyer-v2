import type { Metadata } from "next";
import { FavouritesGrid } from "@/components/dashboard/favourites/FavouritesGrid";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("dashboardFavourites");

export default function FavouritesPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Favourites
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Saved properties
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Your starred deal rooms and saved searches.
        </p>
      </header>
      <FavouritesGrid />
    </div>
  );
}
