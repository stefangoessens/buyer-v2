export interface TwilioInboundSmsPayload {
  messageSid: string;
  fromPhone: string;
  toPhone: string;
  body: string;
}

type ParseTwilioInboundSmsResult =
  | { ok: true; payload: TwilioInboundSmsPayload }
  | { ok: false; error: string };

/**
 * Extract the minimum Twilio SMS fields we need from an inbound
 * `application/x-www-form-urlencoded` webhook payload.
 */
export function parseTwilioInboundSms(
  formData: FormData,
): ParseTwilioInboundSmsResult {
  const messageSid = readRequiredString(formData, "MessageSid");
  if (!messageSid.ok) return messageSid;

  const fromPhone = readRequiredString(formData, "From");
  if (!fromPhone.ok) return fromPhone;

  const toPhone = readRequiredString(formData, "To");
  if (!toPhone.ok) return toPhone;

  const bodyValue = formData.get("Body");
  const body =
    typeof bodyValue === "string"
      ? bodyValue
      : bodyValue === null
        ? ""
        : String(bodyValue);

  return {
    ok: true,
    payload: {
      messageSid: messageSid.value,
      fromPhone: fromPhone.value,
      toPhone: toPhone.value,
      body,
    },
  };
}

export async function computeTwilioWebhookSignature(args: {
  authToken: string;
  requestUrl: string;
  formData: FormData;
}): Promise<string> {
  const payload = buildSignaturePayload(args.requestUrl, args.formData);
  const sigBytes = await hmacSha1(args.authToken, payload);
  return Buffer.from(sigBytes).toString("base64");
}

export async function validateTwilioWebhookSignature(args: {
  authToken: string;
  requestUrl: string;
  formData: FormData;
  signature: string | null;
}): Promise<boolean> {
  if (!args.signature) return false;
  const expected = await computeTwilioWebhookSignature(args);
  return constantTimeEqual(args.signature, expected);
}

export function buildTwimlMessageResponse(message?: string): string {
  if (!message) {
    return "<Response></Response>";
  }
  return `<Response><Message>${escapeXml(message)}</Message></Response>`;
}

function buildSignaturePayload(requestUrl: string, formData: FormData): string {
  const grouped = new Map<string, Array<string>>();

  for (const [key, rawValue] of formData.entries()) {
    const value =
      typeof rawValue === "string"
        ? rawValue
        : rawValue instanceof File
          ? rawValue.name
          : String(rawValue);

    const values = grouped.get(key);
    if (values) {
      values.push(value);
    } else {
      grouped.set(key, [value]);
    }
  }

  const sortedKeys = [...grouped.keys()].sort();
  let payload = requestUrl;
  for (const key of sortedKeys) {
    for (const value of grouped.get(key) ?? []) {
      payload += `${key}${value}`;
    }
  }

  return payload;
}

function readRequiredString(
  formData: FormData,
  field: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `Missing required Twilio field: ${field}` };
  }
  return { ok: true, value };
}

async function hmacSha1(key: string, payload: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
