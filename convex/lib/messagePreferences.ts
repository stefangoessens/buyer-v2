import { isValidTimezone } from "./scheduling";

export const MESSAGE_CATEGORIES = [
  "transactional",
  "tours",
  "offers",
  "closing",
  "disclosures",
  "market_updates",
  "marketing",
  "safety",
] as const;

export const LEGACY_MESSAGE_CATEGORIES = [
  "transactional",
  "tours",
  "offers",
  "updates",
  "marketing",
] as const;

export const MESSAGE_CHANNELS = ["email", "sms", "push", "inApp"] as const;

export const QUIET_HOURS_DEFAULT_TIMEZONE = "America/New_York";
export const QUIET_HOURS_DEFAULT_START_MINUTES = 21 * 60;
export const QUIET_HOURS_DEFAULT_END_MINUTES = 8 * 60;

export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];
export type LegacyMessageCategory = (typeof LEGACY_MESSAGE_CATEGORIES)[number];
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export type ChannelEnablement = {
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
};

export type LegacyCategoryEnablement = {
  transactional: boolean;
  tours: boolean;
  offers: boolean;
  updates: boolean;
  marketing: boolean;
};

export type MessagePreferenceMatrix = Record<MessageCategory, ChannelEnablement>;

export type QuietHours = {
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
  timezone: string;
};

export type SmsConsentStatus = "unknown" | "opted_in" | "opted_out" | "suppressed";

export type MessagePreferenceSmsState = {
  consentStatus: SmsConsentStatus;
  isGloballySuppressed: boolean;
  reason: "sms_stop" | "manual_suppression" | null;
  phoneMissing: boolean;
  updatedAt: string | null;
};

export type MessagePreferences = {
  matrix: MessagePreferenceMatrix;
  quietHours: QuietHours;
};

export type MessagePreferencesView = MessagePreferences & {
  hasStoredPreferences: boolean;
  channels: ChannelEnablement;
  categories: LegacyCategoryEnablement;
  effective: {
    matrix: MessagePreferenceMatrix;
    sms: MessagePreferenceSmsState;
  };
};

export type MatrixPatch = Partial<Record<MessageCategory, Partial<ChannelEnablement>>>;

export type PartialMessagePreferences = {
  matrix?: MatrixPatch;
  quietHours?: Partial<QuietHours>;
  channels?: Partial<ChannelEnablement>;
  categories?: Partial<LegacyCategoryEnablement>;
};

export type LegacyMessagePreferenceRow = {
  channels?: Partial<ChannelEnablement>;
  categories?: Partial<LegacyCategoryEnablement>;
};

export type PreferenceAuditSnapshot = {
  schemaVersion: 1;
  before: MessagePreferences;
  after: MessagePreferences;
  actorUserId: string | null;
  subjectUserId: string;
  source: string;
  timestamp: string;
  tokenJti?: string;
};

export type PreferenceAuditEntryLike = {
  details?: string | null;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
};

export type MessagePreferencesResolution =
  | { source: "audit"; hasStoredPreferences: true; preferences: MessagePreferences }
  | { source: "legacy"; hasStoredPreferences: true; preferences: MessagePreferences }
  | { source: "default"; hasStoredPreferences: false; preferences: MessagePreferences };

export type MessagePreferencesUnsubscribeTokenClaims = {
  iss: "buyer-v2";
  aud: "message_preferences_unsubscribe";
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  cat: MessageCategory;
  chn: MessageChannel;
  src?: string;
  ver: 1;
};

export type MessagePreferencesUnsubscribeTokenResult =
  | { valid: true; claims: MessagePreferencesUnsubscribeTokenClaims }
  | {
      valid: false;
      reason:
        | "malformed"
        | "invalid_signature"
        | "expired"
        | "future"
        | "invalid_claims"
        | "unsupported_channel";
    };

const TRUE_CHANNELS: ChannelEnablement = {
  email: true,
  sms: true,
  push: true,
  inApp: true,
};

const FALSE_CHANNELS: ChannelEnablement = {
  email: false,
  sms: false,
  push: false,
  inApp: false,
};

const DEFAULT_CATEGORY_ENABLED: Record<MessageCategory, boolean> = {
  transactional: true,
  tours: true,
  offers: true,
  closing: true,
  disclosures: true,
  market_updates: false,
  marketing: false,
  safety: true,
};

const LEGACY_CHANNEL_MATRIX_TARGETS: readonly MessageCategory[] = [
  "transactional",
  "tours",
  "offers",
  "closing",
  "disclosures",
];

const MUTABLE_CATEGORIES: readonly MessageCategory[] = MESSAGE_CATEGORIES.filter(
  (category) => category !== "safety",
);

const AUDIT_ACTION = "message_preferences.updated";
const UNSUBSCRIBE_AUDIT_ACTION = "message_preferences.unsubscribe";

function cloneChannels(channels: ChannelEnablement): ChannelEnablement {
  return { ...channels };
}

function normalizeMinutes(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new Error("Quiet-hours minutes must be an integer between 0 and 1439");
  }
  return value;
}

export function defaultChannelState(enabled: boolean): ChannelEnablement {
  return enabled ? cloneChannels(TRUE_CHANNELS) : cloneChannels(FALSE_CHANNELS);
}

export function defaultQuietHours(): QuietHours {
  return {
    enabled: false,
    startMinutes: QUIET_HOURS_DEFAULT_START_MINUTES,
    endMinutes: QUIET_HOURS_DEFAULT_END_MINUTES,
    timezone: QUIET_HOURS_DEFAULT_TIMEZONE,
  };
}

export function isValidTimezoneValue(tz: string): boolean {
  return isValidTimezone(tz);
}

export function validateQuietHours(input: QuietHours): QuietHours {
  if (!isValidTimezone(input.timezone)) {
    throw new Error(`Unknown IANA timezone: ${input.timezone}`);
  }
  const startMinutes = normalizeMinutes(input.startMinutes);
  const endMinutes = normalizeMinutes(input.endMinutes);
  if (startMinutes === endMinutes) {
    throw new Error("Quiet-hours start and end cannot be the same minute");
  }
  return {
    enabled: input.enabled,
    startMinutes,
    endMinutes,
    timezone: input.timezone,
  };
}

function defaultCategoryChannels(category: MessageCategory): ChannelEnablement {
  return DEFAULT_CATEGORY_ENABLED[category]
    ? cloneChannels(TRUE_CHANNELS)
    : cloneChannels(FALSE_CHANNELS);
}

function copyMatrix(matrix: MessagePreferenceMatrix): MessagePreferenceMatrix {
  return {
    transactional: cloneChannels(matrix.transactional),
    tours: cloneChannels(matrix.tours),
    offers: cloneChannels(matrix.offers),
    closing: cloneChannels(matrix.closing),
    disclosures: cloneChannels(matrix.disclosures),
    market_updates: cloneChannels(matrix.market_updates),
    marketing: cloneChannels(matrix.marketing),
    safety: cloneChannels(matrix.safety),
  };
}

export function ensureSafetyRow(
  matrix: MessagePreferenceMatrix,
): MessagePreferenceMatrix {
  return {
    ...matrix,
    safety: cloneChannels(TRUE_CHANNELS),
  };
}

export function defaultPreferences(): MessagePreferences {
  return {
    matrix: ensureSafetyRow({
      transactional: defaultCategoryChannels("transactional"),
      tours: defaultCategoryChannels("tours"),
      offers: defaultCategoryChannels("offers"),
      closing: defaultCategoryChannels("closing"),
      disclosures: defaultCategoryChannels("disclosures"),
      market_updates: defaultCategoryChannels("market_updates"),
      marketing: defaultCategoryChannels("marketing"),
      safety: cloneChannels(TRUE_CHANNELS),
    }),
    quietHours: defaultQuietHours(),
  };
}

export function applyLegacyCategoryAlias(
  category: MessageCategory | LegacyMessageCategory,
): MessageCategory {
  return category === "updates" ? "market_updates" : category;
}

export function migrateLegacyPreferences(
  legacy?: LegacyMessagePreferenceRow | null,
): MessagePreferences {
  const base = defaultPreferences();
  if (!legacy) {
    return base;
  }

  const next = copyMatrix(base.matrix);
  const categories = legacy.categories ?? {};
  const channels = legacy.channels ?? {};

  for (const legacyCategory of LEGACY_MESSAGE_CATEGORIES) {
    const rawValue = categories[legacyCategory];
    if (rawValue === undefined) continue;
    const mapped = applyLegacyCategoryAlias(legacyCategory);
    next[mapped] = rawValue
      ? defaultCategoryChannels(mapped)
      : cloneChannels(FALSE_CHANNELS);
  }

  for (const channel of MESSAGE_CHANNELS) {
    const rawValue = channels[channel];
    if (rawValue === undefined) continue;
    for (const category of LEGACY_CHANNEL_MATRIX_TARGETS) {
      next[category][channel] = rawValue;
    }
    if (!rawValue) {
      next.market_updates[channel] = false;
      next.marketing[channel] = false;
    }
  }

  return {
    matrix: ensureSafetyRow(next),
    quietHours: defaultQuietHours(),
  };
}

export function deriveLegacyChannels(
  prefs: MessagePreferences,
): ChannelEnablement {
  const channels: ChannelEnablement = {
    email: true,
    sms: true,
    push: true,
    inApp: true,
  };
  for (const channel of MESSAGE_CHANNELS) {
    channels[channel] = LEGACY_CHANNEL_MATRIX_TARGETS.every(
      (category) => prefs.matrix[category][channel],
    );
  }
  return channels;
}

export function deriveLegacyCategories(
  prefs: MessagePreferences,
): LegacyCategoryEnablement {
  return {
    transactional: MESSAGE_CHANNELS.some(
      (channel) => prefs.matrix.transactional[channel],
    ),
    tours: MESSAGE_CHANNELS.some((channel) => prefs.matrix.tours[channel]),
    offers: MESSAGE_CHANNELS.some((channel) => prefs.matrix.offers[channel]),
    updates: MESSAGE_CHANNELS.some(
      (channel) => prefs.matrix.market_updates[channel],
    ),
    marketing: MESSAGE_CHANNELS.some(
      (channel) => prefs.matrix.marketing[channel],
    ),
  };
}

function applyLegacyChannelsPatch(
  matrix: MessagePreferenceMatrix,
  patch: Partial<ChannelEnablement>,
): MessagePreferenceMatrix {
  const next = copyMatrix(matrix);
  for (const channel of MESSAGE_CHANNELS) {
    const value = patch[channel];
    if (value === undefined) continue;
    if (value) {
      for (const category of LEGACY_CHANNEL_MATRIX_TARGETS) {
        next[category][channel] = true;
      }
      continue;
    }
    for (const category of MUTABLE_CATEGORIES) {
      next[category][channel] = false;
    }
  }
  return next;
}

function applyLegacyCategoriesPatch(
  matrix: MessagePreferenceMatrix,
  patch: Partial<LegacyCategoryEnablement>,
): MessagePreferenceMatrix {
  const next = copyMatrix(matrix);
  for (const legacyCategory of LEGACY_MESSAGE_CATEGORIES) {
    const value = patch[legacyCategory];
    if (value === undefined) continue;
    const mapped = applyLegacyCategoryAlias(legacyCategory);
    next[mapped] = value
      ? defaultCategoryChannels(mapped)
      : cloneChannels(FALSE_CHANNELS);
  }
  return next;
}

export function mergePreferences(
  existing: MessagePreferences,
  updates: PartialMessagePreferences,
): MessagePreferences {
  let nextMatrix = copyMatrix(existing.matrix);

  if (updates.matrix) {
    for (const category of MESSAGE_CATEGORIES) {
      const rowPatch = updates.matrix[category];
      if (!rowPatch) continue;
      nextMatrix[category] = {
        ...nextMatrix[category],
        ...rowPatch,
      };
    }
  }

  if (updates.channels) {
    nextMatrix = applyLegacyChannelsPatch(nextMatrix, updates.channels);
  }

  if (updates.categories) {
    nextMatrix = applyLegacyCategoriesPatch(nextMatrix, updates.categories);
  }

  let quietHours = existing.quietHours;
  if (updates.quietHours) {
    quietHours = validateQuietHours({
      ...quietHours,
      ...updates.quietHours,
    });
  }

  return {
    matrix: ensureSafetyRow(nextMatrix),
    quietHours,
  };
}

export function optOutAllChannels(
  existing: MessagePreferences,
): MessagePreferences {
  const next = copyMatrix(existing.matrix);
  for (const category of MUTABLE_CATEGORIES) {
    next[category] = cloneChannels(FALSE_CHANNELS);
  }
  return {
    matrix: ensureSafetyRow(next),
    quietHours: existing.quietHours,
  };
}

export function isGloballyOptedOut(prefs: MessagePreferences): boolean {
  return MUTABLE_CATEGORIES.every((category) =>
    MESSAGE_CHANNELS.every((channel) => !prefs.matrix[category][channel]),
  );
}

export function shouldAlwaysDeliverInApp(category: MessageCategory): boolean {
  return category === "safety";
}

export function shouldAlwaysDeliver(category: MessageCategory): boolean {
  return category === "safety";
}

export function isWithinQuietHours(
  quietHours: QuietHours,
  now: Date = new Date(),
): boolean {
  if (!quietHours.enabled) return false;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: quietHours.timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  const minutes = hour * 60 + minute;
  if (quietHours.startMinutes < quietHours.endMinutes) {
    return (
      minutes >= quietHours.startMinutes && minutes < quietHours.endMinutes
    );
  }
  return minutes >= quietHours.startMinutes || minutes < quietHours.endMinutes;
}

export function isChannelDeferredByQuietHours(
  prefs: MessagePreferences,
  channel: MessageChannel,
  category: MessageCategory,
  now: Date = new Date(),
): boolean {
  if (category === "safety") return false;
  if (channel !== "sms" && channel !== "push") return false;
  return isWithinQuietHours(prefs.quietHours, now);
}

export function shouldDeliver(
  prefs: MessagePreferences,
  channel: MessageChannel,
  category: MessageCategory,
  options?: {
    smsState?: MessagePreferenceSmsState;
    now?: Date;
  },
): boolean {
  if (shouldAlwaysDeliver(category)) {
    return true;
  }
  if (!prefs.matrix[category][channel]) {
    return false;
  }
  if (channel === "sms" && options?.smsState?.isGloballySuppressed) {
    return false;
  }
  if (isChannelDeferredByQuietHours(prefs, channel, category, options?.now)) {
    return false;
  }
  return true;
}

export function buildSmsStateFromConsent(params: {
  phoneMissing: boolean;
  consentStatus?: SmsConsentStatus | null;
  updatedAt?: string | null;
}): MessagePreferenceSmsState {
  const consentStatus = params.consentStatus ?? "unknown";
  return {
    consentStatus,
    isGloballySuppressed:
      consentStatus === "opted_out" || consentStatus === "suppressed",
    reason:
      consentStatus === "opted_out"
        ? "sms_stop"
        : consentStatus === "suppressed"
          ? "manual_suppression"
          : null,
    phoneMissing: params.phoneMissing,
    updatedAt: params.updatedAt ?? null,
  };
}

export function deriveEffectivePreferences(
  prefs: MessagePreferences,
  smsState?: MessagePreferenceSmsState,
): MessagePreferencesView["effective"] {
  const matrix = ensureSafetyRow(copyMatrix(prefs.matrix));
  if (smsState?.isGloballySuppressed) {
    for (const category of MUTABLE_CATEGORIES) {
      matrix[category].sms = false;
    }
  }
  return {
    matrix,
    sms:
      smsState ?? {
        consentStatus: "unknown",
        isGloballySuppressed: false,
        reason: null,
        phoneMissing: false,
        updatedAt: null,
      },
  };
}

export function buildMessagePreferencesView(params: {
  hasStoredPreferences: boolean;
  preferences?: MessagePreferences | null;
  smsState?: MessagePreferenceSmsState;
}): MessagePreferencesView {
  const prefs = params.preferences ?? defaultPreferences();
  return {
    hasStoredPreferences: params.hasStoredPreferences,
    matrix: prefs.matrix,
    quietHours: prefs.quietHours,
    channels: deriveLegacyChannels(prefs),
    categories: deriveLegacyCategories(prefs),
    effective: deriveEffectivePreferences(prefs, params.smsState),
  };
}

export function resolveCurrentPreferences(params: {
  legacyRow?: LegacyMessagePreferenceRow | null;
  auditEntries?: PreferenceAuditEntryLike[];
}): MessagePreferencesResolution {
  const audited = (params.auditEntries ?? [])
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (let index = audited.length - 1; index >= 0; index -= 1) {
    const parsed = parsePreferenceAuditDetails(audited[index].details ?? null);
    if (parsed) {
      return {
        source: "audit",
        hasStoredPreferences: true,
        preferences: parsed.after,
      };
    }
  }
  if (params.legacyRow) {
    return {
      source: "legacy",
      hasStoredPreferences: true,
      preferences: migrateLegacyPreferences(params.legacyRow),
    };
  }
  return {
    source: "default",
    hasStoredPreferences: false,
    preferences: defaultPreferences(),
  };
}

export function buildPreferenceChangeAuditDetails(params: {
  actorUserId: string | null;
  subjectUserId: string;
  source: string;
  before: MessagePreferences;
  after: MessagePreferences;
  timestamp: string;
  tokenJti?: string;
}): string {
  const payload: PreferenceAuditSnapshot = {
    schemaVersion: 1,
    before: params.before,
    after: params.after,
    actorUserId: params.actorUserId,
    subjectUserId: params.subjectUserId,
    source: params.source,
    timestamp: params.timestamp,
    ...(params.tokenJti ? { tokenJti: params.tokenJti } : {}),
  };
  return JSON.stringify(payload);
}

export function parsePreferenceAuditDetails(
  details: string | null | undefined,
): PreferenceAuditSnapshot | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Partial<PreferenceAuditSnapshot>;
    if (
      parsed?.schemaVersion !== 1 ||
      typeof parsed.timestamp !== "string" ||
      typeof parsed.source !== "string" ||
      typeof parsed.subjectUserId !== "string" ||
      typeof parsed.actorUserId !== "string" ||
      !parsed.before ||
      !parsed.after
    ) {
      return null;
    }
    return parsed as PreferenceAuditSnapshot;
  } catch {
    return null;
  }
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = base64UrlToBytes(left);
  const b = base64UrlToBytes(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

function uuidLike(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function encodeJsonBase64Url(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJsonBase64Url<T>(value: string): T | null {
  try {
    const bytes = base64UrlToBytes(value);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export async function signMessagePreferencesUnsubscribeToken(params: {
  secret: string;
  userId: string;
  category: MessageCategory;
  channel: MessageChannel;
  source?: string;
  ttlSeconds?: number;
  nowMs?: number;
  tokenId?: string;
}): Promise<string> {
  const nowMs = params.nowMs ?? Date.now();
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + Math.max(60, params.ttlSeconds ?? 24 * 60 * 60);
  const claims: MessagePreferencesUnsubscribeTokenClaims = {
    iss: "buyer-v2",
    aud: "message_preferences_unsubscribe",
    sub: params.userId,
    jti: params.tokenId ?? uuidLike(),
    iat,
    exp,
    cat: params.category,
    chn: params.channel,
    src: params.source,
    ver: 1,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = encodeJsonBase64Url(header);
  const encodedClaims = encodeJsonBase64Url(claims);
  const signature = await hmacSha256(
    params.secret,
    `${encodedHeader}.${encodedClaims}`,
  );
  return `${encodedHeader}.${encodedClaims}.${signature}`;
}

export async function verifyMessagePreferencesUnsubscribeToken(params: {
  token: string;
  secret: string;
  nowMs?: number;
}): Promise<MessagePreferencesUnsubscribeTokenResult> {
  const parts = params.token.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "malformed" };
  }

  const [encodedHeader, encodedClaims, signature] = parts;
  const header = decodeJsonBase64Url<{ alg?: string; typ?: string }>(
    encodedHeader,
  );
  const claims = decodeJsonBase64Url<MessagePreferencesUnsubscribeTokenClaims>(
    encodedClaims,
  );
  if (!header || !claims) {
    return { valid: false, reason: "malformed" };
  }
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    return { valid: false, reason: "invalid_claims" };
  }
  if (
    claims.iss !== "buyer-v2" ||
    claims.aud !== "message_preferences_unsubscribe" ||
    claims.ver !== 1 ||
    typeof claims.sub !== "string" ||
    typeof claims.jti !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    !MESSAGE_CATEGORIES.includes(claims.cat) ||
    !MESSAGE_CHANNELS.includes(claims.chn)
  ) {
    return { valid: false, reason: "invalid_claims" };
  }
  if (claims.cat === "safety") {
    return { valid: false, reason: "invalid_claims" };
  }
  if (claims.chn === "sms") {
    return { valid: false, reason: "unsupported_channel" };
  }

  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000);
  if (claims.iat > nowSec + 60) {
    return { valid: false, reason: "future" };
  }
  if (claims.exp <= nowSec) {
    return { valid: false, reason: "expired" };
  }

  const expected = await hmacSha256(params.secret, `${encodedHeader}.${encodedClaims}`);
  if (!constantTimeEqual(expected, signature)) {
    return { valid: false, reason: "invalid_signature" };
  }

  return { valid: true, claims };
}

