import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireAuth } from "./lib/session";
import {
  buildBuyerProfileView,
  buildDealRoomFlowProfile,
  buildOfferFlowProfile,
  buildTourFlowProfile,
  buyerMoveTimeline,
  buyerProfileDealRoomFlowValidator,
  buyerProfileOfferFlowValidator,
  buyerProfileRebatePayoutMethodValidator,
  buyerProfileSavedSearchCriteriaValidator,
  buyerProfileSavedSearchValidator,
  buyerProfileTourFlowValidator,
  buyerProfileViewValidator,
  mergeBuyerProfileSections,
  normalizeBuyerProfileSections,
  type BuyerProfileRebatePayoutMethod,
  type BuyerProfileSavedSearch,
} from "./lib/buyerProfile";
import { financingType } from "./lib/validators";

type SessionCtx = QueryCtx | MutationCtx;
type MessagePreferencePatch = {
  channels?: Partial<Doc<"messageDeliveryPreferences">["channels"]>;
  categories?: Partial<Doc<"messageDeliveryPreferences">["categories"]>;
};

const identityPatchValidator = v.object({
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
});

const communicationPatchValidator = v.object({
  channels: v.optional(
    v.object({
      email: v.optional(v.boolean()),
      sms: v.optional(v.boolean()),
      push: v.optional(v.boolean()),
      inApp: v.optional(v.boolean()),
    }),
  ),
  categories: v.optional(
    v.object({
      transactional: v.optional(v.boolean()),
      tours: v.optional(v.boolean()),
      offers: v.optional(v.boolean()),
      updates: v.optional(v.boolean()),
      marketing: v.optional(v.boolean()),
    }),
  ),
});

const upsertArgs = {
  identity: v.optional(identityPatchValidator),
  financing: v.optional(
    v.object({
      budgetMin: v.optional(v.number()),
      budgetMax: v.optional(v.number()),
      preApproved: v.optional(v.boolean()),
      preApprovalAmount: v.optional(v.number()),
      financingType: v.optional(financingType),
      lenderName: v.optional(v.string()),
      preApprovalExpiry: v.optional(v.string()),
    }),
  ),
  searchPreferences: v.optional(
    v.object({
      preferredAreas: v.optional(v.array(v.string())),
      propertyTypes: v.optional(v.array(v.string())),
      mustHaves: v.optional(v.array(v.string())),
      dealbreakers: v.optional(v.array(v.string())),
      timeline: v.optional(v.string()),
      moveTimeline: v.optional(buyerMoveTimeline),
    }),
  ),
  communicationPreferences: v.optional(communicationPatchValidator),
  household: v.optional(
    v.object({
      householdSize: v.optional(v.number()),
      attendeeCountDefault: v.optional(v.number()),
    }),
  ),
  internal: v.optional(
    v.object({
      notes: v.optional(v.string()),
    }),
  ),
  savedSearches: v.optional(v.array(buyerProfileSavedSearchValidator)),
  rebatePayoutMethod: v.optional(buyerProfileRebatePayoutMethodValidator),
};

async function loadProfileDependencies(ctx: SessionCtx, userId: Id<"users">) {
  const [user, profile, messagePreferences] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
    ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  return { user, profile, messagePreferences };
}

function messagePatchProvided(patch: MessagePreferencePatch | undefined): boolean {
  if (!patch) return false;
  return Boolean(
    patch.channels &&
      Object.values(patch.channels).some((value) => value !== undefined),
  ) ||
    Boolean(
      patch.categories &&
        Object.values(patch.categories).some((value) => value !== undefined),
    );
}

function buildMessagePreferencesRow(
  existing: Doc<"messageDeliveryPreferences"> | null,
  patch: MessagePreferencePatch | undefined,
) {
  const baseChannels = existing?.channels ?? {
    email: true,
    sms: false,
    push: true,
    inApp: true,
  };
  const baseCategories = existing?.categories ?? {
    transactional: true,
    tours: true,
    offers: true,
    updates: true,
    marketing: false,
  };

  return {
    channels: {
      ...baseChannels,
      ...(patch?.channels ?? {}),
    },
    categories: {
      ...baseCategories,
      ...(patch?.categories ?? {}),
    },
  };
}

async function upsertMessagePreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
  existing: Doc<"messageDeliveryPreferences"> | null,
  patch: MessagePreferencePatch | undefined,
  now: string,
) {
  if (!messagePatchProvided(patch)) {
    return {
      row: existing,
      changed: false,
    };
  }

  const next = buildMessagePreferencesRow(existing, patch);
  const changed =
    JSON.stringify(existing?.channels ?? null) !== JSON.stringify(next.channels) ||
    JSON.stringify(existing?.categories ?? null) !==
      JSON.stringify(next.categories);

  if (!changed) {
    return { row: existing, changed: false };
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      channels: next.channels,
      categories: next.categories,
      updatedAt: now,
    });
    return {
      row: {
        ...existing,
        channels: next.channels,
        categories: next.categories,
        updatedAt: now,
      },
      changed: true,
    };
  }

  const id = await ctx.db.insert("messageDeliveryPreferences", {
    userId,
    channels: next.channels,
    categories: next.categories,
    createdAt: now,
    updatedAt: now,
  });

  return {
    row: {
      _id: id,
      _creationTime: Date.now(),
      userId,
      channels: next.channels,
      categories: next.categories,
      createdAt: now,
      updatedAt: now,
    },
    changed: true,
  };
}

async function upsertProfileRecord(
  ctx: MutationCtx,
  params: {
    actor: Doc<"users">;
    targetUser: Doc<"users">;
    existingProfile: Doc<"buyerProfiles"> | null;
    existingMessagePreferences: Doc<"messageDeliveryPreferences"> | null;
    args: {
      identity?: {
        name?: string;
        phone?: string;
        avatarUrl?: string;
      };
      financing?: {
        budgetMin?: number;
        budgetMax?: number;
        preApproved?: boolean;
        preApprovalAmount?: number;
        financingType?: "cash" | "conventional" | "fha" | "va" | "other";
        lenderName?: string;
        preApprovalExpiry?: string;
      };
      searchPreferences?: {
        preferredAreas?: string[];
        propertyTypes?: string[];
        mustHaves?: string[];
        dealbreakers?: string[];
        timeline?: string;
        moveTimeline?: "asap" | "1_3_months" | "3_6_months" | "6_plus_months" | "just_looking";
      };
      communicationPreferences?: MessagePreferencePatch;
      household?: {
        householdSize?: number;
        attendeeCountDefault?: number;
      };
      internal?: {
        notes?: string;
      };
      savedSearches?: BuyerProfileSavedSearch[];
      rebatePayoutMethod?: BuyerProfileRebatePayoutMethod;
    };
  },
): Promise<Id<"buyerProfiles">> {
  const now = new Date().toISOString();
  if (params.args.internal && params.actor.role === "buyer") {
    throw new Error("Only broker or admin can update internal buyer profile fields");
  }

  const baseSections = normalizeBuyerProfileSections(params.existingProfile);
  const nextSections = mergeBuyerProfileSections(baseSections, {
    financing: params.args.financing,
    searchPreferences: params.args.searchPreferences,
    household: params.args.household,
    internal:
      params.actor.role === "broker" || params.actor.role === "admin"
        ? params.args.internal
        : undefined,
  });

  const userPatch: Partial<Pick<Doc<"users">, "name" | "phone" | "avatarUrl">> =
    {};
  if (
    params.args.identity?.name !== undefined &&
    params.args.identity.name !== params.targetUser.name
  ) {
    userPatch.name = params.args.identity.name;
  }
  if (
    params.args.identity?.phone !== undefined &&
    params.args.identity.phone !== params.targetUser.phone
  ) {
    userPatch.phone = params.args.identity.phone;
  }
  if (
    params.args.identity?.avatarUrl !== undefined &&
    params.args.identity.avatarUrl !== params.targetUser.avatarUrl
  ) {
    userPatch.avatarUrl = params.args.identity.avatarUrl;
  }

  const identityChanged = Object.keys(userPatch).length > 0;
  if (identityChanged) {
    await ctx.db.patch(params.targetUser._id, userPatch);
  }

  const sectionsChanged =
    JSON.stringify(baseSections.financing) !== JSON.stringify(nextSections.financing) ||
    JSON.stringify(baseSections.searchPreferences) !==
      JSON.stringify(nextSections.searchPreferences) ||
    JSON.stringify(baseSections.household) !== JSON.stringify(nextSections.household) ||
    JSON.stringify(baseSections.internal ?? null) !==
      JSON.stringify(nextSections.internal ?? null);

  const savedSearchesProvided = params.args.savedSearches !== undefined;
  const nextSavedSearches = savedSearchesProvided
    ? params.args.savedSearches
    : params.existingProfile?.savedSearches;
  const savedSearchesChanged =
    savedSearchesProvided &&
    JSON.stringify(params.existingProfile?.savedSearches ?? null) !==
      JSON.stringify(params.args.savedSearches ?? null);

  const rebatePayoutProvided = params.args.rebatePayoutMethod !== undefined;
  const nextRebatePayoutMethod = rebatePayoutProvided
    ? params.args.rebatePayoutMethod
    : params.existingProfile?.rebatePayoutMethod;
  const rebatePayoutChanged =
    rebatePayoutProvided &&
    JSON.stringify(params.existingProfile?.rebatePayoutMethod ?? null) !==
      JSON.stringify(params.args.rebatePayoutMethod ?? null);

  let profileId: Id<"buyerProfiles">;
  if (params.existingProfile) {
    profileId = params.existingProfile._id;
    if (sectionsChanged || savedSearchesChanged || rebatePayoutChanged) {
      await ctx.db.patch(profileId, {
        financing: nextSections.financing,
        searchPreferences: nextSections.searchPreferences,
        household: nextSections.household,
        updatedAt: now,
        ...(nextSections.internal ? { internal: nextSections.internal } : {}),
        ...(savedSearchesProvided ? { savedSearches: params.args.savedSearches } : {}),
        ...(rebatePayoutProvided
          ? { rebatePayoutMethod: params.args.rebatePayoutMethod }
          : {}),
      });
    }
  } else {
    profileId = await ctx.db.insert("buyerProfiles", {
      userId: params.targetUser._id,
      financing: nextSections.financing,
      searchPreferences: nextSections.searchPreferences,
      household: nextSections.household,
      createdAt: now,
      updatedAt: now,
      ...(nextSections.internal ? { internal: nextSections.internal } : {}),
      ...(nextSavedSearches !== undefined ? { savedSearches: nextSavedSearches } : {}),
      ...(nextRebatePayoutMethod !== undefined
        ? { rebatePayoutMethod: nextRebatePayoutMethod }
        : {}),
    });
  }

  const messagePreferenceResult = await upsertMessagePreferences(
    ctx,
    params.targetUser._id,
    params.existingMessagePreferences,
    params.args.communicationPreferences,
    now,
  );

  if (
    identityChanged ||
    sectionsChanged ||
    savedSearchesChanged ||
    rebatePayoutChanged ||
    messagePreferenceResult.changed ||
    params.existingProfile === null
  ) {
    const changedSections: string[] = [];
    if (identityChanged) changedSections.push("identity");
    if (savedSearchesChanged) changedSections.push("savedSearches");
    if (rebatePayoutChanged) changedSections.push("rebatePayoutMethod");
    if (sectionsChanged) {
      if (
        JSON.stringify(baseSections.financing) !==
        JSON.stringify(nextSections.financing)
      ) {
        changedSections.push("financing");
      }
      if (
        JSON.stringify(baseSections.searchPreferences) !==
        JSON.stringify(nextSections.searchPreferences)
      ) {
        changedSections.push("searchPreferences");
      }
      if (
        JSON.stringify(baseSections.household) !==
        JSON.stringify(nextSections.household)
      ) {
        changedSections.push("household");
      }
      if (
        JSON.stringify(baseSections.internal ?? null) !==
        JSON.stringify(nextSections.internal ?? null)
      ) {
        changedSections.push("internal");
      }
    }
    if (messagePreferenceResult.changed) {
      changedSections.push("communicationPreferences");
    }

    await ctx.db.insert("auditLog", {
      userId: params.actor._id,
      action:
        params.existingProfile === null
          ? "buyer_profile_created"
          : "buyer_profile_updated",
      entityType: "buyerProfiles",
      entityId: profileId,
      details: JSON.stringify({
        targetUserId: params.targetUser._id,
        changedSections,
      }),
      timestamp: now,
    });
  }

  return profileId;
}

/** Get buyer profile for the authenticated user */
export const getMyProfile = query({
  args: {},
  returns: v.union(v.null(), buyerProfileViewValidator),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const { profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      user._id,
    );

    return buildBuyerProfileView({
      user,
      profile,
      messagePreferences,
      includeInternal: user.role !== "buyer",
    });
  },
});

/** Get profile by userId (for broker/admin views) */
export const getByUserId = query({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), buyerProfileViewValidator),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) return null;
    if (
      currentUser._id !== args.userId &&
      currentUser.role !== "broker" &&
      currentUser.role !== "admin"
    ) {
      return null;
    }

    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      args.userId,
    );

    return buildBuyerProfileView({
      user,
      profile,
      messagePreferences,
      includeInternal:
        currentUser.role === "broker" || currentUser.role === "admin",
    });
  },
});

/** Internal query — no access control */
export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: buyerProfileViewValidator,
  handler: async (ctx, args) => {
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      args.userId,
    );
    return buildBuyerProfileView({
      user,
      profile,
      messagePreferences,
      includeInternal: true,
    });
  },
});

export const getOfferFlowByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: buyerProfileOfferFlowValidator,
  handler: async (ctx, args) => {
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      args.userId,
    );
    return buildOfferFlowProfile(
      buildBuyerProfileView({
        user,
        profile,
        messagePreferences,
        includeInternal: true,
      }),
    );
  },
});

export const getDealRoomFlowByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: buyerProfileDealRoomFlowValidator,
  handler: async (ctx, args) => {
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      args.userId,
    );
    return buildDealRoomFlowProfile(
      buildBuyerProfileView({
        user,
        profile,
        messagePreferences,
        includeInternal: false,
      }),
    );
  },
});

export const getTourFlowByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: buyerProfileTourFlowValidator,
  handler: async (ctx, args) => {
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      args.userId,
    );
    return buildTourFlowProfile(
      buildBuyerProfileView({
        user,
        profile,
        messagePreferences,
        includeInternal: false,
      }),
    );
  },
});

/** Create or update buyer profile (upsert) */
export const createOrUpdate = mutation({
  args: upsertArgs,
  returns: v.id("buyerProfiles"),
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      actor._id,
    );
    return await upsertProfileRecord(ctx, {
      actor,
      targetUser: user,
      existingProfile: profile,
      existingMessagePreferences: messagePreferences,
      args,
    });
  },
});

/** Broker/admin update for a buyer profile by userId */
export const upsertByUserId = mutation({
  args: {
    userId: v.id("users"),
    ...upsertArgs,
  },
  returns: v.id("buyerProfiles"),
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    if (actor.role !== "broker" && actor.role !== "admin") {
      throw new Error("Broker or admin role required");
    }
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      args.userId,
    );
    return await upsertProfileRecord(ctx, {
      actor,
      targetUser: user,
      existingProfile: profile,
      existingMessagePreferences: messagePreferences,
      args,
    });
  },
});

/** Add a saved search to the current buyer's profile */
export const addSavedSearch = mutation({
  args: {
    name: v.string(),
    criteria: buyerProfileSavedSearchCriteriaValidator,
  },
  returns: v.id("buyerProfiles"),
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      actor._id,
    );
    const now = new Date().toISOString();
    const existing = profile?.savedSearches ?? [];
    const nextSavedSearches: BuyerProfileSavedSearch[] = [
      ...existing,
      {
        id: crypto.randomUUID(),
        name: args.name,
        criteria: args.criteria,
        createdAt: now,
      },
    ];
    return await upsertProfileRecord(ctx, {
      actor,
      targetUser: user,
      existingProfile: profile,
      existingMessagePreferences: messagePreferences,
      args: { savedSearches: nextSavedSearches },
    });
  },
});

/** Remove a saved search by id from the current buyer's profile */
export const removeSavedSearch = mutation({
  args: { id: v.string() },
  returns: v.id("buyerProfiles"),
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      actor._id,
    );
    const existing = profile?.savedSearches ?? [];
    const nextSavedSearches = existing.filter((entry) => entry.id !== args.id);
    return await upsertProfileRecord(ctx, {
      actor,
      targetUser: user,
      existingProfile: profile,
      existingMessagePreferences: messagePreferences,
      args: { savedSearches: nextSavedSearches },
    });
  },
});

/** Update the rebate payout method for the current buyer */
export const updateRebatePayoutMethod = mutation({
  args: {
    method: v.union(
      v.literal("bank"),
      v.literal("check"),
      v.literal("cashapp"),
      v.literal("none"),
    ),
    accountLast4: v.optional(v.string()),
    payoutAddress: v.optional(v.string()),
  },
  returns: v.id("buyerProfiles"),
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      actor._id,
    );
    const now = new Date().toISOString();
    return await upsertProfileRecord(ctx, {
      actor,
      targetUser: user,
      existingProfile: profile,
      existingMessagePreferences: messagePreferences,
      args: {
        rebatePayoutMethod: {
          method: args.method,
          accountLast4: args.accountLast4,
          payoutAddress: args.payoutAddress,
          updatedAt: now,
        },
      },
    });
  },
});

/** Update communication preferences only */
export const updateCommPrefs = mutation({
  args: {
    channels: v.optional(
      v.object({
        email: v.optional(v.boolean()),
        sms: v.optional(v.boolean()),
        push: v.optional(v.boolean()),
        inApp: v.optional(v.boolean()),
      }),
    ),
    categories: v.optional(
      v.object({
        transactional: v.optional(v.boolean()),
        tours: v.optional(v.boolean()),
        offers: v.optional(v.boolean()),
        updates: v.optional(v.boolean()),
        marketing: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.id("buyerProfiles"),
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const { user, profile, messagePreferences } = await loadProfileDependencies(
      ctx,
      actor._id,
    );
    return await upsertProfileRecord(ctx, {
      actor,
      targetUser: user,
      existingProfile: profile,
      existingMessagePreferences: messagePreferences,
      args: {
        communicationPreferences: args,
      },
    });
  },
});
