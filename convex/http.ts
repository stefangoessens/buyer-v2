import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import {
  normalizeSabalWebhookPayload,
  readContractProviderConfig,
  verifySabalWebhookSignature,
} from "./lib/contractProviders";

const http = httpRouter();

auth.addHttpRoutes(http);

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
