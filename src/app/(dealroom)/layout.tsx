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
    <div className="min-h-screen bg-gray-50">
      {/* Deal room header with property context will be added later */}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
