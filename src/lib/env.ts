import { hasValue, readEnv, webPublicEnvSpec } from "@buyer-v2/shared";

/**
 * Typed public environment variables.
 * These are embedded in the client bundle by Next.js and safe for browser use.
 * All default to empty string when not set (graceful degradation).
 */
export const env = readEnv(webPublicEnvSpec, process.env);

/** Check if a specific integration is configured */
export const isConfigured = {
  convex: () => hasValue(env.NEXT_PUBLIC_CONVEX_URL),
  auth: () =>
    env.NEXT_PUBLIC_AUTH_PROVIDER === "auth0"
      ? hasValue(env.NEXT_PUBLIC_AUTH0_DOMAIN) &&
        hasValue(env.NEXT_PUBLIC_AUTH0_CLIENT_ID)
      : hasValue(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
  posthog: () => hasValue(env.NEXT_PUBLIC_POSTHOG_KEY),
  sentry: () => hasValue(env.NEXT_PUBLIC_SENTRY_DSN),
} as const;
