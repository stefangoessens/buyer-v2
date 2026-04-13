// NOTE: intentionally NOT importing "server-only" — this module is also
// reached by Convex bundling (convex/engines/pricing → src/lib/ai/*),
// and `server-only` throws in Convex's runtime. The functions below are
// still server-only by convention: NEXT_PUBLIC_ prefixes are the real
// client/server boundary, and importing this file from a Client
// Component would fail TypeScript's process.env access anyway.
import {
  requireEnvKeys,
  readEnv,
  validateEnv,
  webServerEnvSpec,
} from "@buyer-v2/shared";

type EnvSource = Record<string, string | undefined>;

/**
 * Server-only environment variables.
 * Importing this module in a client component will cause a build error.
 * These secrets must never be exposed to the browser.
 */
export function readServerEnv(source: EnvSource = process.env) {
  return readEnv(webServerEnvSpec, source);
}

export function getServerEnvIssues(source: EnvSource = process.env) {
  return validateEnv(webServerEnvSpec, source);
}

export function requireServerEnv<
  const TKeys extends readonly (keyof typeof webServerEnvSpec)[],
>(...keys: TKeys) {
  return requireEnvKeys(webServerEnvSpec, keys, process.env);
}

export const serverEnv = readServerEnv();

/** Check if we're in production */
export const isProduction = serverEnv.NODE_ENV === "production";
