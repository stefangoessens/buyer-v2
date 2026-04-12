"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";

/**
 * Authenticated-dashboard version of the homepage hero paste-link CTA.
 *
 * Wraps the shared `PasteLinkInput` in a product-surface Card. On submit
 * it routes to the intake pipeline with the pasted URL, identical to the
 * public homepage flow — the backend decides whether to reuse an
 * existing deal room or create a new one.
 */
export function PasteLinkCTA() {
  const router = useRouter();

  const handleSubmit = (url: string) => {
    const target = `/intake?url=${encodeURIComponent(url)}`;
    router.push(target);
  };

  return (
    <Card className="overflow-hidden border-neutral-200 bg-gradient-to-br from-primary-50 via-white to-accent-50 p-6 md:p-8">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            Start a new analysis
          </p>
          <h2 className="mt-1 text-xl font-semibold text-neutral-900 md:text-2xl">
            Paste any listing link to see pricing, comps, and leverage.
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Drop a Zillow, Redfin, or Realtor.com URL. We&apos;ll create a deal
            room and analyze it in seconds.
          </p>
        </div>
        <PasteLinkInput variant="hero" onSubmit={handleSubmit} />
      </div>
    </Card>
  );
}
