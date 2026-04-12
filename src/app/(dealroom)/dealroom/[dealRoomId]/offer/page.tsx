import type { Metadata } from "next";
import { OfferCockpit } from "@/components/offer/OfferCockpit";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export const metadata: Metadata = {
  title: "Offer cockpit | buyer-v2",
  description:
    "Compare scenarios, fine-tune terms, and send a polished offer to your broker for review.",
};

export default async function OfferCockpitPage({
  params,
}: {
  params: Promise<{ dealRoomId: string }>;
}) {
  const { dealRoomId } = await params;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <OfferCockpit dealRoomId={dealRoomId as Id<"dealRooms">} />
    </div>
  );
}
