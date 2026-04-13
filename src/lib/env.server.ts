import "server-only";
import {
  readEnv,
  type DeploymentEnvironment,
  webServerEnvSpec,
} from "@buyer-v2/shared";

/**
 * Server-only environment variables.
 * Importing this module in a client component will cause a build error.
 * These secrets must never be exposed to the browser.
 */
export const serverEnv = readEnv(webServerEnvSpec, process.env);

export const appEnv = serverEnv.APP_ENV as DeploymentEnvironment;

/** Check if we're in production */
export const isProduction = appEnv === "production";
