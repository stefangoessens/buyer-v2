import Link from "next/link";
import type { Metadata } from "next";
import {
  getExtensionIntakeViewModel,
  portalLabel,
  type ExtensionIntakeAuthState,
  type ExtensionIntakeOutcome,
} from "@/lib/extension/intake-state";
import { parseListingUrl } from "@/lib/intake/parser";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("intake");

interface IntakePageProps {
  searchParams: Promise<{
    auth?: string;
    listingId?: string;
    platform?: string;
    result?: string;
    source?: string;
    url?: string;
  }>;
}

function isExtensionOutcome(value: string | undefined): value is ExtensionIntakeOutcome {
  return value === "created" || value === "duplicate";
}

function isExtensionAuthState(
  value: string | undefined,
): value is ExtensionIntakeAuthState {
  return value === "signed_in" || value === "signed_out";
}

export default async function IntakePage({ searchParams }: IntakePageProps) {
  const { auth, listingId, platform, result, source, url } = await searchParams;

  if (!url) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Intake</h1>
        <p className="mt-4 text-neutral-600">
          No listing URL was forwarded. Head back to buyer-v2 and paste a
          Zillow, Redfin, or Realtor.com link to get started.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Go to buyer-v2
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
            : "The forwarded URL was not recognized as a specific listing page."}
        </p>
        <p className="mt-2 break-all text-sm text-neutral-500">URL: {url}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Go to buyer-v2
        </Link>
      </main>
    );
  }

  const isExtensionState =
    source === "extension" &&
    isExtensionOutcome(result) &&
    isExtensionAuthState(auth) &&
    platform === parsed.data.platform &&
    listingId === parsed.data.listingId;

  if (isExtensionState) {
    const viewModel = getExtensionIntakeViewModel({
      kind: result,
      authState: auth,
      platform: parsed.data.platform,
      listingId: parsed.data.listingId,
      normalizedUrl: parsed.data.normalizedUrl,
      sourceListingId: "extension-forward",
    });

    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-[0.08em] text-neutral-500">
          {viewModel.eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {viewModel.title}
        </h1>
        <p className="mt-4 text-neutral-600">{viewModel.body}</p>
        <dl className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 text-sm shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Status</dt>
            <dd className="font-semibold text-neutral-900">
              {viewModel.statusLabel}
            </dd>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Portal</dt>
            <dd className="font-medium">{portalLabel(parsed.data.platform)}</dd>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Listing ID</dt>
            <dd className="font-mono text-xs font-medium text-neutral-900">
              {parsed.data.listingId}
            </dd>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Session</dt>
            <dd className="font-medium">
              {auth === "signed_in" ? "Signed in" : "Signed out"}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={viewModel.primaryHref}
            className="inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {viewModel.primaryLabel}
          </Link>
          {viewModel.secondaryHref && viewModel.secondaryLabel ? (
            <Link
              href={viewModel.secondaryHref}
              className="inline-flex rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-900"
            >
              {viewModel.secondaryLabel}
            </Link>
          ) : null}
        </div>
      </main>
    );
  }

  const portal = portalLabel(parsed.data.platform);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Importing from {portal}</h1>
      <p className="mt-4 text-neutral-600">
        We detected a valid {portal} listing and normalized the page URL for the
        shared buyer-v2 intake flow.
      </p>
      <dl className="mt-6 rounded-lg border border-neutral-200 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-500">Portal</dt>
          <dd className="font-medium">{portal}</dd>
        </div>
        <div className="mt-2 flex justify-between">
          <dt className="text-neutral-500">Listing ID</dt>
          <dd className="font-mono text-xs font-medium">
            {parsed.data.listingId}
          </dd>
        </div>
        {source ? (
          <div className="mt-2 flex justify-between">
            <dt className="text-neutral-500">Source</dt>
            <dd className="font-medium">{source}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Go to buyer-v2
        </Link>
        <Link
          href={parsed.data.normalizedUrl}
          className="inline-flex rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-900"
        >
          Open listing
        </Link>
      </div>
    </main>
  );
}
