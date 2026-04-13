import * as Sentry from "@sentry/nextjs";
import { resolveObservabilityContext } from "./src/lib/observability";
import { deepScrubPii } from "./src/lib/security/pii-guard";

const context = resolveObservabilityContext({
  defaultService: "buyer-v2-web",
});

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: context.environment,
  release: context.release,
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  beforeSend(event) {
    if (event.extra) {
      event.extra = deepScrubPii(event.extra as Record<string, unknown>);
    }

    if (event.request?.data && typeof event.request.data === "object") {
      event.request.data = deepScrubPii(
        event.request.data as Record<string, unknown>,
      );
    }

    if (event.request?.headers) {
      const headers = { ...event.request.headers };
      delete headers.authorization;
      delete headers.cookie;
      delete headers.Authorization;
      delete headers.Cookie;
      event.request.headers = headers;
    }

    if (event.user) {
      event.user = {
        id: event.user.id,
        ip_address: undefined,
      };
    }

    event.tags = {
      ...event.tags,
      service: context.service,
      deployment: context.deployment,
    };

    event.contexts = {
      ...event.contexts,
      app: {
        service: context.service,
        environment: context.environment,
        release: context.release,
        deployment: context.deployment,
        version: context.version,
      },
    };

    return event;
  },
});

Sentry.setTag("service", context.service);
Sentry.setTag("deployment", context.deployment);
Sentry.setContext("app", {
  service: context.service,
  environment: context.environment,
  release: context.release,
  deployment: context.deployment,
  version: context.version,
});
