import type { Metadata } from "next";
import { SavingsCalculator } from "@/components/marketing/SavingsCalculator";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("savings");

export default function SavingsPage() {
  return (
    <>
      {/* Hero */}
      <section className="w-full bg-gradient-to-br from-primary-800 to-primary-900 py-16 text-white lg:py-24">
        <div className="mx-auto max-w-[1248px] px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">
            Commission education
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight lg:text-5xl">
            See how much you could save
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-primary-100">
            buyer-v2 rebates a portion of the buyer-agent commission back to
            you at closing. Move the sliders below to see what that could look
            like on a Florida home.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="w-full bg-neutral-50 py-12 lg:py-20">
        <div className="mx-auto max-w-[1248px] px-6">
          <SavingsCalculator variant="full" />
        </div>
      </section>
    </>
  );
}
