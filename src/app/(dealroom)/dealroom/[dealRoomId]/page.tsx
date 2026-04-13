import type { Metadata } from "next";
import { DealRoomShell } from "@/components/dealroom/DealRoomShell";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const metadata: Metadata = {
  title: "Deal room | buyer-v2",
  description:
    "Your private deal room for this property — pricing, comps, risks, offers, documents, and timeline.",
};

export default async function DealRoomPage({
  params,
}: {
  params: Promise<{ dealRoomId: string }>;
}) {
  const { dealRoomId } = await params;
  return <DealRoomShell dealRoomId={dealRoomId as Id<"dealRooms">} />;
}
