"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", "signIn");
    try {
      await signIn("password", formData);
      router.push(next);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? humanizeAuthError(err.message)
          : "Sign in failed. Please try again.";
      setError(message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="signin-email"
          className="text-sm font-medium text-neutral-700"
        >
          Email
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          className="h-[52px] w-full rounded-[14px] border border-neutral-200 bg-white px-4 text-base text-neutral-800 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-400/15 disabled:opacity-60"
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="signin-password"
          className="text-sm font-medium text-neutral-700"
        >
          Password
        </label>
        <input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          disabled={pending}
          className="h-[52px] w-full rounded-[14px] border border-neutral-200 bg-white px-4 text-base text-neutral-800 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-400/15 disabled:opacity-60"
          placeholder="Enter your password"
        />
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
        disabled={pending}
        className="mt-2 h-[52px] w-full rounded-[14px] bg-primary-700 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-400/30 disabled:cursor-not-allowed disabled:bg-primary-700/60"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="mt-1 text-center text-sm text-neutral-500">
        Don&apos;t have an account?{" "}
        <Link
          href={`/sign-up${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-primary-700 hover:text-primary-500"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}

function humanizeAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalidaccountid") || lower.includes("invalid password")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("invalidsecret")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("could not verify")) {
    return "Incorrect email or password.";
  }
  return message;
}
