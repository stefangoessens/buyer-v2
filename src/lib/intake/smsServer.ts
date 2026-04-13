import "server-only";

/**
 * Resolve the shared HMAC secret used to verify SMS intake links on the web
 * side. This mirrors the Convex-side rules so signed links fail closed in
 * hosted environments and only use a placeholder secret in dev/test.
 */
export function getSmsSignedLinkSecret(): string {
  const fromEnv =
    process.env.SMS_SIGNED_LINK_SECRET ?? process.env.SMS_REPLY_LINK_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const isLocal =
    process.env.NODE_ENV === "test" ||
    process.env.NODE_ENV === "development" ||
    process.env.CONVEX_ENVIRONMENT === "dev";

  if (isLocal) {
    return "buyer-v2-dev-placeholder-secret-do-not-use-in-prod";
  }

  throw new Error(
    "SMS_SIGNED_LINK_SECRET is not set. Refusing to verify SMS intake links with a predictable key.",
  );
}
