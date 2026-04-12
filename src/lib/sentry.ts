import * as Sentry from "@sentry/nextjs";

/** Capture an error with optional context, stripping PII */
export function captureError(
  error: Error | string,
  context?: Record<string, unknown>
) {
  if (typeof error === "string") {
    Sentry.captureMessage(error, { extra: context });
  } else {
    Sentry.captureException(error, { extra: context });
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
