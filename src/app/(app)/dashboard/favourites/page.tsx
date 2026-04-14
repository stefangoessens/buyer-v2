import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
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
      <Card>
        <CardContent className="py-16 text-center text-sm text-neutral-500">
          Star properties from any deal room to save them here.
        </CardContent>
      </Card>
    </div>
  );
}
