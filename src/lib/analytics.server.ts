import "server-only";

import { EVENT_METADATA, type AnalyticsEventMap, type AnalyticsEventName } from "@/lib/analytics";
import { readPublicEnv } from "@/lib/env";
import { resolveObservabilityContext } from "@/lib/observability";
import { deepScrubPii } from "@/lib/security/pii-guard";

interface TrackServerEventOptions {
  distinctId?: string;
}

export async function trackServerEvent<K extends AnalyticsEventName>(
  event: K,
  properties: AnalyticsEventMap[K],
  options: TrackServerEventOptions = {},
): Promise<boolean> {
  const publicEnv = readPublicEnv(process.env);
  if (!publicEnv.NEXT_PUBLIC_POSTHOG_KEY) {
    return false;
  }

  const metadata = EVENT_METADATA[event];
  const safeProps =
    metadata && !metadata.piiSafe
      ? (deepScrubPii(
          properties as unknown as Record<string, unknown>,
        ) as AnalyticsEventMap[K])
      : properties;
  const context = resolveObservabilityContext({
    defaultService: "buyer-v2-web",
  });

  try {
    const response = await fetch(
      `${publicEnv.NEXT_PUBLIC_POSTHOG_HOST.replace(/\/$/, "")}/capture/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: publicEnv.NEXT_PUBLIC_POSTHOG_KEY,
          event,
          distinct_id:
            options.distinctId ?? `${context.service}:${context.environment}`,
          properties: {
            ...safeProps,
            app_environment: context.environment,
            app_release: context.release,
            app_service: context.service,
            app_deployment: context.deployment,
            source: "server",
          },
        }),
      },
    );

    return response.ok;
  } catch {
    return false;
  }
}
