"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HeroSection } from "@/components/marketing/HeroSection";
import { TrustBar } from "@/components/marketing/TrustBar";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";
import { convex } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";

const PUBLIC_THROTTLE_STORAGE_KEY = "buyer-v2:intake-throttle-id";

type PublicIntakeSource = "homepage" | "extension" | "share_import";

type SubmissionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "accepted" }
  | { kind: "retry_later"; retryAt: string }
  | { kind: "blocked"; retryAt: string }
  | { kind: "error"; message: string };

function resolveIntakeSource(source: string | null): PublicIntakeSource {
  if (source === "extension") {
    return "extension";
  }
  if (source === "share_import") {
    return "share_import";
  }
  return "homepage";
}

function readOrCreateThrottleId(): string {
  if (typeof window === "undefined") {
    return "server-render";
  }

  const existing = window.localStorage.getItem(PUBLIC_THROTTLE_STORAGE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const next =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `intake-${Date.now()}`;
  window.localStorage.setItem(PUBLIC_THROTTLE_STORAGE_KEY, next);
  return next;
}

function formatRetryCopy(kind: "retry_later" | "blocked", retryAt: string): string {
  const retryMs = new Date(retryAt).getTime();
  if (Number.isNaN(retryMs)) {
    return kind === "blocked"
      ? "This intake channel is temporarily blocked. Please try again later."
      : "Too many attempts. Please try again shortly.";
  }

  const remainingMs = Math.max(0, retryMs - Date.now());
  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  const unit = remainingMinutes === 1 ? "minute" : "minutes";

  return kind === "blocked"
    ? `This intake channel is temporarily blocked. Try again in about ${remainingMinutes} ${unit}.`
    : `Too many attempts. Try again in about ${remainingMinutes} ${unit}.`;
}

const trustStats = [
  { value: "500+", label: "Buyers served" },
  { value: "$2.1M", label: "Total savings" },
  { value: "4.9\u2605", label: "Buyer rating" },
  { value: "<5s", label: "To first analysis" },
];

const features = [
  {
    icon: "\uD83D\uDD17",
    title: "Paste any listing link",
    description:
      "Drop a Zillow, Redfin, or Realtor.com URL. We instantly analyze the property.",
  },
  {
    icon: "\uD83D\uDCCA",
    title: "Get AI-powered analysis",
    description:
      "Fair pricing, comparable sales, leverage signals, and a competitiveness score.",
  },
  {
    icon: "\uD83D\uDCB0",
    title: "Save with expert representation",
    description:
      "Our licensed brokers negotiate on your behalf. Average savings: $12,400.",
  },
];

const steps = [
  { number: 1, label: "Paste a link" },
  { number: 2, label: "Review your analysis" },
  { number: 3, label: "Close with confidence" },
];

const testimonials = [
  {
    quote:
      "I pasted a Zillow link and within seconds had a full pricing analysis. Saved us $18,000 on our first home in Tampa.",
    author: "Maria Gonzalez",
    role: "First-time buyer, Tampa",
  },
  {
    quote:
      "The AI analysis caught overpricing my agent missed. buyer-v2 gave us the confidence to negotiate hard and win.",
    author: "James Chen",
    role: "Homebuyer, Miami",
  },
  {
    quote:
      "From paste to close in 23 days. The deal room kept everything organized and our broker was incredible.",
    author: "Sarah Mitchell",
    role: "Relocating buyer, Orlando",
  },
];

export function HomePageClient() {
  const searchParams = useSearchParams();
  const forwardedUrl = searchParams.get("intake")?.trim() ?? "";
  const intakeSource = resolveIntakeSource(searchParams.get("source"));
  const autoSubmitted = useRef(false);
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });

  const handleSubmit = useCallback(
    async (url: string) => {
      setState({ kind: "submitting" });

      if (!convex) {
        setState({ kind: "accepted" });
        return;
      }

      try {
        const result = await convex.mutation(api.intake.submitUrl, {
          url,
          source: intakeSource,
          throttleId:
            intakeSource === "share_import" ? undefined : readOrCreateThrottleId(),
        });

        switch (result.kind) {
          case "accepted":
            setState({ kind: "accepted" });
            return;
          case "retry_later":
            setState({ kind: "retry_later", retryAt: result.retryAt });
            return;
          case "blocked":
            setState({ kind: "blocked", retryAt: result.retryAt });
            return;
          case "error":
            setState({ kind: "error", message: result.error });
            return;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to submit intake.";
        setState({ kind: "error", message });
      }
    },
    [intakeSource],
  );

  useEffect(() => {
    if (!forwardedUrl || autoSubmitted.current) {
      return;
    }

    autoSubmitted.current = true;
    void handleSubmit(forwardedUrl);
  }, [forwardedUrl, handleSubmit]);

  const isAccepted = state.kind === "accepted" || state.kind === "submitting";
  const feedbackMessage =
    state.kind === "retry_later" || state.kind === "blocked"
      ? formatRetryCopy(state.kind, state.retryAt)
      : state.kind === "error"
        ? state.message
        : null;

  return (
    <>
      <HeroSection
        title="Get the best deal on your Florida home"
        subtitle="Paste a Zillow, Redfin, or Realtor link. Get instant AI-powered analysis, fair pricing, and expert buyer representation — for free."
      >
        {feedbackMessage ? (
          <p className="max-w-xl text-center text-sm font-medium text-primary-50">
            {feedbackMessage}
          </p>
        ) : null}
        {isAccepted ? (
          <div className="rounded-xl bg-white/10 px-6 py-4 text-lg font-medium text-white backdrop-blur">
            {state.kind === "submitting"
              ? "Checking abuse controls and starting analysis..."
              : "Analyzing your property..."}
          </div>
        ) : (
          <PasteLinkInput
            variant="hero"
            onSubmit={(url) => {
              void handleSubmit(url);
            }}
            initialValue={forwardedUrl}
          />
        )}
      </HeroSection>

      <TrustBar stats={trustStats} />

      <section className="w-full bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-[1248px] px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-neutral-800">
            How buyer-v2 works for you
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                icon={
                  <span className="text-2xl" role="img" aria-label={feature.title}>
                    {feature.icon}
                  </span>
                }
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="w-full bg-neutral-50 py-16 lg:py-24"
      >
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-neutral-800">
            Three steps to your best deal
          </h2>
          <div className="mt-12 flex flex-col items-center gap-0 md:flex-row md:items-start md:justify-between md:gap-0">
            {steps.map((step, i) => (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary-400 text-lg font-bold text-white">
                    {step.number}
                  </div>
                  <p className="mt-3 text-base font-medium text-neutral-700">
                    {step.label}
                  </p>
                </div>
                {i < steps.length - 1 ? (
                  <>
                    <div className="mx-6 hidden h-px w-16 bg-neutral-300 md:block" />
                    <div className="my-4 h-8 w-px bg-neutral-300 md:hidden" />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-[1248px] px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-neutral-800">
            What buyers are saying
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <TestimonialCard
                key={testimonial.author}
                quote={testimonial.quote}
                author={testimonial.author}
                role={testimonial.role}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="w-full bg-primary-700 py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">
            Ready to find your Florida home?
          </h2>
          <p className="mt-4 text-lg text-primary-100">
            Paste a listing link and get your free AI analysis in seconds.
          </p>
          {feedbackMessage ? (
            <p className="mt-6 text-sm font-medium text-primary-50">
              {feedbackMessage}
            </p>
          ) : null}
          <div className="mt-8">
            {isAccepted ? (
              <div className="rounded-xl bg-white/10 px-6 py-4 text-lg font-medium text-white backdrop-blur">
                {state.kind === "submitting"
                  ? "Checking abuse controls and starting analysis..."
                  : "Analyzing your property..."}
              </div>
            ) : (
              <PasteLinkInput
                variant="hero"
                onSubmit={(url) => {
                  void handleSubmit(url);
                }}
                initialValue={forwardedUrl}
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
