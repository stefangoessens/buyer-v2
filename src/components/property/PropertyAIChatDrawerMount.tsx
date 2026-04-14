"use client";

import { usePathname } from "next/navigation";
import type { WizardStep } from "@/lib/propertyChatPrompts";
import { PropertyAIChatDrawer } from "./PropertyAIChatDrawer";

const WIZARD_STEPS: readonly WizardStep[] = [
  "details",
  "price",
  "disclosures",
  "offer",
  "close",
] as const;

function deriveWizardStep(pathname: string | null, propertyId: string): WizardStep {
  if (!pathname) return "details";
  const prefix = `/property/${propertyId}/`;
  const idx = pathname.indexOf(prefix);
  if (idx === -1) return "details";
  const remainder = pathname.slice(idx + prefix.length);
  const first = remainder.split("/")[0] ?? "";
  const match = WIZARD_STEPS.find((step) => step === first);
  return match ?? "details";
}

interface PropertyAIChatDrawerMountProps {
  propertyId: string;
  propertyAddress?: string;
}

export function PropertyAIChatDrawerMount({
  propertyId,
  propertyAddress,
}: PropertyAIChatDrawerMountProps) {
  const pathname = usePathname();
  const wizardStep = deriveWizardStep(pathname, propertyId);

  return (
    <PropertyAIChatDrawer
      propertyId={propertyId}
      wizardStep={wizardStep}
      propertyAddress={propertyAddress}
    />
  );
}
