/**
 * Typed public environment variables.
 * These are embedded in the client bundle by Next.js and safe for browser use.
 * All default to empty string when not set (graceful degradation).
 */
export const env = {
  // Convex
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",

  // PostHog analytics
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  NEXT_PUBLIC_POSTHOG_HOST:
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",

  // Sentry error tracking
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",

  // App
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

/** Check if a specific integration is configured */
export const isConfigured = {
  convex: () => env.NEXT_PUBLIC_CONVEX_URL !== "",
  posthog: () => env.NEXT_PUBLIC_POSTHOG_KEY !== "",
  sentry: () => env.NEXT_PUBLIC_SENTRY_DSN !== "",
} as const;
