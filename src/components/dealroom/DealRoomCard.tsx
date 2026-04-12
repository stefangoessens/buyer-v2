import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/product/ScoreBadge";
import { StatusBadge } from "@/components/product/StatusBadge";
import {
  formatDealRoomActivity,
  type DashboardDealRoomTile,
} from "@/lib/dealroom/dashboard-types";

interface DealRoomCardProps {
  tile: DashboardDealRoomTile;
  now: string;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

export function DealRoomCard({ tile, now }: DealRoomCardProps) {
  return (
    <Link
      href={`/dealroom/${tile.dealRoomId}/offer`}
      className="group block"
    >
      <Card className="h-full overflow-hidden p-0 transition-all hover:border-primary-300 hover:shadow-md">
        <div className="relative aspect-video bg-neutral-100">
          {tile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tile.photoUrl}
              alt={tile.address}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400">
              No photo yet
            </div>
          )}
          {tile.score !== null && (
            <div className="absolute right-3 top-3">
              <ScoreBadge score={tile.score} maxScore={10} size="sm" />
            </div>
          )}
        </div>
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900">
                {tile.address}
              </p>
              <p className="text-xs text-neutral-500">
                {tile.city}, {tile.state}
              </p>
            </div>
            <StatusBadge status={tile.status} />
          </div>
          <p className="text-lg font-bold text-primary-700">
            {currencyFormatter.format(tile.listPrice)}
          </p>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{tile.beds} bd</span>
            <span className="text-neutral-300">·</span>
            <span>{tile.baths} ba</span>
            <span className="text-neutral-300">·</span>
            <span>{numberFormatter.format(tile.sqft)} sqft</span>
          </div>
          <p className="text-xs text-neutral-400">
            {formatDealRoomActivity(tile.lastActivityAt, now)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
