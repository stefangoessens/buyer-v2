import type { Metadata } from "next";
import { appSurfaceDefinitions } from "@/lib/app-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = appSurfaceDefinitions.dealRoom.metadata;

export default function DealRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <main className="flex min-h-screen flex-col">{children}</main>
    </div>
  );
}
