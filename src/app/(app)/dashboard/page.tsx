import type { Metadata } from "next";
import { BuyerDashboardClient } from "@/components/dealroom/BuyerDashboardClient";

export const metadata: Metadata = {
  title: "Dashboard | buyer-v2",
  description: "Your deals, tours, and property analyses in one place.",
};

export default function DashboardPage() {
  const now = new Date().toISOString();
  return <BuyerDashboardClient now={now} />;
}
