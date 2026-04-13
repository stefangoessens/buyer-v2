import type { AuthConfig } from "convex/server";

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const providers: AuthConfig["providers"] = [];

if (
  hasValue(process.env.CLERK_JWT_ISSUER_DOMAIN) &&
  hasValue(process.env.CONVEX_CLERK_APPLICATION_ID)
) {
  providers.push({
    domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
    applicationID: process.env.CONVEX_CLERK_APPLICATION_ID,
  });
}

if (
  hasValue(process.env.AUTH0_ISSUER_BASE_URL) &&
  hasValue(process.env.AUTH0_API_AUDIENCE)
) {
  providers.push({
    domain: process.env.AUTH0_ISSUER_BASE_URL,
    applicationID: process.env.AUTH0_API_AUDIENCE,
  });
}

export default { providers } satisfies AuthConfig;
