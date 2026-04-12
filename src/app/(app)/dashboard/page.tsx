import type { Metadata } from "next";
import { BuyerDashboard } from "@/components/dealroom/BuyerDashboard";

export const metadata: Metadata = {
  title: "Dashboard | buyer-v2",
  description: "Your deals, tours, and property analyses in one place.",
};

// Live data is loaded client-side via Convex — skip static prerender so
// `useQuery` isn't invoked outside a React provider at build time.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const now = new Date().toISOString();
  return <BuyerDashboard now={now} />;
}
