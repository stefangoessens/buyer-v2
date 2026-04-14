import { redirect, notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default async function CloseDashboardRedirectPage({
  params,
}: {
  params: Promise<{ dealRoomId: string }>;
}) {
  const { dealRoomId } = await params;
  const token = await convexAuthNextjsToken();
  const result = await fetchQuery(
    api.dealRooms.get,
    { dealRoomId: dealRoomId as Id<"dealRooms"> },
    { token },
  );
  if (!result || !result.dealRoom) notFound();
  redirect(`/property/${result.dealRoom.propertyId}/closing`);
}
