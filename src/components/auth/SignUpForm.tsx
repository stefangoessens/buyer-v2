"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import { track } from "@/lib/analytics";

type SubmissionStage = "idle" | "submitting" | "waiting";

type CurrentUserWithWelcomeEmailMarker = {
  _id: string;
  welcomeEmailQueuedAt?: string | null;
  welcomeEmailTemplateKey?: string | null;
};

function getRegistrationSource(searchParams: URLSearchParams): string {
  const source =
    searchParams.get("source")?.trim() ??
    searchParams.get("utm_source")?.trim() ??
    "";
  return source.length > 0 ? source : "sign_up_page";
}

function getWelcomeEmailMarker(
  user: CurrentUserWithWelcomeEmailMarker | null | undefined,
): { templateKey: string } | null {
  if (!user || !user.welcomeEmailQueuedAt) return null;
  return {
    templateKey: user.welcomeEmailTemplateKey?.trim() || "account_welcome",
  };
}

export function SignUpForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const registrationSource = getRegistrationSource(searchParams);
  const currentUser = useQuery(api.users.current) as
    | CurrentUserWithWelcomeEmailMarker
    | null
    | undefined;

  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<SubmissionStage>("idle");
  const registrationCompletedTrackedRef = useRef(false);
  const welcomeEmailTrackedRef = useRef(false);
  const redirectHandledRef = useRef(false);
  const redirectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (stage !== "waiting") return;
    if (currentUser === undefined) return;

    if (currentUser && !registrationCompletedTrackedRef.current) {
      track("registration_completed", {
        userId: currentUser._id,
        source: registrationSource,
      });
      registrationCompletedTrackedRef.current = true;
    }

    const welcomeEmailMarker = getWelcomeEmailMarker(currentUser);
    if (
      currentUser &&
      welcomeEmailMarker &&
      !welcomeEmailTrackedRef.current
    ) {
      track("welcome_email_sent", {
        userId: currentUser._id,
        templateKey: welcomeEmailMarker.templateKey,
      });
      welcomeEmailTrackedRef.current = true;
    }

    if (welcomeEmailMarker) {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      if (!redirectHandledRef.current) {
        redirectHandledRef.current = true;
        router.push(next);
      }
      return;
    }

    if (redirectTimerRef.current === null) {
      redirectTimerRef.current = window.setTimeout(() => {
        if (redirectHandledRef.current) return;
        redirectHandledRef.current = true;
        router.push(next);
      }, 4000);
    }
  }, [currentUser, next, registrationSource, router, stage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage !== "idle") return;

    setError(null);
    setStage("submitting");
    registrationCompletedTrackedRef.current = false;
    welcomeEmailTrackedRef.current = false;
    redirectHandledRef.current = false;

    const formData = new FormData(event.currentTarget);
    formData.set("flow", "signUp");

    const source = registrationSource;
    track("registration_started", { source });

    try {
      await signIn("password", formData);
      setStage("waiting");
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? humanizeAuthError(err.message)
          : "Sign up failed. Please try again.";
      setError(message);
      setStage("idle");
    }
  }

  const isBusy = stage !== "idle";

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="signup-name"
          className="text-sm font-medium text-neutral-700"
        >
          Full name
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          disabled={isBusy}
          className="h-[52px] w-full rounded-[14px] border border-neutral-200 bg-white px-4 text-base text-neutral-800 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-400/15 disabled:opacity-60"
          placeholder="Jane Buyer"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="signup-email"
          className="text-sm font-medium text-neutral-700"
        >
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isBusy}
          className="h-[52px] w-full rounded-[14px] border border-neutral-200 bg-white px-4 text-base text-neutral-800 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-400/15 disabled:opacity-60"
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="signup-password"
          className="text-sm font-medium text-neutral-700"
        >
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isBusy}
          className="h-[52px] w-full rounded-[14px] border border-neutral-200 bg-white px-4 text-base text-neutral-800 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-400/15 disabled:opacity-60"
          placeholder="At least 8 characters"
        />
        <p className="text-xs text-neutral-400">Minimum 8 characters.</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isBusy}
        className="mt-2 h-[52px] w-full rounded-[14px] bg-primary-700 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-400/30 disabled:cursor-not-allowed disabled:bg-primary-700/60"
      >
        {stage === "submitting"
          ? "Creating account..."
          : stage === "waiting"
            ? "Finishing setup..."
            : "Create account"}
      </button>

      <p className="mt-1 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link
          href={`/sign-in${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-primary-700 hover:text-primary-500"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

function humanizeAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("already exists") || lower.includes("invalidaccountid")) {
    return "An account with that email already exists.";
  }
  if (lower.includes("password")) {
    return "Password must be at least 8 characters.";
  }
  return message;
}
