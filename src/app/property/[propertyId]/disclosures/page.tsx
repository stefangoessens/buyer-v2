import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Disclosures | buyer-v2",
  description:
    "Seller disclosures, inspection reports, and property risk signals for this home.",
};

export default async function PropertyDisclosuresPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  await params;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Disclosure review coming soon</CardTitle>
        <CardDescription>
          Document parsing + AI summary lands in KIN-1069.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
