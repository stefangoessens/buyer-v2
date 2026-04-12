"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  sortDealRoomsByActivity,
  type DashboardDealRoomTile,
} from "@/lib/dealroom/dashboard-types";
import { DealRoomGrid } from "./DealRoomGrid";
import { EmptyDashboardState } from "./EmptyDashboardState";
import { PasteLinkCTA } from "./PasteLinkCTA";

type RawDealRoom = {
  _id: string;
  propertyId: string;
  status: string;
  updatedAt?: string;
  createdAt?: string;
};

type RawProperty = {
  _id: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    unit?: string;
    formatted?: string;
  };
  listPrice?: number;
  beds?: number;
  bathsFull?: number;
  bathsHalf?: number;
  sqftLiving?: number;
  photoUrls?: string[];
};

function mapDealRoomToTile(
  dealRoom: RawDealRoom,
  property: RawProperty | null,
): DashboardDealRoomTile {
  const address = property?.address ?? {};
  const fullBaths = property?.bathsFull ?? 0;
  const halfBaths = property?.bathsHalf ?? 0;
  const baths = fullBaths + halfBaths * 0.5;
  return {
    dealRoomId: dealRoom._id,
    propertyId: dealRoom.propertyId,
    address:
      address.formatted ||
      `${address.street ?? ""}${address.unit ? ` ${address.unit}` : ""}`.trim() ||
      "Unnamed property",
    city: address.city ?? "",
    state: address.state ?? "FL",
    listPrice: property?.listPrice ?? 0,
    beds: property?.beds ?? 0,
    baths,
    sqft: property?.sqftLiving ?? 0,
    photoUrl: property?.photoUrls?.[0] ?? null,
    score: null,
    status: mapDealRoomStatus(dealRoom.status),
    lastActivityAt: dealRoom.updatedAt ?? dealRoom.createdAt ?? null,
    lastActivityLabel: "",
  };
}

function mapDealRoomStatus(
  status: string,
): DashboardDealRoomTile["status"] {
  switch (status) {
    case "under_contract":
      return "pending";
    case "closed":
      return "closed";
    case "offer_prep":
    case "offer_sent":
      return "urgent";
    case "intake":
      return "draft";
    default:
      return "active";
  }
}

interface BuyerDashboardProps {
  now: string;
}

export function BuyerDashboard({ now }: BuyerDashboardProps) {
  const dealRooms = useQuery(api.dealRooms.listForBuyer, {}) as
    | RawDealRoom[]
    | undefined;

  const tiles = useMemo<DashboardDealRoomTile[]>(() => {
    if (!dealRooms) return [];
    const mapped = dealRooms.map((dr) => mapDealRoomToTile(dr, null));
    return sortDealRoomsByActivity(mapped);
  }, [dealRooms]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Welcome back
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Your dashboard
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pick up where you left off or analyze a new listing.
        </p>
      </header>

      <PasteLinkCTA />

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Your searches</h2>
          {tiles.length > 0 && (
            <span className="text-xs text-neutral-500">
              {tiles.length} deal room{tiles.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {dealRooms === undefined ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-neutral-500">
              Loading your searches…
            </CardContent>
          </Card>
        ) : tiles.length === 0 ? (
          <EmptyDashboardState />
        ) : (
          <DealRoomGrid tiles={tiles} now={now} />
        )}
      </section>
    </div>
  );
}
