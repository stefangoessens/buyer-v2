"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  formatMatchConfidence,
  formatMatchScore,
  resolveAddressIntakeView,
} from "@/lib/intake/addressIntake";

interface AddressIntakeStatusProps {
  intakeId: string;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700">
      {children}
    </span>
  );
}

export function AddressIntakeStatus({ intakeId }: AddressIntakeStatusProps) {
  const snapshot = useQuery(api.addressIntake.getIntakeStatus, {
    intakeId: intakeId as Id<"sourceListings">,
  });
  const view = resolveAddressIntakeView(snapshot);

  if (view.kind === "loading") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <Pill>Checking address</Pill>
          <h1 className="mt-4 text-3xl font-semibold text-neutral-900">
            Looking for the best property match
          </h1>
          <p className="mt-3 text-neutral-600">
            We&apos;re normalizing the address and comparing it against the
            current property graph.
          </p>
        </div>
      </main>
    );
  }

  if (view.kind === "missing") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <Pill>Unavailable</Pill>
          <h1 className="mt-4 text-3xl font-semibold text-neutral-900">
            We couldn&apos;t find that intake request
          </h1>
          <p className="mt-3 text-neutral-600">
            Start again from the homepage and enter the address one more time.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl bg-primary-400 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
          >
            Go to homepage
          </Link>
        </div>
      </main>
    );
  }

  if (view.kind === "matched") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
          <Pill>{formatMatchConfidence(view.confidence)}</Pill>
          <h1 className="mt-4 text-3xl font-semibold text-neutral-900">
            We found your property
          </h1>
          <p className="mt-3 text-lg text-neutral-700">{view.canonicalFormatted}</p>
          <p className="mt-2 text-sm text-neutral-500">
            Match score: {formatMatchScore(view.score)}
          </p>
          <Link
            href={`/property/${view.propertyId}?intakeId=${view.intakeId}`}
            className="mt-6 inline-flex rounded-2xl bg-primary-400 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
          >
            Open property analysis
          </Link>
        </div>
      </main>
    );
  }

  if (view.kind === "ambiguous") {
    const title =
      view.candidates.length > 1
        ? "We found multiple close matches"
        : "We found a close match that needs review";

    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <Pill>{formatMatchConfidence(view.confidence)}</Pill>
          <h1 className="mt-4 text-3xl font-semibold text-neutral-900">{title}</h1>
          <p className="mt-3 text-neutral-600">
            We normalized your address as{" "}
            <span className="font-semibold text-neutral-900">
              {view.canonicalFormatted}
            </span>
            . Review the closest property match before continuing.
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            Best score: {formatMatchScore(view.score)}
          </p>

          <div className="mt-8 grid gap-4">
            {view.candidates.map((candidate) => (
              <div
                key={candidate.propertyId}
                className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    {candidate.canonical.formatted}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Match score: {formatMatchScore(candidate.score)}
                  </p>
                </div>
                <Link
                  href={`/property/${candidate.propertyId}?intakeId=${view.intakeId}`}
                  className="inline-flex rounded-2xl bg-primary-400 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
                >
                  Review property
                </Link>
              </div>
            ))}
          </div>

          <Link
            href="/"
            className="mt-6 inline-flex text-sm font-semibold text-primary-700 hover:text-primary-800"
          >
            Enter a different address
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <Pill>{formatMatchConfidence(view.confidence)}</Pill>
        <h1 className="mt-4 text-3xl font-semibold text-neutral-900">
          We couldn&apos;t confidently match that address
        </h1>
        <p className="mt-3 text-neutral-600">
          We normalized your entry as{" "}
          <span className="font-semibold text-neutral-900">
            {view.canonicalFormatted}
          </span>
          , but there wasn&apos;t a reliable property match in the current graph.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Best score: {formatMatchScore(view.score)}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex rounded-2xl bg-primary-400 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
          >
            Try another address
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-2xl border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:text-neutral-900"
          >
            Paste a listing link instead
          </Link>
        </div>
      </div>
    </main>
  );
}
