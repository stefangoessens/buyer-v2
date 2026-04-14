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
import { ClosingCommandCenter } from "@/components/closing/ClosingCommandCenter";

export const metadata: Metadata = {
  title: "Closing command center | buyer-v2",
  description:
    "Your six-tab closing command center — title, financing, inspections, insurance, moving in, and addendums. Every closing task, deadline, and document in one place.",
};

export default async function PropertyClosingPage({
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

  let propertyAddress: string | null = null;
  try {
    const property = await fetchQuery(
      api.properties.get,
      { propertyId: propertyId as Id<"properties"> },
      { token },
    );
    if (property && typeof property === "object" && "addressLine1" in property) {
      const p = property as {
        addressLine1?: string;
        city?: string;
        state?: string;
      };
      const parts = [p.addressLine1, p.city, p.state].filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      );
      if (parts.length > 0) propertyAddress = parts.join(", ");
    }
  } catch {
    propertyAddress = null;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {dealRoomId ? (
        <ClosingCommandCenter
          dealRoomId={dealRoomId}
          propertyAddress={propertyAddress}
        />
      ) : (
        <Card className="rounded-4xl">
          <CardHeader>
            <CardTitle>No deal room yet</CardTitle>
            <CardDescription>
              Start your analysis on the /details step to create one — the
              closing command center unlocks once your offer is under
              contract.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}
    </div>
  );
}
