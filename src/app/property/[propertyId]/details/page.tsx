import type { Metadata } from "next";
import { PropertyDetailClient } from "@/components/dealroom/PropertyDetailClient";

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
  return <PropertyDetailClient propertyId={propertyId} />;
}
