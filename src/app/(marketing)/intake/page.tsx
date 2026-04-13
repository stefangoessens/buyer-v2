import Link from "next/link";
import type { Metadata } from "next";
import { AddressIntakeStatus } from "@/components/marketing/AddressIntakeStatus";
import { parseListingUrl } from "@/lib/intake/parser";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("intake");

interface IntakePageProps {
  searchParams: Promise<{ intakeId?: string; url?: string; source?: string }>;
}

export default async function IntakePage({ searchParams }: IntakePageProps) {
  const { intakeId, url, source } = await searchParams;

  if (intakeId) {
    return <AddressIntakeStatus intakeId={intakeId} />;
  }

  if (!url) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Intake</h1>
        <p className="mt-4 text-neutral-600">
          No intake details were forwarded. Head back to the homepage and paste
          a Zillow, Redfin, or Realtor.com link, or enter the address directly,
          to get started.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Go to homepage
        </Link>
      </main>
    );
  }

  const parsed = parseListingUrl(url);

  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold">We couldn&apos;t import that link</h1>
        <p className="mt-4 text-neutral-600">
          {parsed.error.code === "unsupported_url"
            ? "buyer-v2 currently supports Zillow, Redfin, and Realtor.com listings."
            : "The forwarded URL was not recognized as a listing. Try pasting it on the homepage."}
        </p>
        <p className="mt-2 text-sm text-neutral-500 break-all">URL: {url}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Try again from homepage
        </Link>
      </main>
    );
  }

  const portalLabel =
    parsed.data.platform === "zillow"
      ? "Zillow"
      : parsed.data.platform === "redfin"
        ? "Redfin"
        : "Realtor.com";

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Importing from {portalLabel}</h1>
      <p className="mt-4 text-neutral-600">
        We detected a valid {portalLabel} listing. Continue to buyer-v2 to see
        your pricing panel, comps, and leverage analysis.
      </p>
      <dl className="mt-6 rounded-lg border border-neutral-200 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-500">Portal</dt>
          <dd className="font-medium">{portalLabel}</dd>
        </div>
        <div className="mt-2 flex justify-between">
          <dt className="text-neutral-500">Listing ID</dt>
          <dd className="font-medium font-mono text-xs">{parsed.data.listingId}</dd>
        </div>
        {source ? (
          <div className="mt-2 flex justify-between">
            <dt className="text-neutral-500">Source</dt>
            <dd className="font-medium">{source}</dd>
          </div>
        ) : null}
      </dl>
      <Link
        href={`/?intake=${encodeURIComponent(parsed.data.normalizedUrl)}`}
        className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
      >
        Continue to buyer-v2
      </Link>
    </main>
  );
}
