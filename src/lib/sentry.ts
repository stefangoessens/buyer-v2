import * as Sentry from "@sentry/nextjs";
import { resolveObservabilityContext } from "@/lib/observability";
import { deepScrubPii } from "@/lib/security/pii-guard";

const observabilityContext = resolveObservabilityContext({
  defaultService: "buyer-v2-web",
});

function readContextString(
  context: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = context?.[key];
  return typeof value === "string" ? value : undefined;
}

/** Capture an error with optional context, stripping PII before sending */
export function captureError(
  error: Error | string,
  context?: Record<string, unknown>
) {
  const safeContext = context ? deepScrubPii(context) : undefined;

  Sentry.withScope((scope) => {
    scope.setTag(
      "service",
      readContextString(safeContext, "service") ??
        readContextString(safeContext, "surface") ??
        readContextString(safeContext, "route") ??
        readContextString(safeContext, "check") ??
        readContextString(safeContext, "location") ??
        readContextString(safeContext, "component") ??
        observabilityContext.service,
    );
    scope.setTag("app_service", observabilityContext.service);
    scope.setTag("app_environment", observabilityContext.environment);
    scope.setTag("app_release", observabilityContext.release);
    scope.setTag("app_deployment", observabilityContext.deployment);
    scope.setContext("app", {
      service: observabilityContext.service,
      environment: observabilityContext.environment,
      release: observabilityContext.release,
      deployment: observabilityContext.deployment,
      version: observabilityContext.version,
    });

    if (safeContext) {
      scope.setExtras(safeContext);
    }

    if (typeof error === "string") {
      Sentry.captureMessage(error);
    } else {
      Sentry.captureException(error);
    }
  });
}

/** Set user context for Sentry (use only non-PII identifiers) */
export function setSentryUser(userId: string, role: string) {
  Sentry.setUser({ id: userId, role });
}

/** Clear user context on logout */
export function clearSentryUser() {
  Sentry.setUser(null);
}
