import {
  applyLegacyCategoryAlias,
  type MessageCategory,
  type MessageChannel,
} from "@/lib/messagePreferences";

export const UNSUBSCRIBE_TOKEN_AUDIENCE = "buyer-v2/preferences/unsubscribe";
export const UNSUBSCRIBE_TOKEN_ISSUER = "buyer-v2";
export const DEFAULT_UNSUBSCRIBE_TOKEN_TTL_SECONDS = 60 * 60 * 24;

export type UnsubscribeTokenPayload = {
  userId: string;
  category: MessageCategory;
  channel: MessageChannel;
  jti: string;
  iat: number;
  exp: number;
  aud: typeof UNSUBSCRIBE_TOKEN_AUDIENCE;
  iss: typeof UNSUBSCRIBE_TOKEN_ISSUER;
};

type SignArgs = {
  userId: string;
  category: MessageCategory | "updates";
  channel: MessageChannel;
  secret: string;
  now?: Date;
  ttlSeconds?: number;
  jti?: string;
};

function base64UrlEncode(input: Uint8Array): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new Uint8Array(Buffer.from(padded, "base64"));
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export async function signUnsubscribeToken(args: SignArgs): Promise<string> {
  const issuedAt = Math.floor((args.now ?? new Date()).getTime() / 1000);
  const payload: UnsubscribeTokenPayload = {
    userId: args.userId,
    category: applyLegacyCategoryAlias(args.category),
    channel: args.channel,
    jti:
      args.jti ??
      `${args.userId}:${applyLegacyCategoryAlias(args.category)}:${args.channel}:${issuedAt}`,
    iat: issuedAt,
    exp: issuedAt + (args.ttlSeconds ?? DEFAULT_UNSUBSCRIBE_TOKEN_TTL_SECONDS),
    aud: UNSUBSCRIBE_TOKEN_AUDIENCE,
    iss: UNSUBSCRIBE_TOKEN_ISSUER,
  };
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const signingInput = `${base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header)),
  )}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))}`;
  const signature = await hmacSha256(signingInput, args.secret);
  return `${signingInput}.${signature}`;
}

export async function verifyUnsubscribeToken(args: {
  token: string;
  secret: string;
  now?: Date;
}): Promise<UnsubscribeTokenPayload> {
  const [encodedHeader, encodedPayload, signature] = args.token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("Malformed unsubscribe token");
  }
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = await hmacSha256(signingInput, args.secret);
  if (expectedSignature !== signature) {
    throw new Error("Invalid unsubscribe token signature");
  }
  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(encodedPayload)),
  ) as Partial<UnsubscribeTokenPayload>;
  if (
    payload.aud !== UNSUBSCRIBE_TOKEN_AUDIENCE ||
    payload.iss !== UNSUBSCRIBE_TOKEN_ISSUER
  ) {
    throw new Error("Invalid unsubscribe token audience");
  }
  if (
    typeof payload.userId !== "string" ||
    typeof payload.category !== "string" ||
    typeof payload.channel !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Malformed unsubscribe token payload");
  }
  const nowSeconds = Math.floor((args.now ?? new Date()).getTime() / 1000);
  if (payload.exp <= nowSeconds) {
    throw new Error("Expired unsubscribe token");
  }
  return {
    ...payload,
    category: applyLegacyCategoryAlias(payload.category as MessageCategory),
  } as UnsubscribeTokenPayload;
}
