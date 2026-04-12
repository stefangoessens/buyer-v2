import "server-only";

/**
 * Server-only environment variables.
 * Importing this module in a client component will cause a build error.
 * These secrets must never be exposed to the browser.
 */
export const serverEnv = {
  // Convex deploy key (CI/CD)
  CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY ?? "",

  // AI providers
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",

  // Sentry (server-side)
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN ?? "",
  SENTRY_DSN: process.env.SENTRY_DSN ?? "",

  // PostHog (server-side)
  POSTHOG_PERSONAL_API_KEY: process.env.POSTHOG_PERSONAL_API_KEY ?? "",

  // Runtime
  NODE_ENV: process.env.NODE_ENV ?? "development",
} as const;

/** Check if we're in production */
export const isProduction = serverEnv.NODE_ENV === "production";
