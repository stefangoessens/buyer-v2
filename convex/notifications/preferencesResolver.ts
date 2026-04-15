import { v } from "convex/values";

export const NOTIFICATION_DELIVERY_CHANNELS = [
  "email",
  "sms",
  "push",
  "in_app",
] as const;

export const NOTIFICATION_DELIVERY_CATEGORIES = [
  "transactional",
  "tours",
  "offers",
  "closing",
  "disclosures",
  "market_updates",
  "marketing",
  "safety",
] as const;

export type NotificationDeliveryChannel =
  (typeof NOTIFICATION_DELIVERY_CHANNELS)[number];

export type NotificationDeliveryCategory =
  (typeof NOTIFICATION_DELIVERY_CATEGORIES)[number];

export type NotificationChannelToggle = {
  email: boolean;
  sms: boolean;
  push: boolean;
  in_app: boolean;
};

export type NotificationDeliveryMatrix = {
  [K in NotificationDeliveryCategory]: NotificationChannelToggle;
};

export type NotificationQuietHours = {
  enabled: boolean;
  timeZone: string;
  start: string;
  end: string;
  suppressSms: boolean;
  suppressPush: boolean;
};

export type NotificationPreferencesEnvelope = {
  deliveryMatrix?: Partial<NotificationDeliveryMatrix>;
  quietHours?: NotificationQuietHours;
};

export type MessageDeliveryPreferencesRowLike = {
  channels?: {
    email: boolean;
    sms: boolean;
    push: boolean;
    inApp: boolean;
  };
  categories?: {
    transactional: boolean;
    tours: boolean;
    offers: boolean;
    updates: boolean;
    marketing: boolean;
  };
  deliveryMatrix?: NotificationDeliveryMatrix;
  matrix?: {
    [K in NotificationDeliveryCategory]: {
      email: boolean;
      sms: boolean;
      push: boolean;
      inApp: boolean;
    };
  };
  quietHours?:
    | NotificationQuietHours
    | {
        enabled: boolean;
        startMinutes: number;
        endMinutes: number;
        timezone: string;
      };
};

export type EffectiveNotificationPreferences = {
  deliveryMatrix: NotificationDeliveryMatrix;
  quietHours: NotificationQuietHours | null;
};

export const notificationDeliveryChannelValidator = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("push"),
  v.literal("in_app"),
);

export const notificationDeliveryCategoryValidator = v.union(
  v.literal("transactional"),
  v.literal("tours"),
  v.literal("offers"),
  v.literal("closing"),
  v.literal("disclosures"),
  v.literal("market_updates"),
  v.literal("marketing"),
  v.literal("safety"),
);

export const notificationChannelToggleValidator = v.object({
  email: v.boolean(),
  sms: v.boolean(),
  push: v.boolean(),
  in_app: v.boolean(),
});

export const notificationDeliveryMatrixValidator = v.object({
  transactional: notificationChannelToggleValidator,
  tours: notificationChannelToggleValidator,
  offers: notificationChannelToggleValidator,
  closing: notificationChannelToggleValidator,
  disclosures: notificationChannelToggleValidator,
  market_updates: notificationChannelToggleValidator,
  marketing: notificationChannelToggleValidator,
  safety: notificationChannelToggleValidator,
});

export const notificationQuietHoursValidator = v.object({
  enabled: v.boolean(),
  timeZone: v.string(),
  start: v.string(),
  end: v.string(),
  suppressSms: v.boolean(),
  suppressPush: v.boolean(),
});

export function defaultNotificationChannelToggle(
  enabled: boolean,
): NotificationChannelToggle {
  return {
    email: enabled,
    sms: enabled,
    push: enabled,
    in_app: enabled,
  };
}

export function defaultNotificationDeliveryMatrix(): NotificationDeliveryMatrix {
  return {
    transactional: defaultNotificationChannelToggle(true),
    tours: defaultNotificationChannelToggle(true),
    offers: defaultNotificationChannelToggle(true),
    closing: defaultNotificationChannelToggle(true),
    disclosures: defaultNotificationChannelToggle(true),
    market_updates: defaultNotificationChannelToggle(false),
    marketing: defaultNotificationChannelToggle(false),
    safety: defaultNotificationChannelToggle(true),
  };
}

export function defaultNotificationQuietHours(
  timeZone = "America/New_York",
  start = "21:00",
  end = "08:00",
): NotificationQuietHours {
  return {
    enabled: true,
    timeZone,
    start,
    end,
    suppressSms: true,
    suppressPush: true,
  };
}

export function buildNotificationDeliveryMatrixFromLegacy(
  channels: NonNullable<MessageDeliveryPreferencesRowLike["channels"]>,
  categories: NonNullable<MessageDeliveryPreferencesRowLike["categories"]>,
): NotificationDeliveryMatrix {
  const channelToggle = {
    email: channels.email,
    sms: channels.sms,
    push: channels.push,
    in_app: channels.inApp,
  };

  const categoryEnabled = {
    transactional: categories.transactional,
    tours: categories.tours,
    offers: categories.offers,
    closing: categories.transactional,
    disclosures: categories.transactional,
    market_updates: categories.updates,
    marketing: categories.marketing,
    safety: true,
  };

  return {
    transactional: {
      email: channelToggle.email && categoryEnabled.transactional,
      sms: channelToggle.sms && categoryEnabled.transactional,
      push: channelToggle.push && categoryEnabled.transactional,
      in_app: channelToggle.in_app && categoryEnabled.transactional,
    },
    tours: {
      email: channelToggle.email && categoryEnabled.tours,
      sms: channelToggle.sms && categoryEnabled.tours,
      push: channelToggle.push && categoryEnabled.tours,
      in_app: channelToggle.in_app && categoryEnabled.tours,
    },
    offers: {
      email: channelToggle.email && categoryEnabled.offers,
      sms: channelToggle.sms && categoryEnabled.offers,
      push: channelToggle.push && categoryEnabled.offers,
      in_app: channelToggle.in_app && categoryEnabled.offers,
    },
    closing: {
      email: channelToggle.email && categoryEnabled.closing,
      sms: channelToggle.sms && categoryEnabled.closing,
      push: channelToggle.push && categoryEnabled.closing,
      in_app: channelToggle.in_app && categoryEnabled.closing,
    },
    disclosures: {
      email: channelToggle.email && categoryEnabled.disclosures,
      sms: channelToggle.sms && categoryEnabled.disclosures,
      push: channelToggle.push && categoryEnabled.disclosures,
      in_app: channelToggle.in_app && categoryEnabled.disclosures,
    },
    market_updates: {
      email: channelToggle.email && categoryEnabled.market_updates,
      sms: channelToggle.sms && categoryEnabled.market_updates,
      push: channelToggle.push && categoryEnabled.market_updates,
      in_app: channelToggle.in_app && categoryEnabled.market_updates,
    },
    marketing: {
      email: channelToggle.email && categoryEnabled.marketing,
      sms: channelToggle.sms && categoryEnabled.marketing,
      push: channelToggle.push && categoryEnabled.marketing,
      in_app: channelToggle.in_app && categoryEnabled.marketing,
    },
    safety: {
      email: true,
      sms: true,
      push: true,
      in_app: true,
    },
  };
}

function coerceLegacyChannels(
  channels: MessageDeliveryPreferencesRowLike["channels"],
): NonNullable<MessageDeliveryPreferencesRowLike["channels"]> {
  return (
    channels ?? {
      email: true,
      sms: false,
      push: true,
      inApp: true,
    }
  );
}

function coerceLegacyCategories(
  categories: MessageDeliveryPreferencesRowLike["categories"],
): NonNullable<MessageDeliveryPreferencesRowLike["categories"]> {
  return (
    categories ?? {
      transactional: true,
      tours: true,
      offers: true,
      updates: true,
      marketing: false,
    }
  );
}

function coerceMatrix(
  row: MessageDeliveryPreferencesRowLike,
): NotificationDeliveryMatrix | null {
  if (row.deliveryMatrix) {
    return row.deliveryMatrix;
  }

  if (!row.matrix) {
    return null;
  }

  return {
    transactional: {
      email: row.matrix.transactional.email,
      sms: row.matrix.transactional.sms,
      push: row.matrix.transactional.push,
      in_app: row.matrix.transactional.inApp,
    },
    tours: {
      email: row.matrix.tours.email,
      sms: row.matrix.tours.sms,
      push: row.matrix.tours.push,
      in_app: row.matrix.tours.inApp,
    },
    offers: {
      email: row.matrix.offers.email,
      sms: row.matrix.offers.sms,
      push: row.matrix.offers.push,
      in_app: row.matrix.offers.inApp,
    },
    closing: {
      email: row.matrix.closing.email,
      sms: row.matrix.closing.sms,
      push: row.matrix.closing.push,
      in_app: row.matrix.closing.inApp,
    },
    disclosures: {
      email: row.matrix.disclosures.email,
      sms: row.matrix.disclosures.sms,
      push: row.matrix.disclosures.push,
      in_app: row.matrix.disclosures.inApp,
    },
    market_updates: {
      email: row.matrix.market_updates.email,
      sms: row.matrix.market_updates.sms,
      push: row.matrix.market_updates.push,
      in_app: row.matrix.market_updates.inApp,
    },
    marketing: {
      email: row.matrix.marketing.email,
      sms: row.matrix.marketing.sms,
      push: row.matrix.marketing.push,
      in_app: row.matrix.marketing.inApp,
    },
    safety: {
      email: row.matrix.safety.email,
      sms: row.matrix.safety.sms,
      push: row.matrix.safety.push,
      in_app: row.matrix.safety.inApp,
    },
  };
}

function toClockString(totalMinutes: number): string {
  const safeMinutes = ((Math.trunc(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function coerceQuietHours(
  quietHours: MessageDeliveryPreferencesRowLike["quietHours"],
): NotificationQuietHours | null {
  if (!quietHours) {
    return null;
  }

  if ("timeZone" in quietHours) {
    return quietHours;
  }

  return {
    enabled: quietHours.enabled,
    timeZone: quietHours.timezone,
    start: toClockString(quietHours.startMinutes),
    end: toClockString(quietHours.endMinutes),
    suppressSms: true,
    suppressPush: true,
  };
}

export function resolveEffectiveNotificationDeliveryMatrix(
  row: MessageDeliveryPreferencesRowLike,
): NotificationDeliveryMatrix {
  return (
    coerceMatrix(row) ??
    buildNotificationDeliveryMatrixFromLegacy(
      coerceLegacyChannels(row.channels),
      coerceLegacyCategories(row.categories),
    )
  );
}

export function resolveEffectiveNotificationQuietHours(
  row: Pick<MessageDeliveryPreferencesRowLike, "quietHours">,
  fallback: NotificationQuietHours | null = null,
): NotificationQuietHours | null {
  return coerceQuietHours(row.quietHours) ?? fallback;
}

export function resolveEffectiveNotificationPreferences(
  row: MessageDeliveryPreferencesRowLike,
  fallback: {
    quietHours?: NotificationQuietHours | null;
  } = {},
): EffectiveNotificationPreferences {
  return {
    deliveryMatrix: resolveEffectiveNotificationDeliveryMatrix(row),
    quietHours: resolveEffectiveNotificationQuietHours(row, fallback.quietHours ?? null),
  };
}

export function mergeNotificationDeliveryMatrix(
  existing: NotificationDeliveryMatrix,
  patch: Partial<NotificationDeliveryMatrix>,
): NotificationDeliveryMatrix {
  return {
    transactional: {
      ...existing.transactional,
      ...(patch.transactional ?? {}),
    },
    tours: {
      ...existing.tours,
      ...(patch.tours ?? {}),
    },
    offers: {
      ...existing.offers,
      ...(patch.offers ?? {}),
    },
    closing: {
      ...existing.closing,
      ...(patch.closing ?? {}),
    },
    disclosures: {
      ...existing.disclosures,
      ...(patch.disclosures ?? {}),
    },
    market_updates: {
      ...existing.market_updates,
      ...(patch.market_updates ?? {}),
    },
    marketing: {
      ...existing.marketing,
      ...(patch.marketing ?? {}),
    },
    safety: {
      ...existing.safety,
      ...(patch.safety ?? {}),
    },
  };
}

export function isSafetyCategory(
  category: NotificationDeliveryCategory,
): boolean {
  return category === "safety";
}

export function parseClockMinutes(clock: string): number {
  const [hoursPart, minutesPart] = clock.trim().split(":");
  const hours = Number.parseInt(hoursPart ?? "0", 10);
  const minutes = Number.parseInt(minutesPart ?? "0", 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }

  return ((((hours % 24) + 24) % 24) * 60) + (((minutes % 60) + 60) % 60);
}

export function currentMinutesInTimeZone(
  now: Date,
  timeZone: string,
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number.parseInt(
    parts.find((part) => part.type === "hour")?.value ?? "0",
    10,
  );
  const minute = Number.parseInt(
    parts.find((part) => part.type === "minute")?.value ?? "0",
    10,
  );

  return hour * 60 + minute;
}

export function isWithinQuietHours(
  quietHours: NotificationQuietHours,
  now = new Date(),
): boolean {
  if (!quietHours.enabled) {
    return false;
  }

  const current = currentMinutesInTimeZone(now, quietHours.timeZone);
  const start = parseClockMinutes(quietHours.start);
  const end = parseClockMinutes(quietHours.end);

  if (start === end) {
    return true;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

export function shouldDeliverNotification(args: {
  category: NotificationDeliveryCategory;
  channel: NotificationDeliveryChannel;
  matrix: NotificationDeliveryMatrix;
  quietHours?: NotificationQuietHours;
  now?: Date;
}): boolean {
  if (args.category === "safety") {
    return true;
  }

  if (args.channel === "in_app") {
    return true;
  }

  const baseEnabled = args.matrix[args.category][args.channel];
  if (!baseEnabled) {
    return false;
  }

  if (!args.quietHours?.enabled) {
    return true;
  }

  const isQuiet = isWithinQuietHours(args.quietHours, args.now);
  if (!isQuiet) {
    return true;
  }

  if (args.channel === "sms") {
    return !args.quietHours.suppressSms;
  }

  if (args.channel === "push") {
    return !args.quietHours.suppressPush;
  }

  return true;
}
