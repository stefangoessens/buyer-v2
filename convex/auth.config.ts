import type { AuthConfig } from "convex/server";

// Convex Auth (self-hosted JWT). The domain must match CONVEX_SITE_URL on the
// Convex deployment — this is the issuer embedded in every access token that
// convexAuth() mints via `@convex-dev/auth`. Clerk / Auth0 configs were
// removed when the platform moved to @convex-dev/auth.
const domain = process.env.CONVEX_SITE_URL ?? "";

export default {
  providers: [
    {
      domain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
