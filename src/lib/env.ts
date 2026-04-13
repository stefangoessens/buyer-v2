import { hasValue, readEnv, validateEnv, webPublicEnvSpec } from "@buyer-v2/shared";

type EnvSource = Record<string, string | undefined>;

/**
 * Typed public environment variables.
 * These are embedded in the client bundle by Next.js and safe for browser use.
 */
export function readPublicEnv(source: EnvSource = process.env) {
  return readEnv(webPublicEnvSpec, source);
}

export function getPublicEnvIssues(source: EnvSource = process.env) {
  return validateEnv(webPublicEnvSpec, source);
}

export const env = readPublicEnv();

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
