import type { Metadata } from "next";
import { NavHeader } from "@/components/marketing/NavHeader";
import { Footer } from "@/components/marketing/Footer";
import { appSurfaceDefinitions } from "@/lib/app-shell";

export const dynamic = "force-static";
export const metadata: Metadata = appSurfaceDefinitions.marketing.metadata;

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <NavHeader />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
