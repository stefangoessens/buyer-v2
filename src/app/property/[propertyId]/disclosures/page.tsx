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
import { DisclosuresClient } from "@/components/property/disclosures/DisclosuresClient";

export const metadata: Metadata = {
  title: "Disclosures | buyer-v2",
  description:
    "Upload seller disclosures, surface AI red flags, and get plain-English explanations for every risk in the packet.",
};

export default async function PropertyDisclosuresPage({
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

  if (!dealRoomId) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <Card className="rounded-4xl">
          <CardHeader>
            <CardTitle>No deal room yet</CardTitle>
            <CardDescription>
              Start your analysis on the /details step to create one.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <DisclosuresClient dealRoomId={dealRoomId} propertyId={propertyId} />
    </div>
  );
}
