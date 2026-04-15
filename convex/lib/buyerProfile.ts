import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  financingType,
  smsConsentSource,
  smsConsentState,
} from "./validators";
import {
  buildMessagePreferencesView as buildSharedMessagePreferencesView,
  defaultPreferences as defaultSharedPreferences,
  migrateLegacyPreferences,
  type MessagePreferenceSmsState,
  type MessagePreferences,
} from "../../src/lib/messagePreferences";

export const buyerMoveTimeline = v.union(
  v.literal("asap"),
  v.literal("1_3_months"),
  v.literal("3_6_months"),
  v.literal("6_plus_months"),
  v.literal("just_looking"),
);

export const communicationChannelsValidator = v.object({
  email: v.boolean(),
  sms: v.boolean(),
  push: v.boolean(),
  inApp: v.boolean(),
});

export const legacyCommunicationCategoriesValidator = v.object({
  transactional: v.boolean(),
  tours: v.boolean(),
  offers: v.boolean(),
  updates: v.boolean(),
  marketing: v.boolean(),
});

export const communicationMatrixValidator = v.object({
  transactional: communicationChannelsValidator,
  tours: communicationChannelsValidator,
  offers: communicationChannelsValidator,
  closing: communicationChannelsValidator,
  disclosures: communicationChannelsValidator,
  market_updates: communicationChannelsValidator,
  marketing: communicationChannelsValidator,
  safety: communicationChannelsValidator,
});

export const communicationQuietHoursValidator = v.object({
  enabled: v.boolean(),
  startMinutes: v.number(),
  endMinutes: v.number(),
  timezone: v.string(),
});

export const communicationSmsStateValidator = v.object({
  consentStatus: v.union(
    v.literal("unknown"),
    v.literal("opted_in"),
    v.literal("opted_out"),
    v.literal("suppressed"),
  ),
  isGloballySuppressed: v.boolean(),
  reason: v.union(
    v.literal("sms_stop"),
    v.literal("manual_suppression"),
    v.null(),
  ),
  phoneMissing: v.boolean(),
  updatedAt: v.union(v.string(), v.null()),
});

export const communicationPreferencesViewValidator = v.object({
  hasStoredPreferences: v.boolean(),
  matrix: communicationMatrixValidator,
  quietHours: communicationQuietHoursValidator,
  channels: communicationChannelsValidator,
  categories: legacyCommunicationCategoriesValidator,
  effective: v.object({
    matrix: communicationMatrixValidator,
    sms: communicationSmsStateValidator,
  }),
});

export const buyerProfileFinancingValidator = v.object({
  budgetMin: v.optional(v.number()),
  budgetMax: v.optional(v.number()),
  preApproved: v.boolean(),
  preApprovalAmount: v.optional(v.number()),
  financingType: v.optional(financingType),
  lenderName: v.optional(v.string()),
  preApprovalExpiry: v.optional(v.string()),
});

export const buyerProfileSearchPreferencesValidator = v.object({
  preferredAreas: v.array(v.string()),
  propertyTypes: v.array(v.string()),
  mustHaves: v.array(v.string()),
  dealbreakers: v.array(v.string()),
  timeline: v.optional(v.string()),
  moveTimeline: v.optional(buyerMoveTimeline),
});

export const buyerProfileHouseholdValidator = v.object({
  householdSize: v.optional(v.number()),
  attendeeCountDefault: v.optional(v.number()),
});

export const buyerProfileInternalValidator = v.object({
  notes: v.optional(v.string()),
});

export const buyerProfileSavedSearchCriteriaValidator = v.object({
  preferredAreas: v.array(v.string()),
  propertyTypes: v.optional(v.array(v.string())),
  priceMin: v.optional(v.number()),
  priceMax: v.optional(v.number()),
  bedsMin: v.optional(v.number()),
  bathsMin: v.optional(v.number()),
  yearBuiltMin: v.optional(v.number()),
  mustHaves: v.optional(v.array(v.string())),
});

export const buyerProfileSavedSearchValidator = v.object({
  id: v.string(),
  name: v.string(),
  criteria: buyerProfileSavedSearchCriteriaValidator,
  createdAt: v.string(),
  lastRunAt: v.optional(v.string()),
});

export const buyerProfileRebatePayoutMethodValidator = v.object({
  method: v.union(
    v.literal("bank"),
    v.literal("check"),
    v.literal("cashapp"),
    v.literal("none"),
  ),
  accountLast4: v.optional(v.string()),
  payoutAddress: v.optional(v.string()),
  updatedAt: v.string(),
});

export const buyerProfileSmsConsentLogEntryValidator = v.object({
  source: smsConsentSource,
  state: smsConsentState,
  phone: v.string(),
  policyVersion: v.string(),
  createdAt: v.string(),
  messageSid: v.optional(v.string()),
  verificationSid: v.optional(v.string()),
  note: v.optional(v.string()),
});

export const buyerProfileSmsPatchValidator = v.object({
  phoneVerifiedAt: v.optional(v.string()),
  consentState: v.optional(smsConsentState),
  consentSource: v.optional(smsConsentSource),
  consentPolicyVersion: v.optional(v.string()),
  consentUpdatedAt: v.optional(v.string()),
  consentLog: v.optional(v.array(buyerProfileSmsConsentLogEntryValidator)),
});

export const buyerProfileSmsViewValidator = v.object({
  phoneVerifiedAt: v.union(v.string(), v.null()),
  consentState: smsConsentState,
  consentSource: v.union(smsConsentSource, v.null()),
  consentPolicyVersion: v.union(v.string(), v.null()),
  consentUpdatedAt: v.union(v.string(), v.null()),
  consentLog: v.array(buyerProfileSmsConsentLogEntryValidator),
});

export const buyerProfileIdentityValidator = v.object({
  name: v.string(),
  email: v.string(),
  phone: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
});

export const buyerProfileRecordFields = {
  userId: v.id("users"),
  financing: buyerProfileFinancingValidator,
  searchPreferences: buyerProfileSearchPreferencesValidator,
  household: buyerProfileHouseholdValidator,
  internal: v.optional(buyerProfileInternalValidator),
  savedSearches: v.optional(v.array(buyerProfileSavedSearchValidator)),
  rebatePayoutMethod: v.optional(buyerProfileRebatePayoutMethodValidator),
  phoneVerifiedAt: v.optional(v.string()),
  smsConsentState: v.optional(smsConsentState),
  smsConsentSource: v.optional(smsConsentSource),
  smsConsentPolicyVersion: v.optional(v.string()),
  smsConsentUpdatedAt: v.optional(v.string()),
  smsConsentLog: v.optional(v.array(buyerProfileSmsConsentLogEntryValidator)),
  createdAt: v.string(),
  updatedAt: v.string(),
};

export const buyerProfileViewValidator = v.object({
  profileId: v.union(v.id("buyerProfiles"), v.null()),
  hasStoredProfile: v.boolean(),
  userId: v.id("users"),
  identity: buyerProfileIdentityValidator,
  financing: buyerProfileFinancingValidator,
  searchPreferences: buyerProfileSearchPreferencesValidator,
  communicationPreferences: communicationPreferencesViewValidator,
  sms: buyerProfileSmsViewValidator,
  household: buyerProfileHouseholdValidator,
  savedSearches: v.array(buyerProfileSavedSearchValidator),
  rebatePayoutMethod: v.union(buyerProfileRebatePayoutMethodValidator, v.null()),
  createdAt: v.union(v.string(), v.null()),
  updatedAt: v.union(v.string(), v.null()),
  internal: v.optional(buyerProfileInternalValidator),
});

export const buyerProfileOfferFlowValidator = v.object({
  budgetMax: v.optional(v.number()),
  financingType: v.optional(financingType),
  preApproved: v.boolean(),
  preApprovalAmount: v.optional(v.number()),
  preApprovalExpiry: v.optional(v.string()),
  lenderName: v.optional(v.string()),
});

export const buyerProfileDealRoomFlowValidator = v.object({
  preferredAreas: v.array(v.string()),
  propertyTypes: v.array(v.string()),
  mustHaves: v.array(v.string()),
  dealbreakers: v.array(v.string()),
  timeline: v.optional(v.string()),
  moveTimeline: v.optional(buyerMoveTimeline),
});

export const buyerProfileTourFlowValidator = v.object({
  householdSize: v.optional(v.number()),
  attendeeCountDefault: v.number(),
  communicationPreferences: communicationPreferencesViewValidator,
});

export type BuyerProfileView = {
  profileId: Id<"buyerProfiles"> | null;
  hasStoredProfile: boolean;
  userId: Id<"users">;
  identity: {
    name: string;
    email: string;
    phone?: string;
    avatarUrl?: string;
  };
  financing: {
    budgetMin?: number;
    budgetMax?: number;
    preApproved: boolean;
    preApprovalAmount?: number;
    financingType?: "cash" | "conventional" | "fha" | "va" | "other";
    lenderName?: string;
    preApprovalExpiry?: string;
  };
  searchPreferences: {
    preferredAreas: string[];
    propertyTypes: string[];
    mustHaves: string[];
    dealbreakers: string[];
    timeline?: string;
    moveTimeline?: "asap" | "1_3_months" | "3_6_months" | "6_plus_months" | "just_looking";
  };
  communicationPreferences: {
    hasStoredPreferences: boolean;
    matrix: {
      transactional: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
      tours: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
      offers: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
      closing: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
      disclosures: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
      market_updates: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
      marketing: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
      safety: {
        email: boolean;
        sms: boolean;
        push: boolean;
        inApp: boolean;
      };
    };
    quietHours: {
      enabled: boolean;
      startMinutes: number;
      endMinutes: number;
      timezone: string;
    };
    channels: {
      email: boolean;
      sms: boolean;
      push: boolean;
      inApp: boolean;
    };
    categories: {
      transactional: boolean;
      tours: boolean;
      offers: boolean;
      updates: boolean;
      marketing: boolean;
    };
    effective: {
      matrix: {
        transactional: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
        tours: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
        offers: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
        closing: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
        disclosures: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
        market_updates: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
        marketing: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
        safety: {
          email: boolean;
          sms: boolean;
          push: boolean;
          inApp: boolean;
        };
      };
      sms: {
        consentStatus: "unknown" | "opted_in" | "opted_out" | "suppressed";
        isGloballySuppressed: boolean;
        reason: "sms_stop" | "manual_suppression" | null;
        phoneMissing: boolean;
        updatedAt: string | null;
      };
    };
  };
  sms: {
    phoneVerifiedAt: string | null;
    consentState:
      | "unknown"
      | "pending"
      | "verified"
      | "opted_out"
      | "suppressed";
    consentSource:
      | "dashboard_banner"
      | "offer_gate"
      | "sms_to_deal_room"
      | "support"
      | "admin"
      | null;
    consentPolicyVersion: string | null;
    consentUpdatedAt: string | null;
    consentLog: BuyerProfileSmsConsentLogEntry[];
  };
  household: {
    householdSize?: number;
    attendeeCountDefault?: number;
  };
  savedSearches: BuyerProfileSavedSearch[];
  rebatePayoutMethod: BuyerProfileRebatePayoutMethod | null;
  createdAt: string | null;
  updatedAt: string | null;
  internal?: {
    notes?: string;
  };
};

export type BuyerProfileSmsConsentSource = Exclude<
  BuyerProfileView["sms"]["consentSource"],
  null
>;

export type BuyerProfileSmsConsentLogEntry = {
  source:
    | "dashboard_banner"
    | "offer_gate"
    | "sms_to_deal_room"
    | "support"
    | "admin";
  state:
    | "unknown"
    | "pending"
    | "verified"
    | "opted_out"
    | "suppressed";
  phone: string;
  policyVersion: string;
  createdAt: string;
  messageSid?: string;
  verificationSid?: string;
  note?: string;
};

export type BuyerProfileSmsPatch = {
  phoneVerifiedAt?: string;
  consentState?: BuyerProfileView["sms"]["consentState"];
  consentSource?: BuyerProfileSmsConsentSource;
  consentPolicyVersion?: string;
  consentUpdatedAt?: string;
  consentLog?: BuyerProfileSmsConsentLogEntry[];
};

export type BuyerProfileRow = Doc<"buyerProfiles"> & {
  phoneVerifiedAt?: string;
  smsConsentState?: BuyerProfileView["sms"]["consentState"];
  smsConsentSource?: BuyerProfileSmsConsentSource;
  smsConsentPolicyVersion?: string;
  smsConsentUpdatedAt?: string;
  smsConsentLog?: BuyerProfileSmsConsentLogEntry[];
};

export type BuyerProfileSavedSearchCriteria = {
  preferredAreas: string[];
  propertyTypes?: string[];
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  bathsMin?: number;
  yearBuiltMin?: number;
  mustHaves?: string[];
};

export type BuyerProfileSavedSearch = {
  id: string;
  name: string;
  criteria: BuyerProfileSavedSearchCriteria;
  createdAt: string;
  lastRunAt?: string;
};

export type BuyerProfileRebatePayoutMethod = {
  method: "bank" | "check" | "cashapp" | "none";
  accountLast4?: string;
  payoutAddress?: string;
  updatedAt: string;
};

type BuyerProfileSections = Pick<
  BuyerProfileView,
  "financing" | "searchPreferences" | "household"
> & {
  internal?: BuyerProfileView["internal"];
};

type BuyerProfileSectionPatch = {
  financing?: Partial<BuyerProfileView["financing"]>;
  searchPreferences?: Partial<BuyerProfileView["searchPreferences"]>;
  household?: Partial<BuyerProfileView["household"]>;
  internal?: Partial<NonNullable<BuyerProfileView["internal"]>>;
};

type MessagePreferenceRow = Doc<"messageDeliveryPreferences"> | null;
type SessionCtx = QueryCtx | MutationCtx;

export function buildBuyerProfileSmsView(
  row: BuyerProfileRow | null,
): BuyerProfileView["sms"] {
  return {
    phoneVerifiedAt: row?.phoneVerifiedAt ?? null,
    consentState:
      row?.smsConsentState ??
      (row?.phoneVerifiedAt ? "verified" : "unknown"),
    consentSource: row?.smsConsentSource ?? null,
    consentPolicyVersion: row?.smsConsentPolicyVersion ?? null,
    consentUpdatedAt: row?.smsConsentUpdatedAt ?? row?.phoneVerifiedAt ?? null,
    consentLog: row?.smsConsentLog ?? [],
  };
}

export function mergeBuyerProfileSmsRecord(
  existing: BuyerProfileRow | null,
  patch: BuyerProfileSmsPatch | undefined,
): BuyerProfileSmsPatch {
  if (!patch) {
    return {
      phoneVerifiedAt: existing?.phoneVerifiedAt,
      consentState: existing?.smsConsentState,
      consentSource: existing?.smsConsentSource,
      consentPolicyVersion: existing?.smsConsentPolicyVersion,
      consentUpdatedAt: existing?.smsConsentUpdatedAt,
      consentLog: existing?.smsConsentLog,
    };
  }

  return {
    phoneVerifiedAt:
      patch.phoneVerifiedAt !== undefined
        ? patch.phoneVerifiedAt
        : existing?.phoneVerifiedAt,
    consentState:
      patch.consentState !== undefined
        ? patch.consentState
        : existing?.smsConsentState,
    consentSource:
      patch.consentSource !== undefined
        ? patch.consentSource
        : existing?.smsConsentSource,
    consentPolicyVersion:
      patch.consentPolicyVersion !== undefined
        ? patch.consentPolicyVersion
        : existing?.smsConsentPolicyVersion,
    consentUpdatedAt:
      patch.consentUpdatedAt !== undefined
        ? patch.consentUpdatedAt
        : existing?.smsConsentUpdatedAt,
    consentLog:
      patch.consentLog !== undefined
        ? patch.consentLog
        : existing?.smsConsentLog,
  };
}
export function defaultBuyerProfileSections(): BuyerProfileSections {
  return {
    financing: {
      preApproved: false,
    },
    searchPreferences: {
      preferredAreas: [],
      propertyTypes: [],
      mustHaves: [],
      dealbreakers: [],
    },
    household: {},
  };
}

export function mergeBuyerProfileSections(
  existing: BuyerProfileSections,
  patch: BuyerProfileSectionPatch,
): BuyerProfileSections {
  return {
    financing: {
      ...existing.financing,
      ...(patch.financing ?? {}),
      preApproved:
        patch.financing?.preApproved ?? existing.financing.preApproved,
    },
    searchPreferences: {
      ...existing.searchPreferences,
      ...(patch.searchPreferences ?? {}),
      preferredAreas:
        patch.searchPreferences?.preferredAreas ??
        existing.searchPreferences.preferredAreas,
      propertyTypes:
        patch.searchPreferences?.propertyTypes ??
        existing.searchPreferences.propertyTypes,
      mustHaves:
        patch.searchPreferences?.mustHaves ??
        existing.searchPreferences.mustHaves,
      dealbreakers:
        patch.searchPreferences?.dealbreakers ??
        existing.searchPreferences.dealbreakers,
    },
    household: {
      ...existing.household,
      ...(patch.household ?? {}),
    },
    internal:
      patch.internal || existing.internal
        ? {
            ...(existing.internal ?? {}),
            ...(patch.internal ?? {}),
          }
        : undefined,
  };
}

export function normalizeBuyerProfileSections(
  row: BuyerProfileRow | null,
): BuyerProfileSections {
  return mergeBuyerProfileSections(defaultBuyerProfileSections(), {
    financing: row?.financing,
    searchPreferences: row?.searchPreferences,
    household: row?.household,
    internal: row?.internal,
  });
}

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

export function buildCommunicationPreferences(
  row: MessagePreferenceRow,
  smsState?: MessagePreferenceSmsState,
): BuyerProfileView["communicationPreferences"] {
  return buildSharedMessagePreferencesView({
    hasStoredPreferences: row !== null,
    preferences: row ? coerceStoredPreferences(row) : defaultSharedPreferences(),
    smsState,
  });
}

export function buildBuyerProfileView(params: {
  user: Doc<"users">;
  profile: BuyerProfileRow | null;
  messagePreferences: MessagePreferenceRow;
  smsState?: MessagePreferenceSmsState;
  includeInternal: boolean;
}): BuyerProfileView {
  const sections = normalizeBuyerProfileSections(params.profile);
  return {
    profileId: params.profile?._id ?? null,
    hasStoredProfile: params.profile !== null,
    userId: params.user._id,
    identity: {
      name: params.user.name,
      email: params.user.email,
      phone: params.user.phone,
      avatarUrl: params.user.avatarUrl,
    },
    financing: sections.financing,
    searchPreferences: sections.searchPreferences,
    communicationPreferences: buildCommunicationPreferences(
      params.messagePreferences,
      params.smsState,
    ),
    sms: buildBuyerProfileSmsView(params.profile),
    household: sections.household,
    savedSearches: params.profile?.savedSearches ?? [],
    rebatePayoutMethod: params.profile?.rebatePayoutMethod ?? null,
    createdAt: params.profile?.createdAt ?? null,
    updatedAt: params.profile?.updatedAt ?? null,
    internal: params.includeInternal ? sections.internal : undefined,
  };
}

export function buildOfferFlowProfile(profile: BuyerProfileView) {
  return {
    budgetMax: profile.financing.budgetMax,
    financingType: profile.financing.financingType,
    preApproved: profile.financing.preApproved,
    preApprovalAmount: profile.financing.preApprovalAmount,
    preApprovalExpiry: profile.financing.preApprovalExpiry,
    lenderName: profile.financing.lenderName,
  };
}

export function buildDealRoomFlowProfile(profile: BuyerProfileView) {
  return {
    preferredAreas: profile.searchPreferences.preferredAreas,
    propertyTypes: profile.searchPreferences.propertyTypes,
    mustHaves: profile.searchPreferences.mustHaves,
    dealbreakers: profile.searchPreferences.dealbreakers,
    timeline: profile.searchPreferences.timeline,
    moveTimeline: profile.searchPreferences.moveTimeline,
  };
}

export function resolveTourAttendeeCountDefault(
  household: BuyerProfileView["household"],
): number {
  if (
    typeof household.attendeeCountDefault === "number" &&
    household.attendeeCountDefault >= 1
  ) {
    return household.attendeeCountDefault;
  }
  if (
    typeof household.householdSize === "number" &&
    household.householdSize >= 1
  ) {
    return household.householdSize;
  }
  return 1;
}

export function buildTourFlowProfile(profile: BuyerProfileView) {
  return {
    householdSize: profile.household.householdSize,
    attendeeCountDefault: resolveTourAttendeeCountDefault(profile.household),
    communicationPreferences: profile.communicationPreferences,
  };
}

export async function loadBuyerProfileView(
  ctx: SessionCtx,
  userId: Id<"users">,
  includeInternal: boolean,
): Promise<BuyerProfileView> {
  const [user, profile, messagePreferences] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique() as Promise<BuyerProfileRow | null>,
    ctx.db
      .query("messageDeliveryPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  return buildBuyerProfileView({
    user,
    profile,
    messagePreferences,
    includeInternal,
  });
}
