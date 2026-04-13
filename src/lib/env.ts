import {
  hasValue,
  readEnv,
  type DeploymentEnvironment,
  webPublicEnvSpec,
} from "@buyer-v2/shared";

/**
 * Typed public environment variables.
 * These are embedded in the client bundle by Next.js and safe for browser use.
 * All default to empty string when not set (graceful degradation).
 */
export const env = readEnv(webPublicEnvSpec, process.env);

export const appEnv = env.NEXT_PUBLIC_APP_ENV as DeploymentEnvironment;

/** Check if a specific integration is configured */
export const isConfigured = {
  convex: () => hasValue(env.NEXT_PUBLIC_CONVEX_URL),
  posthog: () => hasValue(env.NEXT_PUBLIC_POSTHOG_KEY),
  sentry: () => hasValue(env.NEXT_PUBLIC_SENTRY_DSN),
} as const;
