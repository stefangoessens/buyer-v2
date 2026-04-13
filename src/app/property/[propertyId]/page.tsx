import { PropertyDetailClient } from "@/components/dealroom/PropertyDetailClient";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  return <PropertyDetailClient propertyId={propertyId} />;
}
