import { isValidTimezone } from "@/lib/scheduling/windows";

export const NOTIFICATION_CHANNELS = [
  "email",
  "sms",
  "push",
  "inApp",
] as const;

export const NOTIFICATION_CATEGORIES = [
  "transactional",
  "tours",
  "offers",
  "closing",
  "disclosures",
  "market_updates",
  "marketing",
  "safety",
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationChannelState = Record<NotificationChannel, boolean>;
export type NotificationDeliveryMatrix = Record<
  NotificationCategory,
  NotificationChannelState
>;

export type NotificationQuietHours = {
  enabled: boolean;
  timeZone: string;
  start: string;
  end: string;
  suppressSms: boolean;
  suppressPush: boolean;
};

export type PushPermissionState =
  | {
      kind: "requires_ios_app";
      label: string;
      description: string;
    }
  | {
      kind: "denied";
      label: string;
      description: string;
      ctaLabel?: string;
      ctaHref?: string;
    }
  | {
      kind: "available";
      label: string;
      description: string;
    };

export type NotificationPreferenceView = {
  hasStoredPreferences: boolean;
  deliveryMatrix: NotificationDeliveryMatrix;
  quietHours: NotificationQuietHours;
  smsGloballySuppressed: boolean;
  pushPermissionState: PushPermissionState;
};

export type NotificationPreferenceDiff = {
  category: NotificationCategory;
  channel: NotificationChannel;
  direction: "on" | "off";
};

export const CHANNEL_META: Array<{
  key: NotificationChannel;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: "email",
    label: "Email",
    shortLabel: "Email",
    description: "Detailed updates with next steps and brokerage context.",
  },
  {
    key: "sms",
    label: "SMS",
    shortLabel: "SMS",
    description: "Fast nudges for time-sensitive changes and reminders.",
  },
  {
    key: "push",
    label: "Push",
    shortLabel: "Push",
    description: "App alerts from Buyer V2 on your iPhone.",
  },
  {
    key: "inApp",
    label: "In-app",
    shortLabel: "In-app",
    description: "Your durable inbox inside Buyer V2.",
  },
] as const;

export const CATEGORY_META: Array<{
  key: NotificationCategory;
  label: string;
  description: string;
  helper: string;
  tone: "operational" | "optional" | "safety";
}> = [
  {
    key: "transactional",
    label: "Transactional",
    description: "Receipts, account actions, and deal-state confirmations.",
    helper: "Required-by-default account and brokerage updates.",
    tone: "operational",
  },
  {
    key: "tours",
    label: "Tours",
    description: "Tour confirmations, timing changes, and day-of reminders.",
    helper: "On by default so you do not miss schedule changes.",
    tone: "operational",
  },
  {
    key: "offers",
    label: "Offers",
    description: "Counter moves, deadlines, and negotiation activity.",
    helper: "On by default for active offer work.",
    tone: "operational",
  },
  {
    key: "closing",
    label: "Closing",
    description: "Milestones, funding prep, and closing-day coordination.",
    helper: "On by default while you are moving toward the finish line.",
    tone: "operational",
  },
  {
    key: "disclosures",
    label: "Disclosures",
    description: "Inspection packets, seller docs, and review requests.",
    helper: "On by default for anything that could affect your decision.",
    tone: "operational",
  },
  {
    key: "market_updates",
    label: "Market updates",
    description: "Price drops, status changes, and saved-home movement.",
    helper: "Optional. Keep it off if you only want active-deal updates.",
    tone: "optional",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Product tips, launches, and occasional market education.",
    helper: "Optional. Explicit opt-in only.",
    tone: "optional",
  },
  {
    key: "safety",
    label: "Safety",
    description: "Wire-fraud warnings and time-critical closing alerts.",
    helper:
      "Wire-fraud warnings and time-critical closing alerts cannot be disabled by preference. This is a legal and safety requirement.",
    tone: "safety",
  },
] as const;

export const DEFAULT_QUIET_HOURS: NotificationQuietHours = {
  enabled: true,
  timeZone: "America/New_York",
  start: "21:00",
  end: "08:00",
  suppressSms: true,
  suppressPush: true,
};

export const WEB_PUSH_PERMISSION_STATE: PushPermissionState = {
  kind: "requires_ios_app",
  label: "Push requires iOS app",
  description:
    "Push preferences live in the iPhone app. Email, SMS, and in-app stay managed here.",
};

const DEFAULT_MATRIX: NotificationDeliveryMatrix = {
  transactional: { email: true, sms: true, push: true, inApp: true },
  tours: { email: true, sms: true, push: true, inApp: true },
  offers: { email: true, sms: true, push: true, inApp: true },
  closing: { email: true, sms: true, push: true, inApp: true },
  disclosures: { email: true, sms: true, push: true, inApp: true },
  market_updates: { email: false, sms: false, push: false, inApp: false },
  marketing: { email: false, sms: false, push: false, inApp: false },
  safety: { email: true, sms: true, push: true, inApp: true },
};

type MaybeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MaybeRecord {
  return typeof value === "object" && value !== null;
}

function isBooleanRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, boolean> {
  if (!isRecord(value)) {
    return false;
  }

  return keys.every((key) => typeof value[key] === "boolean");
}

function normalizeMatrix(
  value: unknown,
  fallback: NotificationDeliveryMatrix,
): NotificationDeliveryMatrix {
  if (!isRecord(value)) {
    return cloneMatrix(fallback);
  }

  return NOTIFICATION_CATEGORIES.reduce<NotificationDeliveryMatrix>(
    (acc, category) => {
      const nextValue = value[category];
      if (isBooleanRecord(nextValue, NOTIFICATION_CHANNELS)) {
        acc[category] = {
          email: nextValue.email,
          sms: nextValue.sms,
          push: nextValue.push,
          inApp: nextValue.inApp,
        };
      } else if (isBooleanRecord(nextValue, ["email", "sms", "push", "in_app"])) {
        acc[category] = {
          email: nextValue.email,
          sms: nextValue.sms,
          push: nextValue.push,
          inApp: nextValue.in_app,
        };
      } else if (isBooleanRecord(nextValue, ["email", "sms", "push", "inApp"])) {
        acc[category] = {
          email: nextValue.email,
          sms: nextValue.sms,
          push: nextValue.push,
          inApp: nextValue.inApp,
        };
      } else {
        acc[category] = { ...fallback[category] };
      }
      return acc;
    },
    {} as NotificationDeliveryMatrix,
  );
}

function buildLegacyMatrix(input: MaybeRecord): NotificationDeliveryMatrix {
  const channels = isRecord(input.channels) ? input.channels : {};
  const categories = isRecord(input.categories) ? input.categories : {};

  const channelState = {
    email: channels.email === true,
    sms: channels.sms === true,
    push: channels.push === true,
    inApp: channels.inApp === true || channels.in_app === true,
  };

  const categoryState = {
    transactional: categories.transactional !== false,
    tours: categories.tours !== false,
    offers: categories.offers !== false,
    closing: categories.transactional !== false,
    disclosures: categories.transactional !== false,
    market_updates: categories.market_updates === true || categories.updates !== false,
    marketing: categories.marketing === true,
    safety: true,
  };

  return NOTIFICATION_CATEGORIES.reduce<NotificationDeliveryMatrix>(
    (acc, category) => {
      acc[category] =
        category === "safety"
          ? { email: true, sms: true, push: true, inApp: true }
          : {
              email: channelState.email && categoryState[category],
              sms: channelState.sms && categoryState[category],
              push: channelState.push && categoryState[category],
              inApp: channelState.inApp && categoryState[category],
            };
      return acc;
    },
    {} as NotificationDeliveryMatrix,
  );
}

function normalizeQuietHours(
  value: unknown,
  fallback = DEFAULT_QUIET_HOURS,
): NotificationQuietHours {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  const rawTimeZone =
    typeof value.timeZone === "string"
      ? value.timeZone
      : typeof value.timezone === "string"
        ? value.timezone
        : null;
  const timeZone = rawTimeZone && isValidTimezone(rawTimeZone)
    ? rawTimeZone
    : fallback.timeZone;

  const start =
    typeof value.startMinutes === "number"
      ? minutesToClock(value.startMinutes, fallback.start)
      : isClock(value.start)
        ? value.start
        : fallback.start;
  const end =
    typeof value.endMinutes === "number"
      ? minutesToClock(value.endMinutes, fallback.end)
      : isClock(value.end)
        ? value.end
        : fallback.end;

  return {
    enabled:
      typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    timeZone,
    start,
    end,
    suppressSms:
      typeof value.suppressSms === "boolean"
        ? value.suppressSms
        : fallback.suppressSms,
    suppressPush:
      typeof value.suppressPush === "boolean"
        ? value.suppressPush
        : fallback.suppressPush,
  };
}

function normalizePushState(value: unknown): PushPermissionState {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return WEB_PUSH_PERMISSION_STATE;
  }

  if (value.kind === "denied") {
    return {
      kind: "denied",
      label:
        typeof value.label === "string"
          ? value.label
          : "Push disabled in iOS Settings",
      description:
        typeof value.description === "string"
          ? value.description
          : "Turn notifications back on in iOS Settings to receive push alerts.",
      ctaLabel:
        typeof value.ctaLabel === "string" ? value.ctaLabel : "Open Settings",
      ctaHref: typeof value.ctaHref === "string" ? value.ctaHref : undefined,
    };
  }

  if (value.kind === "available") {
    return {
      kind: "available",
      label: typeof value.label === "string" ? value.label : "Push available",
      description:
        typeof value.description === "string"
          ? value.description
          : "Manage push delivery in the iPhone app.",
    };
  }

  return WEB_PUSH_PERMISSION_STATE;
}

function deriveSmsGlobalSuppressed(value: MaybeRecord): boolean {
  if (value.smsGloballySuppressed === true || value.smsSuppressed === true) {
    return true;
  }

  if (isRecord(value.smsConsent)) {
    const status = value.smsConsent.status;
    if (status === "opted_out" || status === "stopped" || status === "blocked") {
      return true;
    }
  }

  if (isRecord(value.smsStatus)) {
    const status = value.smsStatus.kind ?? value.smsStatus.state;
    if (status === "opted_out" || status === "stopped" || status === "blocked") {
      return true;
    }
  }

  return false;
}

export function normalizeNotificationPreferences(
  input: unknown,
): NotificationPreferenceView {
  const record = isRecord(input) ? input : {};
  const hasStoredPreferences = record.hasStoredPreferences === true;
  const fallbackMatrix = isRecord(record.channels) || isRecord(record.categories)
    ? buildLegacyMatrix(record)
    : cloneMatrix(DEFAULT_MATRIX);
  const deliveryMatrix = normalizeMatrix(
    isRecord(record.matrix) ? record.matrix : record.deliveryMatrix,
    fallbackMatrix,
  );

  deliveryMatrix.safety = { email: true, sms: true, push: true, inApp: true };

  return {
    hasStoredPreferences,
    deliveryMatrix,
    quietHours: normalizeQuietHours(record.quietHours),
    smsGloballySuppressed: deriveSmsGlobalSuppressed(record),
    pushPermissionState: normalizePushState(record.pushPermissionState),
  };
}

export function cloneMatrix(
  matrix: NotificationDeliveryMatrix,
): NotificationDeliveryMatrix {
  return NOTIFICATION_CATEGORIES.reduce<NotificationDeliveryMatrix>(
    (acc, category) => {
      acc[category] = { ...matrix[category] };
      return acc;
    },
    {} as NotificationDeliveryMatrix,
  );
}

export function clonePreferenceView(
  value: NotificationPreferenceView,
): NotificationPreferenceView {
  return {
    hasStoredPreferences: value.hasStoredPreferences,
    deliveryMatrix: cloneMatrix(value.deliveryMatrix),
    quietHours: { ...value.quietHours },
    smsGloballySuppressed: value.smsGloballySuppressed,
    pushPermissionState: value.pushPermissionState,
  };
}

export function setMatrixCell(
  value: NotificationPreferenceView,
  category: NotificationCategory,
  channel: NotificationChannel,
  checked: boolean,
): NotificationPreferenceView {
  const next = clonePreferenceView(value);

  if (category === "safety") {
    return next;
  }

  if (channel === "push") {
    return next;
  }

  if (channel === "sms" && next.smsGloballySuppressed) {
    return next;
  }

  next.deliveryMatrix[category][channel] = checked;
  return next;
}

export function setQuietHours(
  value: NotificationPreferenceView,
  patch: Partial<NotificationQuietHours>,
): NotificationPreferenceView {
  return {
    ...clonePreferenceView(value),
    quietHours: {
      ...value.quietHours,
      ...patch,
    },
  };
}

export function diffNotificationPreferences(
  previous: NotificationPreferenceView,
  current: NotificationPreferenceView,
): NotificationPreferenceDiff[] {
  const changes: NotificationPreferenceDiff[] = [];

  for (const category of NOTIFICATION_CATEGORIES) {
    for (const channel of NOTIFICATION_CHANNELS) {
      if (
        previous.deliveryMatrix[category][channel] !==
        current.deliveryMatrix[category][channel]
      ) {
        changes.push({
          category,
          channel,
          direction: current.deliveryMatrix[category][channel] ? "on" : "off",
        });
      }
    }
  }

  return changes;
}

export function serializeMutationPayload(value: NotificationPreferenceView) {
  return {
    matrix: NOTIFICATION_CATEGORIES.reduce<
      Record<NotificationCategory, { email: boolean; sms: boolean; push: boolean; inApp: boolean }>
    >((acc, category) => {
      acc[category] = {
        email: value.deliveryMatrix[category].email,
        sms: value.deliveryMatrix[category].sms,
        push: value.deliveryMatrix[category].push,
        inApp: value.deliveryMatrix[category].inApp,
      };
      return acc;
    }, {} as Record<NotificationCategory, { email: boolean; sms: boolean; push: boolean; inApp: boolean }>),
    quietHours: {
      enabled: value.quietHours.enabled,
      timezone: value.quietHours.timeZone,
      startMinutes: clockToMinutes(value.quietHours.start),
      endMinutes: clockToMinutes(value.quietHours.end),
      suppressSms: value.quietHours.suppressSms,
      suppressPush: value.quietHours.suppressPush,
    },
    source: "preference_center" as const,
  };
}

export function isClock(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function validateQuietHours(
  value: NotificationQuietHours,
): string | null {
  if (!isValidTimezone(value.timeZone)) {
    return "Choose a valid IANA timezone.";
  }

  if (!isClock(value.start) || !isClock(value.end)) {
    return "Enter quiet hours in 24-hour HH:MM format.";
  }

  return null;
}

function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function minutesToClock(value: number, fallback: string): string {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const totalMinutes = ((Math.trunc(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
}
