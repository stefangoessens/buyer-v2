import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { readEnv, webServerEnvSpec } from "./packages/shared/src/config";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ["@buyer-v2/shared"],
  // Typecheck runs as a separate CI gate; ESLint is informational
  // during Railway production builds so we never block deploys on
  // pure style rules like react/no-unescaped-entities.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "photos.zillowstatic.com" },
      { protocol: "https", hostname: "**.zillowstatic.com" },
      { protocol: "https", hostname: "ssl.cdn-redfin.com" },
      { protocol: "https", hostname: "**.cdn-redfin.com" },
      { protocol: "https", hostname: "ap.rdcpix.com" },
      { protocol: "https", hostname: "**.rdcpix.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/profile", destination: "/dashboard/profile", permanent: true },
      { source: "/favourites", destination: "/dashboard/favourites", permanent: true },
      { source: "/agreements", destination: "/dashboard/agreements", permanent: true },
      { source: "/compare", destination: "/dashboard", permanent: true },
      { source: "/reports", destination: "/dashboard", permanent: true },
      { source: "/savings", destination: "/pricing#savings-calculator", permanent: true },
      { source: "/calculator", destination: "/pricing#savings-calculator", permanent: true },
    ];
  },
};

const serverEnv = readEnv(webServerEnvSpec, process.env);

export default withSentryConfig(nextConfig, {
  org: serverEnv.SENTRY_ORG,
  project: serverEnv.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
