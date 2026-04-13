import type { Metadata } from "next";
import { BuyerDashboardClient } from "@/components/dealroom/BuyerDashboardClient";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("dashboard");

export default function DashboardPage() {
  const now = new Date().toISOString();
  return <BuyerDashboardClient now={now} />;
}
