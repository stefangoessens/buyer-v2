"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface NextStepFooterProps {
  href: string;
  label: string;
  description?: string;
}

export function NextStepFooter({
  href,
  label,
  description,
}: NextStepFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-border bg-white/95 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-400">
            Next step
          </p>
          <p className="text-sm text-neutral-700">
            {description ?? "Continue to the next wizard step."}
          </p>
        </div>
        <Button asChild>
          <Link href={href}>{label} →</Link>
        </Button>
      </div>
    </div>
  );
}
