import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import {
  normalizeSabalWebhookPayload,
  readContractProviderConfig,
  verifySabalWebhookSignature,
} from "./lib/contractProviders";
import {
  verifyMessagePreferencesUnsubscribeToken,
} from "./lib/messagePreferences";

const http = httpRouter();

auth.addHttpRoutes(http);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireHttpUserId(ctx: Parameters<typeof httpAction>[0] extends never ? never : any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  return await ctx.runQuery(internal.messagePreferences.resolveUserIdForAuthIdentity, {
    tokenIdentifier: identity.tokenIdentifier,
    issuer: identity.issuer,
    subject: identity.subject,
  });
}

async function readJsonBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

for (const route of [
  {
    path: "/preferences/get",
    method: "POST" as const,
    handler: httpAction(async (ctx, _req) => {
      const userId = await requireHttpUserId(ctx);
      if (!userId) {
        return jsonResponse({ ok: false, error: "not_authenticated" }, 401);
      }
      const preferences = await ctx.runQuery(
        internal.messagePreferences.getForUserIdInternal,
        { userId },
      );
      return jsonResponse({
        hasStoredPreferences: preferences.hasStoredPreferences,
        channels: preferences.channels,
        categories: preferences.categories,
        preferences,
      });
    }),
  },
  {
    path: "/preferences/upsert",
    method: "POST" as const,
    handler: httpAction(async (ctx, req) => {
      const userId = await requireHttpUserId(ctx);
      if (!userId) {
        return jsonResponse({ ok: false, error: "not_authenticated" }, 401);
      }
      const body = (await readJsonBody(req)) ?? {};
      const preferences = await ctx.runMutation(
        internal.messagePreferences.upsertForUserIdInternal,
        {
          userId,
          actorUserId: userId,
          channels: body.channels,
          categories: body.categories,
          matrix: body.matrix,
          quietHours: body.quietHours,
          source: body.source ?? "legacy_client",
        },
      );
      return jsonResponse(preferences);
    }),
  },
  {
    path: "/preferences/optOutAll",
    method: "POST" as const,
    handler: httpAction(async (ctx, req) => {
      const userId = await requireHttpUserId(ctx);
      if (!userId) {
        return jsonResponse({ ok: false, error: "not_authenticated" }, 401);
      }
      const body = (await readJsonBody(req)) ?? {};
      const preferences = await ctx.runMutation(
        internal.messagePreferences.optOutAllForUserIdInternal,
        {
          userId,
          actorUserId: userId,
          source: body.source ?? "legacy_client",
        },
      );
      return jsonResponse(preferences);
    }),
  },
  {
    path: "/preferences/reset",
    method: "POST" as const,
    handler: httpAction(async (ctx, req) => {
      const userId = await requireHttpUserId(ctx);
      if (!userId) {
        return jsonResponse({ ok: false, error: "not_authenticated" }, 401);
      }
      const body = (await readJsonBody(req)) ?? {};
      const preferences = await ctx.runMutation(
        internal.messagePreferences.resetForUserIdInternal,
        {
          userId,
          actorUserId: userId,
          source: body.source ?? "legacy_client",
        },
      );
      return jsonResponse(preferences);
    }),
  },
]) {
  http.route(route);
}

for (const method of ["GET", "POST"] as const) {
  http.route({
    path: "/preferences/unsubscribe",
    method,
    handler: httpAction(async (ctx, req) => {
      const secret = process.env.PREFERENCES_UNSUBSCRIBE_SECRET;
      if (!secret) {
        return new Response("Missing unsubscribe secret", { status: 503 });
      }
      const url = new URL(req.url);
      const token =
        url.searchParams.get("token") ??
        (method === "POST"
          ? ((await readJsonBody(req))?.token as string | undefined)
          : undefined);
      if (!token) {
        return new Response("Missing unsubscribe token", { status: 400 });
      }
      try {
        const verification = await verifyMessagePreferencesUnsubscribeToken({
          token,
          secret,
        });
        if (!verification.valid) {
          throw new Error(`Invalid unsubscribe request (${verification.reason})`);
        }
        const payload = verification.claims;
        const result = await ctx.runMutation(
          internal.messagePreferences.unsubscribeByTokenInternal,
          {
            userId: payload.sub as any,
            category: payload.cat as any,
            channel: payload.chn as any,
            tokenJti: payload.jti,
          },
        );
        return new Response(
          `<html><body><h1>Preference updated</h1><p>${result.status === "updated" ? "The selected notification was turned off." : "That notification was already off."}</p></body></html>`,
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        );
      } catch (error) {
        return new Response(
          `<html><body><h1>Unable to update preference</h1><p>${error instanceof Error ? error.message : "Invalid unsubscribe request."}</p></body></html>`,
          {
            status: 400,
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        );
      }
    }),
  });
}

http.route({
  path: "/contracts/sabal-sign/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const config = readContractProviderConfig();
    if (!config.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "missing_provider_config",
          missing: config.missing,
        }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (
      !verifySabalWebhookSignature(
        req.headers,
        config.config.sabalSignWebhookSecret,
      )
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.text();
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const event = normalizeSabalWebhookPayload(payload);
    if (!event) {
      return new Response("Unsupported webhook payload", { status: 400 });
    }

    const result = await ctx.runAction(internal.contracts.processSignatureWebhook, {
      event,
      payloadJson: body,
    });

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

export default http;
