import {
  buildMessagePreferencesView,
  defaultPreferences,
  type LegacyCategoryEnablement,
  type ChannelEnablement,
  type MessagePreferenceMatrix,
  type MessagePreferenceSmsState,
  type QuietHours,
} from "@/lib/messagePreferences";

export const BUYER_MOVE_TIMELINES = [
  "asap",
  "1_3_months",
  "3_6_months",
  "6_plus_months",
  "just_looking",
] as const;

export type BuyerMoveTimeline = (typeof BUYER_MOVE_TIMELINES)[number];

export type BuyerFinancingType =
  | "cash"
  | "conventional"
  | "fha"
  | "va"
  | "other";

export interface BuyerProfileIdentity {
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
}

export interface BuyerProfileFinancing {
  budgetMin?: number;
  budgetMax?: number;
  preApproved: boolean;
  preApprovalAmount?: number;
  financingType?: BuyerFinancingType;
  lenderName?: string;
  preApprovalExpiry?: string;
}

export interface BuyerProfileSearchPreferences {
  preferredAreas: string[];
  propertyTypes: string[];
  mustHaves: string[];
  dealbreakers: string[];
  timeline?: string;
  moveTimeline?: BuyerMoveTimeline;
}

export interface BuyerProfileHousehold {
  householdSize?: number;
  attendeeCountDefault?: number;
}

export interface BuyerProfileInternal {
  notes?: string;
}

export interface BuyerProfileCommunicationPreferences {
  hasStoredPreferences: boolean;
  matrix: MessagePreferenceMatrix;
  quietHours: QuietHours;
  channels: ChannelEnablement;
  categories: LegacyCategoryEnablement;
  effective: {
    matrix: MessagePreferenceMatrix;
    sms: MessagePreferenceSmsState;
  };
}

export interface BuyerProfileView {
  profileId: string | null;
  hasStoredProfile: boolean;
  userId: string;
  identity: BuyerProfileIdentity;
  financing: BuyerProfileFinancing;
  searchPreferences: BuyerProfileSearchPreferences;
  communicationPreferences: BuyerProfileCommunicationPreferences;
  household: BuyerProfileHousehold;
  createdAt: string | null;
  updatedAt: string | null;
  internal?: BuyerProfileInternal;
}

export type BuyerProfileSectionPatch = {
  financing?: Partial<BuyerProfileFinancing>;
  searchPreferences?: Partial<BuyerProfileSearchPreferences>;
  household?: Partial<BuyerProfileHousehold>;
  internal?: Partial<BuyerProfileInternal>;
};

type BuyerProfileSections = Pick<
  BuyerProfileView,
  "financing" | "searchPreferences" | "household"
> & {
  internal?: BuyerProfileInternal;
};

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

export function buildCommunicationPreferences(
  overrides?: Partial<BuyerProfileCommunicationPreferences>,
): BuyerProfileCommunicationPreferences {
  const defaults = defaultPreferences();
  return buildMessagePreferencesView({
    hasStoredPreferences: overrides?.hasStoredPreferences ?? false,
    preferences: {
      matrix: overrides?.matrix ?? defaults.matrix,
      quietHours: overrides?.quietHours ?? defaults.quietHours,
    },
    smsState: overrides?.effective?.sms,
  });
}

export function buildBuyerProfileView(params: {
  userId: string;
  identity: BuyerProfileIdentity;
  profile?: BuyerProfileSectionPatch & {
    profileId?: string | null;
    hasStoredProfile?: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  communicationPreferences?: Partial<BuyerProfileCommunicationPreferences>;
  includeInternal?: boolean;
}): BuyerProfileView {
  const sections = mergeBuyerProfileSections(defaultBuyerProfileSections(), {
    financing: params.profile?.financing,
    searchPreferences: params.profile?.searchPreferences,
    household: params.profile?.household,
    internal: params.profile?.internal,
  });
  return {
    profileId: params.profile?.profileId ?? null,
    hasStoredProfile: params.profile?.hasStoredProfile ?? false,
    userId: params.userId,
    identity: params.identity,
    financing: sections.financing,
    searchPreferences: sections.searchPreferences,
    communicationPreferences: buildCommunicationPreferences(
      params.communicationPreferences,
    ),
    household: sections.household,
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
  household: BuyerProfileHousehold,
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
