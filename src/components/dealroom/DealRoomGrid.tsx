import type { DashboardDealRow } from "@/lib/dashboard/deal-index";
import { DealRoomCard } from "./DealRoomCard";

interface DealRoomGridProps {
  rows: DashboardDealRow[];
  now: string;
}

export function DealRoomGrid({ rows, now }: DealRoomGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <DealRoomCard key={row.dealRoomId} row={row} now={now} />
      ))}
    </div>
  );
}
