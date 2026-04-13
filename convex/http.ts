import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  normalizeSabalWebhookPayload,
  readContractProviderConfig,
  verifySabalWebhookSignature,
} from "./lib/contractProviders";
import {
  buildTwimlMessageResponse,
  parseTwilioInboundSms,
  validateTwilioWebhookSignature,
} from "./lib/twilioSmsWebhook";

const processInboundSmsRef = (
  internal as unknown as {
    smsIntake: { processInboundSms: any };
  }
).smsIntake.processInboundSms;

const http = httpRouter();

http.route({
  path: "/webhooks/twilio/sms",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!authToken) {
      return new Response("Missing TWILIO_AUTH_TOKEN", { status: 503 });
    }

    const formData = await req.formData();
    const signature = req.headers.get("x-twilio-signature");
    const isValidSignature = await validateTwilioWebhookSignature({
      authToken,
      requestUrl: req.url,
      formData,
      signature,
    });
    if (!isValidSignature) {
      return new Response("Unauthorized", { status: 401 });
    }

    const parsed = parseTwilioInboundSms(formData);
    if (!parsed.ok) {
      return new Response(parsed.error, { status: 400 });
    }

    const result = await ctx.runMutation(
      processInboundSmsRef,
      {
        messageSid: parsed.payload.messageSid,
        fromPhone: parsed.payload.fromPhone,
        toPhone: parsed.payload.toPhone,
        body: parsed.payload.body,
      },
    );

    return new Response(
      buildTwimlMessageResponse(
        result.replySent ? result.replyBody : undefined,
      ),
      {
        status: 200,
        headers: { "content-type": "text/xml; charset=utf-8" },
      },
    );
  }),
});

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
