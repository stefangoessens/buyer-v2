import { NavHeader } from "@/components/marketing/NavHeader";
import { Footer } from "@/components/marketing/Footer";

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
