import type { Metadata } from "next";

// Internal console pages are always dynamic — they query live session
// state, queue counts, and KPI snapshots from Convex on every request.
// Prerendering would either leak stale data or fail when the Convex
// client is not available at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Internal Console · Kindservices",
    template: "%s · Kindservices Console",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

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
