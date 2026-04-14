import type { Metadata } from "next";

import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";
import { AgreementsPageClient } from "./AgreementsPageClient";

export const metadata: Metadata = metadataForStaticPage("dashboardAgreements");

export default function DashboardAgreementsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Agreements
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Buyer agreements
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your representation, compensation, and termination agreements grouped
          by deal room.
        </p>
      </header>
      <AgreementsPageClient />
    </div>
  );
}
