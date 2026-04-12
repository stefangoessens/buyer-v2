"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, Suspense } from "react";

// Initialize PostHog (call once, guards against double-init)
let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false, // We handle this manually below
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") {
        ph.debug();
      }
    },
  });

  initialized = true;
}

/** PostHog React provider — wraps children with context */
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

/** Captures page views on route changes — must be inside Suspense */
function PostHogPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      const search = searchParams?.toString();
      if (search) {
        url = url + "?" + search;
      }
      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

/** Page view tracker — safe to render without SSR issues */
export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  );
}

/** Identify a user in PostHog (use only non-PII identifiers) */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>
) {
  posthog.identify(userId, properties);
}

/** Reset PostHog identity on logout */
export function resetIdentity() {
  posthog.reset();
}

export { posthog };
