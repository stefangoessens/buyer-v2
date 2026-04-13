import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { trackServerEvent } from "@/lib/analytics.server";
import { env, isConfigured } from "@/lib/env";
import { resolveObservabilityContext } from "@/lib/observability";
import { captureError } from "@/lib/sentry";

type CheckState = "ok" | "error" | "skipped";

interface CheckResult {
  status: CheckState;
  detail: string;
  latencyMs?: number;
  checkedAt: string;
  metadata?: Record<string, unknown>;
}

async function runConvexCheck(): Promise<CheckResult> {
  const checkedAt = new Date().toISOString();
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    return {
      status: "skipped",
      detail: "NEXT_PUBLIC_CONVEX_URL is not configured",
      checkedAt,
    };
  }

  const start = performance.now();

  try {
    const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
    const result = await client.query(api.health.check, {});

    return {
      status: "ok",
      detail: "Convex reachable",
      checkedAt,
      latencyMs: Math.round(performance.now() - start),
      metadata: result,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    const message =
      error instanceof Error ? error.message : "Unknown Convex health failure";

    captureError(error instanceof Error ? error : String(error), {
      surface: "health_route",
      check: "convex",
      latencyMs,
    });
    await trackServerEvent("health_check_failed", {
      check: "convex",
      status: 503,
    });

    return {
      status: "error",
      detail: message,
      checkedAt,
      latencyMs,
    };
  }
}

export async function GET() {
  const context = resolveObservabilityContext({
    defaultService: "buyer-v2-web",
    defaultVersion: "0.0.0",
  });
  const timestamp = new Date().toISOString();
  const convex = await runConvexCheck();
  const degraded = convex.status === "error";

  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      timestamp,
      version: context.version,
      release: context.release,
      environment: context.environment,
      service: context.service,
      deployment: context.deployment,
      uptimeMs: Math.round(process.uptime() * 1000),
      checks: {
        web: {
          status: "ok",
          detail: "Route handler reachable",
          checkedAt: timestamp,
        },
        convex,
        observability: {
          status: "ok",
          detail: "Observability providers evaluated",
          checkedAt: timestamp,
          metadata: {
            sentryConfigured: isConfigured.sentry(),
            posthogConfigured: isConfigured.posthog(),
          },
        },
      },
    },
    { status: degraded ? 503 : 200 },
  );
}
