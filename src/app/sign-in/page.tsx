import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = {
  title: "Sign in | buyer-v2",
  description:
    "Sign in to your buyer-v2 account to access your Florida home search, deal room, and saved properties.",
};

export default function SignInPage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#FCFBFF]">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_20%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1248px] flex-col px-6 py-10 lg:px-8">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-primary-700"
          >
            buyer-v2
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
          >
            Back to home
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[440px]">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
                <span className="inline-block size-1.5 rounded-full bg-primary-400" />
                Welcome back
              </div>
              <h1 className="mt-5 text-[32px] font-semibold leading-[1.15] tracking-[-0.006em] text-neutral-800">
                Sign in to your account
              </h1>
              <p className="mt-3 text-[15px] leading-[1.5] text-neutral-500">
                Pick up where you left off with your Florida home search.
              </p>
            </div>

            <div className="rounded-[20px] border border-neutral-200/80 bg-white/90 p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.06)] backdrop-blur sm:p-8">
              <Suspense fallback={<FormFallback />}>
                <SignInForm />
              </Suspense>
            </div>

            <p className="mt-6 text-center text-xs text-neutral-400">
              By signing in you agree to our{" "}
              <Link href="/terms" className="underline hover:text-neutral-600">
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="underline hover:text-neutral-600"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function FormFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-[52px] w-full animate-pulse rounded-[14px] bg-neutral-100" />
      <div className="h-[52px] w-full animate-pulse rounded-[14px] bg-neutral-100" />
      <div className="h-[52px] w-full animate-pulse rounded-[14px] bg-neutral-100" />
    </div>
  );
}
