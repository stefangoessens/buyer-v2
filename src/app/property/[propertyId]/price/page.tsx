import type { Metadata } from "next";
import { PropertyPriceClient } from "@/components/dealroom/PropertyPriceClient";

export const metadata: Metadata = {
  title: "Pricing | buyer-v2",
  description:
    "Fair-value range, leverage score, and monthly cost estimate for this property.",
};

export default async function PropertyPricePage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return <PropertyPriceClient propertyId={propertyId} />;
}
