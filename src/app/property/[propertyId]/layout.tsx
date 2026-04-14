import { PropertyAIChatDrawerMount } from "@/components/property/PropertyAIChatDrawerMount";
import { PropertyWizardHeader } from "@/components/property/PropertyWizardHeader";
import { PropertyWizardStepper } from "@/components/property/PropertyWizardStepper";

export default async function PropertyWizardLayout({
  params,
  children,
}: {
  params: Promise<{ propertyId: string }>;
  children: React.ReactNode;
}) {
  const { propertyId } = await params;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8 lg:px-8">
      <PropertyWizardHeader propertyId={propertyId} />
      <PropertyWizardStepper propertyId={propertyId} />
      <main>{children}</main>
      <PropertyAIChatDrawerMount propertyId={propertyId} />
    </div>
  );
}
