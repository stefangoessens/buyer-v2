import type { DashboardDealRoomTile } from "@/lib/dealroom/dashboard-types";
import { DealRoomCard } from "./DealRoomCard";

interface DealRoomGridProps {
  tiles: DashboardDealRoomTile[];
  now: string;
}

export function DealRoomGrid({ tiles, now }: DealRoomGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((tile) => (
        <DealRoomCard key={tile.dealRoomId} tile={tile} now={now} />
      ))}
    </div>
  );
}
