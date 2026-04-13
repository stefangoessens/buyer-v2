import "server-only";
import { readEnv, webServerEnvSpec } from "@buyer-v2/shared";

/**
 * Server-only environment variables.
 * Importing this module in a client component will cause a build error.
 * These secrets must never be exposed to the browser.
 */
export const serverEnv = readEnv(webServerEnvSpec, process.env);

/** Check if we're in production */
export const isProduction = serverEnv.NODE_ENV === "production";
