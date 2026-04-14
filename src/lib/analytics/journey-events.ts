import { track, type AnalyticsEventMap } from "@/lib/analytics";

export const JOURNEY_EVENTS = {
  INDEX_VIEWED: "journeys_index_viewed",
  CARD_OPENED: "journey_card_opened",
  CONTINUE_CLICKED: "journey_continue_clicked",
  ARCHIVE_CLICKED: "journey_archive_clicked",
  ARCHIVE_UNDO_CLICKED: "journey_archive_undo_clicked",
  ARCHIVE_COMMITTED: "journey_archive_committed",
  RESTORED: "journey_restored",
  FILTER_CHANGED: "journey_filter_changed",
  SORT_CHANGED: "journey_sort_changed",
  PRIORITY_CHANGED: "journey_priority_changed",
  LABEL_SAVED: "journey_label_saved",
  SEARCH_USED: "journey_search_used",
  DEEP_LINK_OPENED_WITH_FILTERS: "journey_deep_link_opened_with_filters",
  STALE_WARNING_SHOWN: "journey_stale_warning_shown",
  STALE_WARNING_ACTION: "journey_stale_warning_action",
  RESUME_FROM_HOME_TEASER: "journey_resume_from_home_teaser",
  LIST_EMPTY_CTA_CLICKED: "journey_list_empty_cta_clicked",
} as const satisfies Record<string, keyof AnalyticsEventMap>;

export type JourneyEventKey = keyof typeof JOURNEY_EVENTS;
export type JourneyEventName = (typeof JOURNEY_EVENTS)[JourneyEventKey];

export function trackJourneyEvent<K extends JourneyEventKey>(
  key: K,
  properties: AnalyticsEventMap[(typeof JOURNEY_EVENTS)[K]],
): void {
  const eventName = JOURNEY_EVENTS[key];
  track(eventName, properties);
}
