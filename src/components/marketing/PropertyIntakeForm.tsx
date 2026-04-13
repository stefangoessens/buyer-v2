"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";
import { isConfigured } from "@/lib/env";
import { normalizeAddress } from "@/lib/intake/address";

type IntakeSource = "hero" | "compact";
type IntakeMode = "url" | "address";

interface PropertyIntakeFormProps {
  source?: IntakeSource;
}

function isValidPropertyUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return /^https?:\/\/(www\.)?(zillow|redfin|realtor)\.com\//.test(trimmed);
}

function sourceLabel(source: IntakeSource): string {
  return source === "hero" ? "Get free analysis" : "Analyze";
}

function inputClassName(source: IntakeSource) {
  return source === "hero"
    ? "h-[68px] rounded-3xl border-2 border-primary-200 bg-white pl-10 text-lg text-neutral-900 placeholder:text-neutral-400"
    : "h-10 rounded-xl border border-neutral-200 bg-white pl-10 text-sm text-neutral-900 placeholder:text-neutral-400";
}

function buttonClassName(source: IntakeSource) {
  return source === "hero"
    ? "h-16 w-full rounded-3xl bg-primary-400 px-8 text-lg font-semibold text-white transition-colors duration-[var(--duration-normal)] hover:bg-primary-500 disabled:bg-primary-200 sm:w-auto"
    : "h-10 rounded-xl bg-primary-400 px-5 text-sm font-semibold text-white transition-colors duration-[var(--duration-normal)] hover:bg-primary-500 disabled:bg-primary-200";
}

function modeToggleClassName(active: boolean) {
  return active
    ? "bg-white text-primary-900 shadow-sm"
    : "text-white/72 hover:text-white";
}

function UrlOnlyIntakeForm({ source }: { source: IntakeSource }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const canSubmit = isValidPropertyUrl(value);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    track("link_pasted", { url: value.trim(), source });
    router.push(`/intake?url=${encodeURIComponent(value.trim())}&source=${source}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-2 ${source === "hero" ? "flex-col sm:flex-row" : ""}`}
    >
      <div className="relative w-full">
        <svg
          className={`absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400 ${source === "hero" ? "size-5" : "size-4"}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.027a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757"
          />
        </svg>
        <Input
          type="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste a Zillow, Redfin, or Realtor.com link..."
          className={inputClassName(source)}
        />
      </div>
      <button type="submit" disabled={!canSubmit} className={buttonClassName(source)}>
        {sourceLabel(source)}
      </button>
    </form>
  );
}

function PropertyIntakeFormWithAddress({ source }: { source: IntakeSource }) {
  const router = useRouter();
  const createAddressIntake = useMutation(api.addressIntake.createAddressIntake);

  const [mode, setMode] = useState<IntakeMode>("url");
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const addressResult = mode === "address" ? normalizeAddress({ raw: value }) : null;
  const addressErrors =
    showValidation && addressResult && !addressResult.valid
      ? [...new Set(addressResult.errors.map((error) => error.message))]
      : [];
  const canSubmit =
    mode === "url" ? isValidPropertyUrl(value) : Boolean(addressResult?.valid);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "url") {
      if (!canSubmit) {
        return;
      }

      track("link_pasted", { url: value.trim(), source });
      router.push(`/intake?url=${encodeURIComponent(value.trim())}&source=${source}`);
      return;
    }

    setShowValidation(true);
    setSubmitError(null);

    if (!addressResult?.valid) {
      return;
    }

    setIsSubmitting(true);
    track("manual_address_submitted", { source });

    try {
      const result = await createAddressIntake({ address: { raw: value.trim() } });

      if (result.status === "validation_error") {
        setSubmitError(result.errors[0]?.message ?? "Please review the address and try again.");
        return;
      }

      if (result.status === "matched") {
        router.push(`/property/${result.propertyId}?intakeId=${result.intakeId}`);
        return;
      }

      router.push(`/intake?intakeId=${result.intakeId}`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "address_intake_failed";
      track("error_boundary_hit", {
        error: code,
        location: "PropertyIntakeForm",
      });
      setSubmitError("We couldn't look up that address right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full bg-white/10 p-1 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            setMode("url");
            setValue("");
            setShowValidation(false);
            setSubmitError(null);
          }}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${modeToggleClassName(mode === "url")}`}
        >
          Paste listing link
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("address");
            setValue("");
            setShowValidation(false);
            setSubmitError(null);
          }}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${modeToggleClassName(mode === "address")}`}
        >
          Enter address
        </button>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className={`flex items-center gap-2 ${source === "hero" ? "flex-col sm:flex-row" : ""}`}
      >
        <div className="relative w-full">
          <svg
            className={`absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400 ${source === "hero" ? "size-5" : "size-4"}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            {mode === "url" ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.027a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a8.25 8.25 0 0 0 8.25-8.25c0-4.657-3.593-8.25-8.25-8.25S3.75 8.093 3.75 12.75A8.25 8.25 0 0 0 12 21Zm0 0c1.726-1.504 5.25-4.918 5.25-8.25a5.25 5.25 0 1 0-10.5 0c0 3.332 3.524 6.746 5.25 8.25Zm0-11.25h.008v.008H12V9.75Z"
              />
            )}
          </svg>
          <Input
            type={mode === "url" ? "url" : "text"}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSubmitError(null);
            }}
            placeholder={
              mode === "url"
                ? "Paste a Zillow, Redfin, or Realtor.com link..."
                : "123 Main St, Miami, FL 33131"
            }
            className={inputClassName(source)}
            aria-invalid={addressErrors.length > 0 || submitError ? "true" : undefined}
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          className={buttonClassName(source)}
        >
          {isSubmitting
            ? "Checking address..."
            : mode === "address"
              ? "Find property"
              : sourceLabel(source)}
        </button>
      </form>

      {mode === "address" && addressResult?.valid ? (
        <p className="text-sm text-primary-50/90">
          We&apos;ll look for{" "}
          <span className="font-semibold text-white">
            {addressResult.canonical.formatted}
          </span>
          .
        </p>
      ) : null}

      {mode === "address" && addressErrors.length > 0 ? (
        <div className="rounded-2xl border border-amber-200/50 bg-white/10 px-4 py-3 text-left text-sm text-primary-50">
          {addressErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      {submitError ? (
        <p className="text-sm text-amber-100">{submitError}</p>
      ) : null}
    </div>
  );
}

export function PropertyIntakeForm({
  source = "hero",
}: PropertyIntakeFormProps) {
  if (!isConfigured.convex()) {
    return <UrlOnlyIntakeForm source={source} />;
  }

  return <PropertyIntakeFormWithAddress source={source} />;
}
