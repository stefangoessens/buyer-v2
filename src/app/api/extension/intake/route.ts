import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { trackServerEvent } from "@/lib/analytics.server";
import {
  buildExtensionIntakeRedirectUrl,
  type ExtensionIntakeFailureCode,
} from "@/lib/extension/intake-state";
import { env } from "@/lib/env";

const CLERK_SESSION_COOKIE = "__session";

function readBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    return null;
  }
  return token.trim();
}

function readCookieValue(headerValue: string | null, name: string): string | null {
  if (!headerValue) return null;

  for (const part of headerValue.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name || rawValueParts.length === 0) {
      continue;
    }

    const rawValue = rawValueParts.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function resolveConvexAuthToken(request: Request): string | null {
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (bearerToken) {
    return bearerToken;
  }

  if (env.NEXT_PUBLIC_AUTH_PROVIDER !== "clerk") {
    return null;
  }

  // Extension-origin fetches cannot reliably attach an explicit Convex token,
  // but they can carry the buyer-v2 Clerk session cookie via
  // `credentials: "include"`. Reusing that JWT keeps the extension's
  // signed-in branch aligned with the caller's active web session.
  return readCookieValue(request.headers.get("cookie"), CLERK_SESSION_COOKIE);
}

async function trackExtensionFailure(
  code: ExtensionIntakeFailureCode,
  stage: "request" | "submit",
) {
  await trackServerEvent("extension_intake_failed", {
    code,
    stage,
  });
}

export async function POST(request: Request) {
  if (!env.NEXT_PUBLIC_CONVEX_URL) {
    await trackExtensionFailure("backend_unavailable", "request");
    return NextResponse.json(
      {
        ok: false,
        kind: "unsupported",
        code: "backend_unavailable",
        error: "NEXT_PUBLIC_CONVEX_URL is not configured.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await trackExtensionFailure("invalid_request", "request");
    return NextResponse.json(
      {
        ok: false,
        kind: "unsupported",
        code: "invalid_request",
        error: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const url =
    body && typeof body === "object" && "url" in body && typeof body.url === "string"
      ? body.url
      : "";

  if (!url.trim()) {
    await trackExtensionFailure("invalid_request", "request");
    return NextResponse.json(
      {
        ok: false,
        kind: "unsupported",
        code: "invalid_request",
        error: "A listing URL is required.",
      },
      { status: 400 },
    );
  }

  try {
    const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
    const token = resolveConvexAuthToken(request);
    if (token) {
      client.setAuth(token);
    }

    const result = await client.mutation(api.intake.submitExtensionUrl, { url });

    if (result.kind === "unsupported") {
      await trackExtensionFailure(result.code, "submit");
      return NextResponse.json(
        {
          ok: false,
          ...result,
        },
        { status: 422 },
      );
    }

    await trackServerEvent("extension_intake_succeeded", {
      platform: result.platform,
      outcome: result.kind,
      authState: result.authState,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      redirectUrl: buildExtensionIntakeRedirectUrl(
        env.NEXT_PUBLIC_APP_URL,
        result,
      ),
    });
  } catch (error) {
    await trackExtensionFailure("backend_unavailable", "submit");
    return NextResponse.json(
      {
        ok: false,
        kind: "unsupported",
        code: "backend_unavailable",
        error:
          error instanceof Error
            ? error.message
            : "Extension intake request failed.",
      },
      { status: 503 },
    );
  }
}
