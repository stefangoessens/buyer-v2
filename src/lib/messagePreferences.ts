/**
 * Pure decision logic for buyer message delivery preferences (KIN-829).
 *
 * Delivery categories cover the major kinds of buyer-facing messages the
 * platform sends (transactional updates, marketing content, tour
 * logistics, offer activity, deal-status changes). Each category can be
 * enabled or disabled independently. Orthogonally, each delivery channel
 * (email, SMS, push, in-app inbox) can be enabled or disabled for all
 * categories at once.
 *
 * Delivery logic always consults shared preference state via
 * `shouldDeliver(prefs, channel, category)` — never channel-local flags.
 *
 * This file is mirrored by convex/messagePreferences.ts for backend
 * enforcement. Convex files cannot import from `src/`, so keep the two
 * implementations aligned.
 */

// MARK: - Category / Channel keys

export const MESSAGE_CATEGORIES = [
  "transactional",
  "tours",
  "offers",
  "updates",
  "marketing",
] as const;

export const MESSAGE_CHANNELS = [
  "email",
  "sms",
  "push",
  "inApp",
] as const;

export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

// MARK: - Types

export type ChannelEnablement = {
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
};

export type CategoryEnablement = {
  transactional: boolean;
  tours: boolean;
  offers: boolean;
  updates: boolean;
  marketing: boolean;
};

export type MessagePreferences = {
  channels: ChannelEnablement;
  categories: CategoryEnablement;
};

export type PartialMessagePreferences = {
  channels?: Partial<ChannelEnablement>;
  categories?: Partial<CategoryEnablement>;
};

// MARK: - Defaults

/**
 * Sane defaults for a newly-created buyer:
 *   - Transactional channels (email, push, in-app) ON — legally required
 *     or functionally essential (auth codes, deal changes, tour confirms)
 *   - SMS OFF by default — opt-in only
 *   - Transactional, tours, offers, updates categories ON — all the
 *     day-to-day deal activity a buyer needs to hear about
 *   - Marketing OFF — strict opt-in per CAN-SPAM/GDPR hygiene
 */
export function defaultPreferences(): MessagePreferences {
  return {
    channels: {
      email: true,
      sms: false,
      push: true,
      inApp: true,
    },
    categories: {
      transactional: true,
      tours: true,
      offers: true,
      updates: true,
      marketing: false,
    },
  };
}

// MARK: - Delivery decision

/**
 * Decide whether a specific (channel, category) message should be
 * delivered for the given preferences. A message is delivered only when
 * BOTH the channel and the category are enabled.
 *
 * Transactional messages on the in-app channel are an exception —
 * delivery logic should always write transactional events to the in-app
 * inbox even when the user has disabled the in-app channel, because
 * in-app is the buyer's audit trail. Callers enforce this by checking
 * `shouldAlwaysDeliverInApp(category)` first when targeting the inApp
 * channel. This function stays strict so the check is always explicit.
 */
export function shouldDeliver(
  prefs: MessagePreferences,
  channel: MessageChannel,
  category: MessageCategory
): boolean {
  return prefs.channels[channel] === true && prefs.categories[category] === true;
}

/**
 * Transactional messages on the in-app channel are always delivered
 * regardless of preferences — the in-app inbox is the buyer's audit
 * trail for license-critical events and cannot be muted.
 */
export function shouldAlwaysDeliverInApp(category: MessageCategory): boolean {
  return category === "transactional";
}

// MARK: - Merging

/**
 * Merge a partial update into existing preferences without dropping
 * unset fields. Unspecified channels or categories keep their prior
 * value — this is how the mutation handler applies user-driven edits
 * without forcing clients to send the whole preference object.
 */
export function mergePreferences(
  existing: MessagePreferences,
  updates: PartialMessagePreferences
): MessagePreferences {
  return {
    channels: {
      ...existing.channels,
      ...(updates.channels ?? {}),
    },
    categories: {
      ...existing.categories,
      ...(updates.categories ?? {}),
    },
  };
}

// MARK: - Opt-out helpers

/**
 * Apply a full opt-out: every channel off. Categories are left alone —
 * a user can re-enable channels later and have their category settings
 * preserved. This is the "quiet mode" action; use `resetToDefaults` to
 * return to the out-of-the-box state.
 */
export function optOutAllChannels(
  existing: MessagePreferences
): MessagePreferences {
  return {
    channels: { email: false, sms: false, push: false, inApp: false },
    categories: { ...existing.categories },
  };
}

/**
 * True when the user has disabled every delivery channel. Used by the
 * delivery layer to short-circuit send attempts when there's nowhere to
 * deliver. Transactional in-app messages are still written to the inbox
 * via `shouldAlwaysDeliverInApp` even in this state.
 */
export function isGloballyOptedOut(prefs: MessagePreferences): boolean {
  return (
    !prefs.channels.email &&
    !prefs.channels.sms &&
    !prefs.channels.push &&
    !prefs.channels.inApp
  );
}
