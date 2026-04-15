import twilio from "twilio";

export interface ProviderAdapter<TInput, TResult> {
  provider: "twilio";
  send(config: TwilioRuntimeConfig, input: TInput): Promise<TResult>;
}

export type TwilioMessageCategory = "transactional" | "relationship";

export type TwilioProviderState =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "received";

export interface TwilioRuntimeConfig {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
  transactionalMessagingServiceSid: string;
  relationshipMessagingServiceSid: string;
  fromNumber: string;
}

export interface TwilioSendMessageInput {
  to: string;
  body: string;
  category?: TwilioMessageCategory;
  statusCallbackUrl?: string;
  forceBypassOptOut?: boolean;
}

export interface TwilioSendMessageResult {
  sid: string;
  status: TwilioProviderState;
  to: string;
  from: string | null;
  body: string;
}

export interface TwilioVerifyStartResult {
  sid: string;
  status: string;
}

export interface TwilioVerifyCheckResult {
  sid: string;
  status: string;
  valid: boolean;
}

export interface TwilioInboundPayload {
  accountSid: string;
  apiVersion: string | null;
  body: string;
  from: string;
  fromCity: string | null;
  fromCountry: string | null;
  fromState: string | null;
  fromZip: string | null;
  messageSid: string;
  messagingServiceSid: string | null;
  numMedia: number;
  numSegments: number;
  optOutType: string | null;
  to: string;
  toCity: string | null;
  toCountry: string | null;
  toState: string | null;
  toZip: string | null;
}

export interface TwilioStatusPayload {
  accountSid: string;
  apiVersion: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  messageSid: string;
  messageStatus: string;
  messagingServiceSid: string | null;
  to: string | null;
}

export interface TwilioWebhookValidationInput {
  authToken: string;
  signature: string | null;
  url: string;
  params: Record<string, string>;
}

const clientCache = new Map<string, ReturnType<typeof twilio>>();

function cacheKey(config: TwilioRuntimeConfig): string {
  return [
    config.accountSid,
    config.authToken,
    config.verifyServiceSid,
    config.transactionalMessagingServiceSid,
    config.relationshipMessagingServiceSid,
    config.fromNumber,
  ].join(":");
}

export function createTwilioClient(config: TwilioRuntimeConfig) {
  const key = cacheKey(config);
  const cached = clientCache.get(key);
  if (cached) return cached;
  const client = twilio(config.accountSid, config.authToken);
  clientCache.set(key, client);
  return client;
}

export function readTwilioRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): TwilioRuntimeConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const verifyServiceSid = env.TWILIO_VERIFY_SERVICE_SID?.trim();
  const transactionalMessagingServiceSid =
    env.TWILIO_TRANSACTIONAL_MESSAGING_SERVICE_SID?.trim() ??
    env.TWILIO_MESSAGING_SERVICE_SID_TRANSACTIONAL?.trim();
  const relationshipMessagingServiceSid =
    env.TWILIO_RELATIONSHIP_MESSAGING_SERVICE_SID?.trim() ??
    env.TWILIO_MESSAGING_SERVICE_SID_RELATIONSHIP?.trim() ??
    transactionalMessagingServiceSid;
  const fromNumber = env.TWILIO_FROM_NUMBER?.trim() ?? env.TWILIO_SMS_NUMBER?.trim();

  if (
    !accountSid ||
    !authToken ||
    !verifyServiceSid ||
    !transactionalMessagingServiceSid ||
    !relationshipMessagingServiceSid ||
    !fromNumber
  ) {
    return null;
  }

  return {
    accountSid,
    authToken,
    verifyServiceSid,
    transactionalMessagingServiceSid,
    relationshipMessagingServiceSid,
    fromNumber,
  };
}

export function validateTwilioWebhook({
  authToken,
  signature,
  url,
  params,
}: TwilioWebhookValidationInput): boolean {
  if (!signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

export function parseTwilioWebhookParams(
  value: URLSearchParams | FormData,
): Record<string, string> {
  const params = new Map<string, string>();
  const entries =
    value instanceof URLSearchParams ? value.entries() : value.entries();

  for (const [key, rawValue] of entries) {
    if (typeof rawValue === "string") {
      params.set(key, rawValue);
      continue;
    }
    params.set(key, rawValue.name);
  }

  return Object.fromEntries(params);
}

export function normalizeInboundPayload(
  params: Record<string, string>,
): TwilioInboundPayload {
  return {
    accountSid: params.AccountSid ?? "",
    apiVersion: params.ApiVersion ?? null,
    body: params.Body ?? "",
    from: params.From ?? "",
    fromCity: params.FromCity ?? null,
    fromCountry: params.FromCountry ?? null,
    fromState: params.FromState ?? null,
    fromZip: params.FromZip ?? null,
    messageSid: params.MessageSid ?? "",
    messagingServiceSid: params.MessagingServiceSid ?? null,
    numMedia: Number(params.NumMedia ?? "0"),
    numSegments: Number(params.NumSegments ?? "1"),
    optOutType: params.OptOutType ?? null,
    to: params.To ?? "",
    toCity: params.ToCity ?? null,
    toCountry: params.ToCountry ?? null,
    toState: params.ToState ?? null,
    toZip: params.ToZip ?? null,
  };
}

export function normalizeStatusPayload(
  params: Record<string, string>,
): TwilioStatusPayload {
  return {
    accountSid: params.AccountSid ?? "",
    apiVersion: params.ApiVersion ?? null,
    errorCode: params.ErrorCode ?? null,
    errorMessage: params.ErrorMessage ?? null,
    messageSid: params.MessageSid ?? "",
    messageStatus: params.MessageStatus ?? "",
    messagingServiceSid: params.MessagingServiceSid ?? null,
    to: params.To ?? null,
  };
}

export function mapTwilioMessageStatus(status: string | null | undefined): TwilioProviderState {
  const normalized = status?.toLowerCase().trim();

  switch (normalized) {
    case "accepted":
    case "scheduled":
    case "queued":
      return "queued";
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "receiving":
    case "received":
      return "received";
    case "undelivered":
    case "partially_delivered":
      return "undelivered";
    default:
      return "failed";
  }
}

export function isTwilioKeywordWebhook(optOutType: string | null | undefined): boolean {
  if (!optOutType) return false;
  const normalized = optOutType.toUpperCase();
  return normalized === "STOP" || normalized === "START" || normalized === "HELP";
}

export function buildTwimlMessage(body: string | null | undefined): string {
  const safeBody = escapeXml((body ?? "").trim());
  if (!safeBody) {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safeBody}</Message></Response>`;
}

export const twilioProviderAdapter: ProviderAdapter<
  TwilioSendMessageInput,
  TwilioSendMessageResult
> = {
  provider: "twilio",
  async send(config, input) {
    const client = createTwilioClient(config);
    const response = await client.messages.create({
      body: input.body,
      to: input.to,
      messagingServiceSid:
        input.category === "relationship"
          ? config.relationshipMessagingServiceSid
          : config.transactionalMessagingServiceSid,
      statusCallback: input.statusCallbackUrl,
    });

    return {
      sid: response.sid,
      status: mapTwilioMessageStatus(response.status),
      to: response.to ?? input.to,
      from: response.from ?? config.fromNumber,
      body: response.body ?? input.body,
    };
  },
};

export async function sendTwilioMessage(
  config: TwilioRuntimeConfig,
  input: TwilioSendMessageInput,
): Promise<TwilioSendMessageResult> {
  return await twilioProviderAdapter.send(config, input);
}

export async function startTwilioVerification(
  config: TwilioRuntimeConfig,
  phone: string,
): Promise<TwilioVerifyStartResult> {
  const client = createTwilioClient(config);
  const response = await client.verify.v2
    .services(config.verifyServiceSid)
    .verifications.create({
      channel: "sms",
      to: phone,
    });

  return {
    sid: response.sid,
    status: response.status,
  };
}

export async function checkTwilioVerification(
  config: TwilioRuntimeConfig,
  phone: string,
  code: string,
): Promise<TwilioVerifyCheckResult> {
  const client = createTwilioClient(config);
  const response = await client.verify.v2
    .services(config.verifyServiceSid)
    .verificationChecks.create({
      code,
      to: phone,
    });

  return {
    sid: response.sid,
    status: response.status,
    valid: response.valid ?? response.status === "approved",
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
