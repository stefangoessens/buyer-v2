import type { Metadata } from "next";
import { CloseDashboard } from "@/components/close/CloseDashboard";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export const metadata: Metadata = {
  title: "Close dashboard | buyer-v2",
  description:
    "Your close is on track — see what needs your attention, what's waiting on partners, and the plan for this week.",
};

export default async function CloseDashboardPage({
  params,
}: {
  params: Promise<{ dealRoomId: string }>;
}) {
  const { dealRoomId } = await params;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <CloseDashboard dealRoomId={dealRoomId as Id<"dealRooms">} />
    </div>
  );
}
