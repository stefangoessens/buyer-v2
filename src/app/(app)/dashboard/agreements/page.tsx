import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("dashboardAgreements");

type AgreementsPageProps = {
  searchParams: Promise<{ dealRoom?: string }>;
};

export default async function AgreementsPage({
  searchParams,
}: AgreementsPageProps) {
  const { dealRoom } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Agreements
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Buyer agreements
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {dealRoom
            ? `Showing agreements for deal room ${dealRoom}`
            : "All agreements"}
        </p>
      </header>
      <Card>
        <CardContent className="py-16 text-center text-sm text-neutral-500">
          Agreement signing and tracking arrives with the brokerage milestone.
        </CardContent>
      </Card>
    </div>
  );
}
