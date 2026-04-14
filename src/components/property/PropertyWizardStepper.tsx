"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const STEPS = [
  { id: "details", label: "Analyze" },
  { id: "price", label: "Price" },
  { id: "disclosures", label: "Disclosures" },
  { id: "offer", label: "Offer" },
  { id: "close", label: "Close" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

interface PropertyWizardStepperProps {
  propertyId: string;
}

function resolveActiveStep(pathname: string | null): StepId {
  if (!pathname) return "details";
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const match = STEPS.find((step) => step.id === last);
  return match?.id ?? "details";
}

export function PropertyWizardStepper({
  propertyId,
}: PropertyWizardStepperProps) {
  const pathname = usePathname();
  const activeId = resolveActiveStep(pathname);

  return (
    <Breadcrumb className="rounded-3xl border border-border bg-white p-4">
      <BreadcrumbList className="text-muted-foreground">
        {STEPS.map((step, idx) => {
          const isActive = step.id === activeId;
          const href = `/property/${propertyId}/${step.id}`;
          return (
            <Fragment key={step.id}>
              {idx > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isActive ? (
                  <BreadcrumbPage className="font-semibold text-primary-700">
                    {step.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    asChild
                    className="text-muted-foreground hover:text-primary-700"
                  >
                    <Link href={href}>{step.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
