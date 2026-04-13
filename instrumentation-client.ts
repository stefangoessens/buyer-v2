import * as Sentry from "@sentry/nextjs";
import { resolveObservabilityContext } from "./src/lib/observability";
import { stripPii } from "./src/lib/security/pii-guard";

const context = resolveObservabilityContext({
  defaultService: "buyer-v2-web",
});

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: context.environment,
  release: context.release,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
  beforeSend(event) {
    if (event.extra) {
      event.extra = stripPii(event.extra as Record<string, unknown>);
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
