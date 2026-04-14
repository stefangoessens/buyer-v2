import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PropertyDetailClient } from "@/components/dealroom/PropertyDetailClient";
import { ProsConsCard } from "@/components/dealroom/ProsConsCard";
import { ClimateRiskPanel } from "@/components/dealroom/ClimateRiskPanel";
import { NeighborhoodOverviewCard } from "@/components/dealroom/NeighborhoodOverviewCard";
import { PropertyConditionCard } from "@/components/dealroom/PropertyConditionCard";
import { KeyDetailsTable } from "@/components/dealroom/KeyDetailsTable";
import { NextStepFooter } from "@/components/dealroom/NextStepFooter";
import { AssessedVsListedInsight } from "@/components/dealroom/AssessedVsListedInsight";
import { PermitsAndViolationsCard } from "@/components/dealroom/PermitsAndViolationsCard";

export const metadata: Metadata = {
  title: "Analyze property | buyer-v2",
  description: "Property facts, photos, and AI-powered insights.",
};

export default async function PropertyDetailsPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  let property: Awaited<
    ReturnType<typeof fetchQuery<typeof api.properties.getPublic>>
  > = null;
  try {
    const token = await convexAuthNextjsToken();
    property = await fetchQuery(
      api.properties.getPublic,
      { propertyId: propertyId as Id<"properties"> },
      { token },
    );
  } catch {
    property = null;
  }

  return (
    <div className="flex flex-col gap-6">
      <PropertyDetailClient propertyId={propertyId} />

      <div className="mx-auto w-full max-w-[1248px] px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProsConsCard propertyId={propertyId as Id<"properties">} />
          <ClimateRiskPanel level={50} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1248px] px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NeighborhoodOverviewCard
            neighborhood={undefined}
            city={property?.address?.city ?? "—"}
            state={property?.address?.state ?? "FL"}
          />
          <PropertyConditionCard yearBuilt={property?.yearBuilt} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1248px] px-6">
        <KeyDetailsTable
          yearBuilt={property?.yearBuilt}
          daysOnMarket={property?.daysOnMarket}
          lotSize={property?.lotSize}
        />
      </div>

      <div className="mx-auto w-full max-w-[1248px] px-6">
        <AssessedVsListedInsight
          listPrice={property?.listPrice ?? null}
          papaAssessedValue={property?.papaAssessedValue}
          papaJustValue={property?.papaJustValue}
          papaCurrentOwner={property?.papaCurrentOwner}
          papaIsCorporate={property?.papaIsCorporate}
          papaFolio={property?.papaFolio}
          papaExemptions={property?.papaExemptions}
        />
      </div>

      <div className="mx-auto w-full max-w-[1248px] px-6">
        <PermitsAndViolationsCard propertyId={propertyId} />
      </div>

      <div className="mx-auto w-full max-w-[1248px] px-6">
        <NextStepFooter
          href={`/property/${propertyId}/price`}
          label="View offer estimate"
          description="See pricing analysis, leverage signals, and your true monthly cost."
        />
      </div>
    </div>
  );
}
