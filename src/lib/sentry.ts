import * as Sentry from "@sentry/nextjs";
import { stripPii } from "@/lib/security/pii-guard";

/** Capture an error with optional context, stripping PII before sending */
export function captureError(
  error: Error | string,
  context?: Record<string, unknown>
) {
  const safeContext = context ? stripPii(context) : undefined;
  if (typeof error === "string") {
    Sentry.captureMessage(error, { extra: safeContext });
  } else {
    Sentry.captureException(error, { extra: safeContext });
  }
}

/** Set user context for Sentry (use only non-PII identifiers) */
export function setSentryUser(userId: string, role: string) {
  Sentry.setUser({ id: userId, role });
}

/** Clear user context on logout */
export function clearSentryUser() {
  Sentry.setUser(null);
}
