import { query } from "./_generated/server";
import { v } from "convex/values";

export const check = query({
  args: {},
  returns: v.object({
    status: v.literal("ok"),
    service: v.literal("convex"),
    environment: v.string(),
    release: v.string(),
    version: v.string(),
    timestamp: v.number(),
  }),
  handler: async () => {
    return {
      status: "ok" as const,
      service: "convex" as const,
      environment:
        process.env.CONVEX_ENVIRONMENT ??
        process.env.NODE_ENV ??
        "development",
      release:
        process.env.SENTRY_RELEASE ??
        process.env.RAILWAY_GIT_COMMIT_SHA ??
        process.env.SOURCE_VERSION ??
        "0.0.0",
      version: process.env.npm_package_version ?? "0.0.0",
      timestamp: Date.now(),
    };
  },
});
