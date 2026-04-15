import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  communicationPreferencesViewValidator,
} from "./lib/buyerProfile";
import {
  buildMessagePreferencesView,
  defaultPreferences,
  deriveLegacyCategories,
  deriveLegacyChannels,
  mergePreferences,
  migrateLegacyPreferences,
  optOutAllChannels as optOutAllChannelsPure,
  type LegacyCategoryEnablement,
  type MessageCategory,
  type MessageChannel,
  type MessagePreferenceSmsState,
  type MessagePreferences,
  type PartialMessagePreferences,
} from "./lib/messagePreferences";
import { hashPhone, normalizePhone } from "./lib/smsIntakeCompute";

const channelPatchValidator = v.object({
  email: v.optional(v.boolean()),
  sms: v.optional(v.boolean()),
  push: v.optional(v.boolean()),
  inApp: v.optional(v.boolean()),
});

const legacyCategoryPatchValidator = v.object({
  transactional: v.optional(v.boolean()),
  tours: v.optional(v.boolean()),
  offers: v.optional(v.boolean()),
  updates: v.optional(v.boolean()),
  marketing: v.optional(v.boolean()),
});

const matrixPatchValidator = v.object({
  transactional: v.optional(channelPatchValidator),
  tours: v.optional(channelPatchValidator),
  offers: v.optional(channelPatchValidator),
  closing: v.optional(channelPatchValidator),
  disclosures: v.optional(channelPatchValidator),
  market_updates: v.optional(channelPatchValidator),
  marketing: v.optional(channelPatchValidator),
  safety: v.optional(channelPatchValidator),
});

const quietHoursPatchValidator = v.object({
  enabled: v.optional(v.boolean()),
  startMinutes: v.optional(v.number()),
  endMinutes: v.optional(v.number()),
  timezone: v.optional(v.string()),
});

const updatePatchArgsValidator = {
  matrix: v.optional(matrixPatchValidator),
  quietHours: v.optional(quietHoursPatchValidator),
  channels: v.optional(channelPatchValidator),
  categories: v.optional(legacyCategoryPatchValidator),
  source: v.optional(
    v.union(
      v.literal("preference_center"),
      v.literal("one_click_unsubscribe"),
      v.literal("sms_stop"),
      v.literal("email_footer"),
      v.literal("legacy_client"),
    ),
  ),
};

const unsubscribeResultValidator = v.object({
  status: v.union(v.literal("updated"), v.literal("already_unsubscribed")),
  preferences: communicationPreferencesViewValidator,
});

type MessagePreferenceRow = Doc<"messageDeliveryPreferences"> | null;

function coerceStoredPreferences(row: MessagePreferenceRow): MessagePreferences {
  if (row?.matrix && row?.quietHours) {
    return {
      matrix: row.matrix,
      quietHours: row.quietHours,
    };
  }
  return migrateLegacyPreferences({
    channels: row?.channels,
    categories: row?.categories,
  });
}

function serializePreferences(prefs: MessagePreferences) {
  return {
    matrix: prefs.matrix,
    quietHours: prefs.quietHours,
    channels: deriveLegacyChannels(prefs),
    categories: deriveLegacyCategories(prefs),
  };
}

function assertSafetyStillEnabled(patch: PartialMessagePreferences) {
  const attemptedSafety = patch.matrix?.safety;
  if (!attemptedSafety) return;
  for (const [channel, value] of Object.entries(attemptedSafety)) {
    if (value === false) {
      throw new Error(
        `Safety notifications are mandatory and cannot be disabled (${channel})`,
      );
    }
  }
}

async function lookupUserByIdentity(
  ctx: { db: any },
  identity: {
    tokenIdentifier?: string;
    issuer?: string;
    subject?: string;
  },
): Promise<Doc<"users"> | null> {
  if (identity.tokenIdentifier) {
    const byToken = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q: any) =>
        q.eq("authTokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (byToken) return byToken;
  }
  if (identity.issuer && identity.subject) {
    const byIssuerSubject = await ctx.db
      .query("users")
      .withIndex("by_authIssuer_and_authSubject", (q: any) =>
        q.eq("authIssuer", identity.issuer).eq("authSubject", identity.subject),
      )
      .unique();
    if (byIssuerSubject) return byIssuerSubject;
  }
  if (identity.subject) {
    return await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q: any) => q.eq("authSubject", identity.subject))
      .unique();
  }
  return null;
}

async function resolveSmsState(
  ctx: { db: any },
  user: Doc<"users">,
): Promise<MessagePreferenceSmsState> {
  const normalizedPhone = user.phone ? normalizePhone(user.phone) : null;
  if (!normalizedPhone) {
    return {
      consentStatus: "unknown",
      isGloballySuppressed: false,
      reason: null,
      phoneMissing: true,
      updatedAt: null,
    };
  }
  const phoneHash = await hashPhone(normalizedPhone);
  const consent = await ctx.db
    .query("smsConsent")
    .withIndex("by_phoneHash", (q: any) => q.eq("phoneHash", phoneHash))
    .unique();
  const status = consent?.status ?? "unknown";
  return {
    consentStatus: status,
    isGloballySuppressed: status === "opted_out" || status === "suppressed",
    reason:
      status === "opted_out"
        ? "sms_stop"
        : status === "suppressed"
          ? "manual_suppression"
          : null,
    phoneMissing: false,
    updatedAt: consent?.updatedAt ?? consent?.optedOutAt ?? consent?.suppressedAt ?? null,
  };
}

async function writePreferenceAuditLog(ctx: { db: any }, args: {
  actorUserId?: Id<"users">;
  subjectUserId: Id<"users">;
  entityId: string;
  source: string;
  before: MessagePreferences;
  after: MessagePreferences;
  metadata?: Record<string, unknown>;
}) {
  // Retention choice: reuse the existing permanent `auditLog` table rather than
  // inventing a second preference-audit store. Preference changes are regulated
  // communication controls and need an immutable compliance trail.
  await ctx.db.insert("auditLog", {
    userId: args.actorUserId ?? args.subjectUserId,
    action: "message_preferences.updated",
    entityType: "messageDeliveryPreferences",
    entityId: args.entityId,
    details: JSON.stringify({
      actorUserId: args.actorUserId ?? args.subjectUserId,
      subjectUserId: args.subjectUserId,
      source: args.source,
      timestamp: new Date().toISOString(),
      before: serializePreferences(args.before),
      after: serializePreferences(args.after),
      ...(args.metadata ?? {}),
    }),
    timestamp: new Date().toISOString(),
  });
}

async function loadPreferenceContext(ctx: { db: any }, userId: Id<"users">) {
  const [user, row] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .unique(),
  ]);
  if (!user) throw new Error("User not found");
  const stored = row ? coerceStoredPreferences(row) : defaultPreferences();
  const smsState = await resolveSmsState(ctx, user);
  return {
    user,
    row,
    stored,
    smsState,
  };
}

async function readPreferencesForUser(ctx: { db: any }, userId: Id<"users">) {
  const { row, stored, smsState } = await loadPreferenceContext(ctx, userId);
  return buildMessagePreferencesView({
    hasStoredPreferences: row !== null,
    preferences: stored,
    smsState,
  });
}

async function upsertPreferencesForUser(ctx: { db: any }, args: {
  userId: Id<"users">;
  actorUserId?: Id<"users">;
  patch: PartialMessagePreferences;
  source: string;
}) {
  assertSafetyStillEnabled(args.patch);
  const { row, stored, smsState } = await loadPreferenceContext(ctx, args.userId);
  const next = mergePreferences(stored, args.patch);
  const serialized = serializePreferences(next);
  const now = new Date().toISOString();

  let rowId: Id<"messageDeliveryPreferences">;
  if (row) {
    rowId = row._id;
    await ctx.db.patch(row._id, {
      ...serialized,
      updatedAt: now,
    });
  } else {
    rowId = await ctx.db.insert("messageDeliveryPreferences", {
      userId: args.userId,
      ...serialized,
      createdAt: now,
      updatedAt: now,
    });
  }

  await writePreferenceAuditLog(ctx, {
    actorUserId: args.actorUserId,
    subjectUserId: args.userId,
    entityId: rowId,
    source: args.source,
    before: stored,
    after: next,
  });

  return buildMessagePreferencesView({
    hasStoredPreferences: true,
    preferences: next,
    smsState,
  });
}

async function unsubscribeSpecificPreference(ctx: { db: any }, args: {
  userId: Id<"users">;
  category: MessageCategory;
  channel: MessageChannel;
  tokenJti: string;
}) {
  if (args.category === "safety") {
    throw new Error("Safety notifications cannot be unsubscribed");
  }
  const { row, stored, smsState } = await loadPreferenceContext(ctx, args.userId);
  const current = stored.matrix[args.category][args.channel];
  const next = mergePreferences(stored, {
    matrix: {
      [args.category]: {
        [args.channel]: false,
      },
    },
  });

  if (row) {
    const existingAudit = await ctx.db
      .query("auditLog")
      .withIndex("by_entityType_and_entityId", (q: any) =>
        q.eq("entityType", "messageDeliveryPreferences").eq("entityId", row._id),
      )
      .collect();
    const alreadyHandled = existingAudit.some((entry: Doc<"auditLog">) =>
      typeof entry.details === "string" && entry.details.includes(`"tokenJti":"${args.tokenJti}"`),
    );
    if (alreadyHandled || current === false) {
      return {
        status: "already_unsubscribed" as const,
        preferences: buildMessagePreferencesView({
          hasStoredPreferences: row !== null,
          preferences: current === false ? stored : next,
          smsState,
        }),
      };
    }
  }

  const view = await upsertPreferencesForUser(ctx, {
    userId: args.userId,
    patch: {
      matrix: {
        [args.category]: {
          [args.channel]: false,
        },
      },
    },
    source: "one_click_unsubscribe",
  });

  const preferenceRow = await ctx.db
    .query("messageDeliveryPreferences")
    .withIndex("by_userId", (q: any) => q.eq("userId", args.userId))
    .unique();
  if (preferenceRow) {
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "message_preferences.one_click_unsubscribe",
      entityType: "messageDeliveryPreferences",
      entityId: preferenceRow._id,
      details: JSON.stringify({
        tokenJti: args.tokenJti,
        category: args.category,
        channel: args.channel,
      }),
      timestamp: new Date().toISOString(),
    });
  }

  return { status: "updated" as const, preferences: view };
}

export const resolveUserIdForAuthIdentity = internalQuery({
  args: {
    tokenIdentifier: v.optional(v.string()),
    issuer: v.optional(v.string()),
    subject: v.optional(v.string()),
  },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    const user = await lookupUserByIdentity(ctx, args);
    return user?._id ?? null;
  },
});

export const getForUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: communicationPreferencesViewValidator,
  handler: async (ctx, args) => {
    return await readPreferencesForUser(ctx, args.userId);
  },
});

export const upsertForUserIdInternal = internalMutation({
  args: {
    userId: v.id("users"),
    actorUserId: v.optional(v.id("users")),
    ...updatePatchArgsValidator,
  },
  returns: communicationPreferencesViewValidator,
  handler: async (ctx, args) => {
    return await upsertPreferencesForUser(ctx, {
      userId: args.userId,
      actorUserId: args.actorUserId,
      patch: {
        matrix: args.matrix,
        quietHours: args.quietHours,
        channels: args.channels,
        categories: args.categories,
      },
      source: args.source ?? "legacy_client",
    });
  },
});

export const resetForUserIdInternal = internalMutation({
  args: {
    userId: v.id("users"),
    actorUserId: v.optional(v.id("users")),
    source: v.optional(v.string()),
  },
  returns: communicationPreferencesViewValidator,
  handler: async (ctx, args) => {
    return await upsertPreferencesForUser(ctx, {
      userId: args.userId,
      actorUserId: args.actorUserId,
      patch: defaultPreferences(),
      source: args.source ?? "legacy_client",
    });
  },
});

export const optOutAllForUserIdInternal = internalMutation({
  args: {
    userId: v.id("users"),
    actorUserId: v.optional(v.id("users")),
    source: v.optional(v.string()),
  },
  returns: communicationPreferencesViewValidator,
  handler: async (ctx, args) => {
    const { stored } = await loadPreferenceContext(ctx, args.userId);
    return await upsertPreferencesForUser(ctx, {
      userId: args.userId,
      actorUserId: args.actorUserId,
      patch: optOutAllChannelsPure(stored),
      source: args.source ?? "legacy_client",
    });
  },
});

export const unsubscribeByTokenInternal = internalMutation({
  args: {
    userId: v.id("users"),
    category: v.union(
      v.literal("transactional"),
      v.literal("tours"),
      v.literal("offers"),
      v.literal("closing"),
      v.literal("disclosures"),
      v.literal("market_updates"),
      v.literal("marketing"),
      v.literal("safety"),
    ),
    channel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("push"),
      v.literal("inApp"),
    ),
    tokenJti: v.string(),
  },
  returns: unsubscribeResultValidator,
  handler: async (ctx, args) => {
    return await unsubscribeSpecificPreference(ctx, args);
  },
});

export const getForCurrentUser = query({
  args: {},
  returns: communicationPreferencesViewValidator,
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return await readPreferencesForUser(ctx, user._id);
  },
});

export const upsertForCurrentUser = mutation({
  args: updatePatchArgsValidator,
  returns: communicationPreferencesViewValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return await upsertPreferencesForUser(ctx, {
      userId: user._id,
      actorUserId: user._id,
      patch: {
        matrix: args.matrix,
        quietHours: args.quietHours,
        channels: args.channels,
        categories: args.categories as Partial<LegacyCategoryEnablement> | undefined,
      },
      source: args.source ?? "legacy_client",
    });
  },
});

export const optOutAllChannels = mutation({
  args: {
    source: v.optional(v.string()),
  },
  returns: communicationPreferencesViewValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return await upsertPreferencesForUser(ctx, {
      userId: user._id,
      actorUserId: user._id,
      patch: optOutAllChannelsPure((await loadPreferenceContext(ctx, user._id)).stored),
      source: args.source ?? "legacy_client",
    });
  },
});

export const resetToDefaults = mutation({
  args: {
    source: v.optional(v.string()),
  },
  returns: communicationPreferencesViewValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return await upsertPreferencesForUser(ctx, {
      userId: user._id,
      actorUserId: user._id,
      patch: defaultPreferences(),
      source: args.source ?? "legacy_client",
    });
  },
});
