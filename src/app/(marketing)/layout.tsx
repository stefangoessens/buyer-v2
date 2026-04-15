import type { Metadata } from "next";
import { NavHeader } from "@/components/marketing/NavHeader";
import { Footer } from "@/components/marketing/Footer";
import { FloridaAvailabilityStrip } from "@/components/marketing/FloridaAvailabilityStrip";
import { appSurfaceDefinitions } from "@/lib/app-shell";

// Pages under the marketing segment choose their own rendering mode.
// Most pages stay statically optimized by default; pages that need
// request-time features (like the homepage rebate slider reading the
// ?price= query param) opt into dynamic rendering at the page level.
export const metadata: Metadata = appSurfaceDefinitions.marketing.metadata;

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <NavHeader />
      <FloridaAvailabilityStrip />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
