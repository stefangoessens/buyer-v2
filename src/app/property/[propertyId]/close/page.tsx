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
import { CloseDashboard } from "@/components/close/CloseDashboard";

export const metadata: Metadata = {
  title: "Close dashboard | buyer-v2",
  description:
    "Your close is on track — see what needs your attention, what's waiting on partners, and the plan for this week.",
};

export default async function PropertyClosePage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const token = await convexAuthNextjsToken();
  const dealRoomId = await fetchQuery(
    api.dealRooms.getUserDealRoomForProperty,
    { propertyId: propertyId as Id<"properties"> },
    { token },
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      {dealRoomId ? (
        <CloseDashboard dealRoomId={dealRoomId} />
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
