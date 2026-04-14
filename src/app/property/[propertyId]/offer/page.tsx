import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OfferCockpit } from "@/components/offer/OfferCockpit";

export const metadata: Metadata = {
  title: "Offer cockpit | buyer-v2",
  description:
    "Compare scenarios, fine-tune terms, and send a polished offer to your broker for review.",
};

export default async function PropertyOfferPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const token = await convexAuthNextjsToken();
  let dealRoomId: Id<"dealRooms"> | null = null;
  try {
    dealRoomId = await fetchQuery(
      api.dealRooms.getUserDealRoomForProperty,
      { propertyId: propertyId as Id<"properties"> },
      { token },
    );
  } catch {
    dealRoomId = null;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {dealRoomId ? (
        <OfferCockpit dealRoomId={dealRoomId} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No deal room yet</CardTitle>
            <CardDescription>
              Start your analysis on the /details step to create one.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}
    </div>
  );
}
