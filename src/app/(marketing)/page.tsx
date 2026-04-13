import type { Metadata } from "next";
import { HomePageClient } from "@/components/marketing/HomePageClient";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("home");

export default function HomePage() {
  return <HomePageClient />;
}
