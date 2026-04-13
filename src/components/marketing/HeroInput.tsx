"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";

export function HeroInput() {
  const router = useRouter();
  const submitUrl = useMutation(api.intake.submitUrl);
  const [sourceListingId, setSourceListingId] =
    useState<Id<"sourceListings"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const status = useQuery(
    api.intake.getIntakeStatus,
    sourceListingId ? { sourceListingId } : "skip",
  );

  useEffect(() => {
    if (!status) return;
    if (status.status === "complete" && status.propertyId) {
      router.push(`/property/${status.propertyId}`);
      return;
    }
    if (status.status === "failed") {
      setErrorMessage(
        status.errorMessage ||
          "We couldn't extract this listing. Try another URL.",
      );
      setSourceListingId(null);
    }
  }, [status, router]);

  const handleSubmit = useCallback(
    async (url: string) => {
      setErrorMessage(null);
      setSubmitting(true);
      try {
        const result = await submitUrl({ url });
        if (!result.success) {
          setErrorMessage(result.error);
          return;
        }
        setSourceListingId(result.sourceListingId);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [submitUrl],
  );

  const reset = useCallback(() => {
    setSourceListingId(null);
    setErrorMessage(null);
  }, []);

  if (submitting || sourceListingId !== null) {
    return (
      <div
        className="flex h-[60px] items-center justify-center gap-3 rounded-[16px] border border-neutral-200 bg-white px-6 text-base font-medium text-neutral-700 shadow-sm"
        aria-live="polite"
      >
        <svg
          className="size-5 animate-spin text-primary-400"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Analyzing your property...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[16px] border border-rose-200 bg-rose-50 px-6 py-4 text-rose-900">
        <p className="text-sm font-medium">{errorMessage}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-primary-200 hover:bg-primary-50"
        >
          Try again
        </button>
      </div>
    );
  }

  return <PasteLinkInput variant="hero" onSubmit={handleSubmit} />;
}
