import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { readEnv, webServerEnvSpec } from "./packages/shared/src/config";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ["@buyer-v2/shared"],
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
};

const serverEnv = readEnv(webServerEnvSpec, process.env);

export default withSentryConfig(nextConfig, {
  org: serverEnv.SENTRY_ORG,
  project: serverEnv.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
