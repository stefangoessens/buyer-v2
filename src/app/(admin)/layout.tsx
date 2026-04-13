import type { Metadata } from "next";
import { appSurfaceDefinitions } from "@/lib/app-shell";

// Internal console pages are always dynamic — they query live session
// state, queue counts, and KPI snapshots from Convex on every request.
// Prerendering would either leak stale data or fail when the Convex
// client is not available at build time.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = appSurfaceDefinitions.internalConsole.metadata;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The AdminShell wrapper lives at the page level, not here, so the
  // /preview route can render the shell chrome with mocked data for
  // design verification without pulling in the live Convex query.
  return <>{children}</>;
}
