"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardDealRoomTile } from "@/lib/dealroom/dashboard-types";
import { DealRoomGrid } from "./DealRoomGrid";
import { EmptyDashboardState } from "./EmptyDashboardState";
import { PasteLinkCTA } from "./PasteLinkCTA";

type DealIndexRow = {
  dealRoomId: string;
  propertyId: string;
  status:
    | "intake"
    | "analysis"
    | "tour_scheduled"
    | "offer_prep"
    | "offer_sent"
    | "under_contract"
    | "closing"
    | "closed"
    | "withdrawn";
  category: "active" | "recent";
  addressLine: string;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  primaryPhotoUrl: string | null;
  accessLevel: "anonymous" | "registered" | "full";
  updatedAt: string;
  hydrated: boolean;
};

type DealIndex = {
  active: DealIndexRow[];
  recent: DealIndexRow[];
  summary: {
    activeCount: number;
    recentCount: number;
    hasAnyDeals: boolean;
  };
};

function mapRowToTile(row: DealIndexRow): DashboardDealRoomTile {
  return {
    dealRoomId: row.dealRoomId,
    propertyId: row.propertyId,
    address: row.addressLine,
    city: "",
    state: "FL",
    listPrice: row.listPrice ?? 0,
    beds: row.beds ?? 0,
    baths: row.baths ?? 0,
    sqft: row.sqft ?? 0,
    photoUrl: row.primaryPhotoUrl,
    score: null,
    status: mapDealStatus(row.status, row.category),
    lastActivityAt: row.updatedAt,
    lastActivityLabel: "",
  };
}

function mapDealStatus(
  status: DealIndexRow["status"],
  category: DealIndexRow["category"],
): DashboardDealRoomTile["status"] {
  if (status === "closed") return "closed";
  if (status === "withdrawn") return "draft";
  if (status === "under_contract" || status === "closing") return "pending";
  if (status === "offer_prep" || status === "offer_sent") return "urgent";
  if (status === "intake") return "draft";
  if (category === "recent") return "closed";
  return "active";
}

interface BuyerDashboardProps {
  now: string;
}

export function BuyerDashboard({ now }: BuyerDashboardProps) {
  const dealIndex = useQuery(api.dashboard.getDealIndex, {}) as
    | DealIndex
    | undefined;

  const activeTiles = useMemo<DashboardDealRoomTile[]>(() => {
    if (!dealIndex) return [];
    return dealIndex.active.map(mapRowToTile);
  }, [dealIndex]);

  const recentTiles = useMemo<DashboardDealRoomTile[]>(() => {
    if (!dealIndex) return [];
    return dealIndex.recent.map(mapRowToTile);
  }, [dealIndex]);

  const allTiles = [...activeTiles, ...recentTiles];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Welcome back
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Buyer Dashboard
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pick up where you left off or analyze a new listing.
        </p>
      </header>

      <PasteLinkCTA />

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Your searches
          </h2>
          {allTiles.length > 0 && (
            <span className="text-xs text-neutral-500">
              {dealIndex?.summary.activeCount ?? 0} active ·{" "}
              {dealIndex?.summary.recentCount ?? 0} recent
            </span>
          )}
        </div>
        {dealIndex === undefined ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-neutral-500">
              Loading your searches…
            </CardContent>
          </Card>
        ) : allTiles.length === 0 ? (
          <EmptyDashboardState />
        ) : (
          <div className="flex flex-col gap-6">
            {activeTiles.length > 0 && (
              <DealRoomGrid tiles={activeTiles} now={now} />
            )}
            {recentTiles.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-neutral-600">
                  Recently wrapped up
                </h3>
                <DealRoomGrid tiles={recentTiles} now={now} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
