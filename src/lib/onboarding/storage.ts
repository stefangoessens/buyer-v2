import {
  BUYER_SESSION_COOKIE,
  BUYER_SESSION_STORAGE_KEY,
  ONBOARDING_STORAGE_KEY,
  type BuyerOnboardingState,
  type BuyerSession,
  type BuyerSessionCookie,
} from "@/lib/onboarding/types";

function nowIso() {
  return new Date().toISOString();
}

export function createEmptyOnboardingState(): BuyerOnboardingState {
  return {
    version: 1,
    status: "draft",
    currentStep: "account",
    account: {
      fullName: "",
      email: "",
      phone: "",
    },
    buyerBasics: {
      budgetMin: 500000,
      budgetMax: 900000,
      timeline: "90_plus_days",
      financing: "conventional",
      preferredAreas: "Miami Beach, Coral Gables",
    },
    propertyLinkage: {
      listingUrl: "",
      linkedSearch: null,
    },
    updatedAt: nowIso(),
  };
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readOnboardingState(): BuyerOnboardingState | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;

    return JSON.parse(raw) as BuyerOnboardingState;
  } catch {
    return null;
  }
}

export function writeOnboardingState(state: BuyerOnboardingState) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(
    ONBOARDING_STORAGE_KEY,
    JSON.stringify({
      ...state,
      updatedAt: nowIso(),
    } satisfies BuyerOnboardingState),
  );
}

export function clearOnboardingState() {
  if (!canUseStorage()) return;

  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}

export function readBuyerSession(): BuyerSession | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(BUYER_SESSION_STORAGE_KEY);
    if (!raw) return null;

    return JSON.parse(raw) as BuyerSession;
  } catch {
    return null;
  }
}

export function buyerSessionToCookie(session: BuyerSession): BuyerSessionCookie {
  return {
    version: 1,
    status: "registered",
    buyerName: session.buyerName,
    buyerEmail: session.buyerEmail,
    firstPropertyId: session.firstSearch.propertyId,
  };
}

export function serializeBuyerSessionCookie(session: BuyerSessionCookie) {
  return encodeURIComponent(JSON.stringify(session));
}

export function parseBuyerSessionCookie(
  value: string | undefined,
): BuyerSessionCookie | null {
  if (!value) return null;

  try {
    return JSON.parse(decodeURIComponent(value)) as BuyerSessionCookie;
  } catch {
    return null;
  }
}

export function writeBuyerSession(session: BuyerSession) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(BUYER_SESSION_STORAGE_KEY, JSON.stringify(session));
  document.cookie = `${BUYER_SESSION_COOKIE}=${serializeBuyerSessionCookie(
    buyerSessionToCookie(session),
  )}; path=/; max-age=2592000; samesite=lax`;
}

export function clearBuyerSession() {
  if (canUseStorage()) {
    window.localStorage.removeItem(BUYER_SESSION_STORAGE_KEY);
  }

  if (typeof document !== "undefined") {
    document.cookie = `${BUYER_SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}

export function createBuyerSessionFromDraft(
  state: BuyerOnboardingState,
): BuyerSession {
  if (!state.propertyLinkage.linkedSearch) {
    throw new Error("A linked search is required to create a buyer session.");
  }

  return {
    version: 1,
    status: "registered",
    registeredAt: nowIso(),
    buyerName: state.account.fullName.trim(),
    buyerEmail: state.account.email.trim().toLowerCase(),
    buyerPhone: state.account.phone.trim(),
    buyerBasics: state.buyerBasics,
    firstSearch: state.propertyLinkage.linkedSearch,
    searches: [state.propertyLinkage.linkedSearch],
  };
}

export function upsertSearchInSession(
  session: BuyerSession,
  incomingSearch: BuyerSession["firstSearch"],
): BuyerSession {
  const existing = session.searches.find(
    (search) => search.propertyId === incomingSearch.propertyId,
  );

  const searches = existing
    ? session.searches.map((search) =>
        search.propertyId === incomingSearch.propertyId ? incomingSearch : search,
      )
    : [incomingSearch, ...session.searches];

  return {
    ...session,
    firstSearch: searches[0],
    searches,
  };
}
