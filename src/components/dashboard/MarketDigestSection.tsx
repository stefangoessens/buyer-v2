"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MarketDigestListing = {
  address?: string;
  price?: number;
};

export function MarketDigestSection() {
  const digest = useQuery(api.dashboardMarketDigest.getMarketDigest, {});

  if (digest === undefined) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Weekly market digest
      </h2>
      {digest.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No favourites yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Save searches and favourite areas to get a weekly digest of new
              listings matching your criteria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(digest as MarketDigestListing[]).map((listing, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{listing.address}</p>
                <p className="text-xs text-muted-foreground">
                  ${listing.price?.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
