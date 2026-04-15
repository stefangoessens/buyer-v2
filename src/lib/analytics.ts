import posthog from "posthog-js";
import type { LaunchEventMap } from "@buyer-v2/shared/launch-events";
import type { FAQTheme } from "@/lib/content/types";
import type {
  ExternalNotificationChannel,
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryState,
  NotificationProviderName,
  NotificationUrgency,
  WebhookTransition,
} from "@/lib/notifications/types";
import { resolveObservabilityContext } from "@/lib/observability";
import { deepScrubPii } from "@/lib/security/pii-guard";

/**
 * Canonical analytics event catalog for buyer-v2.
 *
 * Each key is an event name (snake_case verb_noun). Each value is the
 * typed properties shape for that event. Adding a new event requires:
 *   1. Add a key here with its properties type
 *   2. Add metadata entry to EVENT_METADATA
 *   3. Update this JSDoc
 *   4. PR review with owner sign-off (see governance section in README)
 *
 * Owned by: Analytics guild. Source of truth — PostHog dashboards
 * reference these exact event names.
 */
export interface AnalyticsEventMap extends LaunchEventMap {
  // ─── Non-launch analytics events ────────────────────────────────────
  /** Fired on deal room unmount; reports time spent in ms. */
  deal_room_exited: { dealRoomId: string; timeSpentMs: number };
  /** Fired when the leverage analysis section becomes visible. */
  leverage_analysis_viewed: {
    dealRoomId: string;
    propertyId: string;
    score: number;
  };
  /** Fired when the cost breakdown section becomes visible. */
  cost_breakdown_viewed: {
    dealRoomId: string;
    propertyId: string;
    totalMonthlyMid: number;
  };
  /** Fired when the comps section is expanded. */
  comps_expanded: { dealRoomId: string; compCount: number };
  /** Fired when an AI engine output is surfaced to the buyer. */
  ai_analysis_viewed: {
    dealRoomId: string;
    engineType:
      | "pricing"
      | "comps"
      | "leverage"
      | "cost"
      | "offer"
      | "case_synthesis";
    confidence: number;
  };

  // ─── List price review (KIN-1089) ───────────────────────────────────
  /** Fired when the List Price Review card first mounts with non-null data. */
  list_price_review_viewed: {
    assessment: "at_market" | "under_market" | "over_market" | "insufficient";
  };
  /** Fired when the assessment chip first renders after data load. */
  list_price_review_assessment_rendered: {
    assessment: "at_market" | "under_market" | "over_market" | "insufficient";
    referencesAvailable: number;
    signalsAgreed: number;
  };
  /** Fired when a buyer opens a reference tile's provenance tooltip. */
  list_price_review_reference_tooltip_opened: {
    referenceKey:
      | "suggested_list_price"
      | "avm_estimate"
      | "comp_median"
      | "market_velocity_dom";
  };

  // ─── Document events ────────────────────────────────────────────────
  /** Fired when a document upload completes. */
  document_uploaded: {
    documentId: string;
    fileType: string;
    sizeBytes: number;
    source: "buyer" | "broker";
  };
  /** Fired when a document download is initiated. */
  document_downloaded: { documentId: string; fileType: string };
  /** Fired when a document parser completes successfully. */
  document_parsed: { documentId: string; parser: string; durationMs: number };
  /** Fired when a document parser throws. */
  document_parse_failed: {
    documentId: string;
    parser: string;
    error: string;
  };

  // ─── Tour flow ──────────────────────────────────────────────────────
  /** Fired when a tour is canceled by either side. */
  tour_canceled: {
    tourId: string;
    reason: string;
    side: "buyer" | "agent" | "system";
  };
  /** Fired when a tour no-show is recorded. */
  tour_no_show: { tourId: string; side: "buyer" | "agent" };

  // ─── Offer flow ─────────────────────────────────────────────────────
  /** Fired when the offer creation flow is opened. */
  offer_started: { dealRoomId: string; propertyId: string };
  /** Fired when a buyer selects a specific offer scenario. */
  offer_scenario_selected: {
    dealRoomId: string;
    scenarioIndex: number;
    offerPrice: number;
  };
  /** Fired when a seller counter lands. */
  offer_countered: { offerId: string; counterPrice: number };
  /** Fired on offer rejection. */
  offer_rejected: { offerId: string; reason: string };
  /** Fired when a buyer withdraws their offer. */
  offer_withdrawn: { offerId: string; reason: string };

  // ─── Closing flow ───────────────────────────────────────────────────
  /** Fired when a contract is amended post-signature. */
  contract_amended: { contractId: string; amendmentType: string };
  /** Fired when a closing milestone is completed. */
  milestone_completed: { contractId: string; milestoneName: string };

  // ─── Communication flow ─────────────────────────────────────────────
  /** Fired when a fanout attempt is accepted for outbound delivery. */
  message_sent: {
    channel: NotificationChannel;
    templateKey: string;
    category?: NotificationCategory;
    provider?: NotificationProviderName;
    recipientHash?: string;
  };
  /** Fired when delivery is confirmed by the channel provider. */
  message_delivered: {
    messageId: string;
    channel: ExternalNotificationChannel;
    category?: NotificationCategory;
    provider?: NotificationProviderName;
    recipientHash?: string;
  };
  /** Fired when a recipient opens a message (email/push). */
  message_opened: {
    messageId: string;
    channel: ExternalNotificationChannel;
    category?: NotificationCategory;
    provider?: NotificationProviderName;
    recipientHash?: string;
  };
  /** Fired when a recipient clicks a link in a message. */
  message_clicked: {
    messageId: string;
    channel: ExternalNotificationChannel;
    link: string;
    category?: NotificationCategory;
    provider?: NotificationProviderName;
    recipientHash?: string;
  };
  /** Fired when the Twilio inbound webhook accepts a new SMS payload. */
  sms_inbound_received: { messageId: string; recipientHash: string };
  /** Fired when an inbound SMS listing URL parses to a supported portal. */
  sms_inbound_parsed: {
    messageId: string;
    recipientHash: string;
    portal: "zillow" | "redfin" | "realtor";
  };
  /** Fired when an inbound SMS creates a new deal room. */
  sms_inbound_dealroom_created: {
    messageId: string;
    recipientHash: string;
    dealRoomId: string;
  };
  /** Fired when an inbound SMS contains an unsupported portal URL. */
  sms_inbound_unsupported_url: {
    messageId: string;
    recipientHash: string;
    portal?: string;
  };
  /** Fired when an inbound SMS comes from an unverified sender. */
  sms_inbound_unverified_sender: { messageId: string; recipientHash: string };
  /** Fired when an inbound SMS resolves to an existing deal room. */
  sms_inbound_duplicate: {
    messageId: string;
    recipientHash: string;
    dealRoomId: string;
  };
  /** Fired when a delivery attempt hard-fails before delivery. */
  message_failed: {
    channel: ExternalNotificationChannel;
    errorKind: string;
    category?: NotificationCategory;
    provider?: NotificationProviderName;
    recipientHash?: string;
  };
  /** Fired when a provider reports a bounce or equivalent delivery failure. */
  message_bounced: {
    channel: ExternalNotificationChannel;
    bounceType: string;
    category?: NotificationCategory;
    provider?: NotificationProviderName;
    recipientHash?: string;
  };
  /** Fired when delivery is blocked by suppression or provider suppression. */
  message_suppressed: {
    channel: ExternalNotificationChannel;
    reason: string;
    category?: NotificationCategory;
    provider?: NotificationProviderName;
    recipientHash?: string;
  };
  /** Fired when a buyer changes a notification preference successfully. */
  notification_preference_changed: {
    category:
      | "transactional"
      | "tours"
      | "offers"
      | "closing"
      | "disclosures"
      | "market_updates"
      | "marketing"
      | "safety";
    channel: "email" | "sms" | "push" | "in_app";
    direction: "on" | "off";
    source:
      | "preference_center"
      | "one_click_unsubscribe"
      | "email_footer"
      | "sms_stop";
  };
  /** Fired when the email footer's manage-notifications link lands on profile. */
  notification_manage_link_clicked: {
    source: "email_footer";
  };
  /** Fired when the notification fanout worker begins a sweep. */
  notification_delivery_fanout_started: {
    batchSize: number;
    candidateCount: number;
    pendingCount: number;
    failedCount: number;
    backpressureActive: boolean;
  };
  /** Fired when the fanout worker applies backpressure shedding. */
  notification_delivery_backpressure_applied: {
    candidateCount: number;
    selectedCount: number;
    shedCount: number;
    threshold: number;
    lowestSelectedUrgency: NotificationUrgency;
  };
  /** Fired when lower-priority notifications are shed under load. */
  notification_fanout_backpressure: {
    shedCategory: "digest_only" | "relationship";
    shedCount: number;
    pendingCount: number;
  };
  /** Fired when an outbound delivery attempt is recorded. */
  notification_delivery_attempt_recorded: {
    eventType: string;
    category: NotificationCategory;
    urgency: NotificationUrgency;
    channel: ExternalNotificationChannel;
    provider: NotificationProviderName;
    attemptNumber: number;
    outcome: "queued" | "dispatched" | "delivered" | "failed" | "skipped";
  };
  /** Fired when the durable delivery state changes on a buyer update event. */
  notification_delivery_state_changed: {
    eventType: string;
    from: NotificationDeliveryState;
    to: NotificationDeliveryState;
    reason:
      | "preference_disabled"
      | "suppressed"
      | "quiet_hours"
      | "backpressure_shed"
      | "provider_accepted"
      | "provider_delivered"
      | "provider_failed"
      | "duplicate"
      | "other";
  };
  /** Fired when a provider webhook receipt is ingested and deduped. */
  notification_webhook_receipt_recorded: {
    provider: NotificationProviderName;
    transition: WebhookTransition;
    duplicate: boolean;
    signatureVerified: boolean;
    linkedEvent: boolean;
    linkedAttempt: boolean;
    suppressionApplied: boolean;
  };
  /** Fired when the first-account welcome email is durably queued. */
  welcome_email_sent: { userId: string; templateKey: string };

  // ─── Disclosure request rail (KIN-1079) ─────────────────────────────
  /** Fired once when the Request Disclosures CTA card mounts. */
  disclosure_request_card_viewed: { dealRoomId: string };
  /** Fired when the buyer opens the preview-the-email dialog. */
  disclosure_request_preview_opened: { dealRoomId: string };
  /** Fired when the buyer successfully sends a disclosure request. */
  disclosure_request_sent: { dealRoomId: string; hasPersonalNote: boolean };
  /** Fired when a listing-agent reply is ingested for the request. */
  disclosure_request_reply_received: {
    dealRoomId: string;
    ingestedAttachmentCount: number;
  };
  /** Fired when the follow-up sweep schedules another nudge. */
  disclosure_request_follow_up_scheduled: {
    dealRoomId: string;
    followUpCount: number;
  };

  // ─── Agent ops ──────────────────────────────────────────────────────
  /** Fired when a new agent coverage record is created. */
  agent_coverage_created: { agentId: string; areaCount: number };
  /** Fired when a tour assignment is created (any routing path). */
  agent_assigned: {
    assignmentId: string;
    tourId: string;
    routingPath: "network" | "showami" | "manual";
  };
  /** Fired when a new payout obligation is created. */
  payout_created: { payoutId: string; amount: number };
  /** Fired when a payout is approved by broker. */
  payout_approved: { payoutId: string };
  /** Fired when a payout is marked paid. */
  payout_paid: { payoutId: string; batchMonth: string };

  // ─── Engagement events (public site tools) ──────────────────────────
  /** Fired when a buyer uses an interactive calculator on the marketing site. */
  calculator_used: {
    calculator:
      | "affordability"
      | "cost"
      | "pricing"
      | "home_rebate_slider";
    durationMs?: number;
  };
  /** Fired when the pricing FAQ is opened. */
  pricing_faq_viewed: { source: string };

  // ─── FAQ page (KIN-1085) ────────────────────────────────────────────
  /** FAQ page viewed (mount). */
  faq_page_viewed: Record<string, never>;
  /** Jump nav pill clicked. */
  faq_theme_jump_clicked: { theme: FAQTheme };
  /** Accordion question opened. */
  faq_question_opened: {
    questionId: string;
    theme: FAQTheme;
    source: "direct" | "jump_nav" | "deep_link";
  };
  /** Copy-link button clicked on a question. */
  faq_question_link_copied: { questionId: string; theme: FAQTheme };
  /** Dwell time on an opened question, reported on close or unmount. */
  faq_question_dwell_ms: {
    questionId: string;
    theme: FAQTheme;
    dwellMs: number;
  };
  /** Fired when a buyer opens 2+ questions inside the same theme. */
  faq_theme_engaged: { theme: FAQTheme; questionCount: number };
  /** "Still have questions?" contact CTA clicked. */
  faq_contact_cta_clicked: Record<string, never>;
  /** Page mounted with a hash that matches a public question slug. */
  faq_deep_link_landed: { questionId: string; theme: FAQTheme };
  /** Teaser section on /pricing or /how-it-works clicked through to /faq. */
  faq_teaser_clicked: {
    source: "pricing_page" | "how_it_works_page" | "direct" | "deep_link";
  };
  /** Fired when the homepage "How it works" section becomes visible. */
  home_how_it_works_section_viewed: Record<string, never>;
  /** Fired when a buyer hovers or focuses a homepage HIW step card. */
  home_how_it_works_step_interacted: {
    stepNumber: number;
    stepId: "analyze" | "tour" | "offer" | "close";
    kind: "hover" | "focus";
  };
  /** Fired when the homepage HIW CTA below the four steps is clicked. */
  home_how_it_works_cta_clicked: Record<string, never>;
  /** Fired when the homepage "How we compare" section becomes visible. */
  home_comparison_section_viewed: Record<string, never>;
  /** Fired when a buyer hovers (desktop) or taps (mobile) a comparison row. */
  home_comparison_row_interacted: {
    rowKey: string;
    surface: "desktop" | "mobile";
  };
  /** Fired when the "See the full pricing math" CTA in the comparison section is clicked. */
  home_comparison_pricing_cta_clicked: Record<string, never>;
  /** Fired when the "Paste a Zillow, Redfin, or Realtor link" CTA in the comparison section is clicked. */
  home_comparison_intake_cta_clicked: Record<string, never>;
  /** Fired when the homepage rebate slider section crosses 40% visible. */
  home_rebate_slider_viewed: Record<string, never>;
  /** Fired when the slider value is committed after the debounce window. */
  home_rebate_slider_changed: {
    price: number;
    rebate: number;
    rebateBand: "zero" | "under-5k" | "5k-10k" | "10k-20k" | "over-20k";
  };
  /** Fired when the slider thumb snaps to a magnetic snap point. */
  home_rebate_slider_snap_reached: { snapPoint: number };
  /** Fired when a new aspiration band renders for the current rebate. */
  home_rebate_aspiration_viewed: {
    rebateBand: "zero" | "under-5k" | "5k-10k" | "10k-20k" | "over-20k";
  };
  /** Fired when the disclosure footer enters the viewport. */
  home_rebate_disclosure_viewed: Record<string, never>;
  /** Fired when the rebate slider "Paste a property link" CTA is clicked. */
  home_rebate_cta_clicked: Record<string, never>;
  /** Fired when the homepage loads with a `?price=` deep link hitting the slider. */
  home_rebate_slider_deep_link_landed: { price: number };
  /** Fired when the slider loses focus, reporting the session's max drag distance. */
  home_rebate_slider_interaction_depth: { maxDistanceDollars: number };
  /** Fired when the static fallback table renders instead of the interactive slider. */
  home_rebate_slider_fallback_shown: {
    reason: "flag_off" | "js_disabled";
  };

  // ─── FL availability strip (KIN-1088) ───────────────────────────────
  /** Strip enters viewport for the first time (IntersectionObserver). */
  fl_strip_viewed: { route: string };
  /** Buyer clicks the strip CTA to open the waitlist dialog. */
  fl_strip_cta_clicked: { route: string };
  /** Buyer dismisses the strip via the close button. */
  fl_strip_dismissed: { route: string };
  /** Waitlist dialog has opened (any entry path). */
  waitlist_dialog_opened: { source: "strip" | "deep_link"; route: string };
  /** Waitlist mutation succeeded. PII-safe — never send raw email or zip. */
  waitlist_submitted: {
    route: string;
    surface: "desktop" | "mobile";
    /** 2-letter US state code — not PII. */
    stateCode: string;
    /** Boolean flag only — never the raw value. */
    zipPresent: boolean;
  };
  /** Waitlist mutation failed. `errorKind` matches the mutation's `reason` union. */
  waitlist_submit_error: {
    route: string;
    errorKind:
      | "honeypot"
      | "rate_limited"
      | "invalid_email"
      | "invalid_state"
      | "invalid_zip"
      | "network";
  };
  /** Fired when the public contact form submits successfully. */
  contact_form_submitted: {
    sourcePath: string;
    listingLinkPresent: boolean;
    messageLengthBucket: "short" | "medium" | "long" | "very_long";
  };

  // ─── My Journeys (KIN-1082) ─────────────────────────────────────────
  /** Fired when the /dashboard/journeys index page mounts. */
  journeys_index_viewed: { view: "active" | "archived"; count: number };
  /** Fired when a journey card is opened from the journeys list. */
  journey_card_opened: { dealRoomId: string; propertyId: string };
  /** Fired when the "Continue" CTA on a journey card is clicked. */
  journey_continue_clicked: {
    dealRoomId: string;
    propertyId: string;
    nextActionLabel: string;
  };
  /** Fired when the buyer triggers the archive action on a journey. */
  journey_archive_clicked: { dealRoomId: string };
  /** Fired when the buyer hits "Undo" on the archive toast. */
  journey_archive_undo_clicked: { dealRoomId: string };
  /** Fired when archive commits after the undo window elapses. */
  journey_archive_committed: { dealRoomId: string };
  /** Fired when a previously archived journey is restored. */
  journey_restored: { dealRoomId: string };
  /** Fired when the buyer changes the journey list filter. */
  journey_filter_changed: { filter: string };
  /** Fired when the buyer changes the journey list sort. */
  journey_sort_changed: { sort: string };
  /** Fired when the buyer changes a journey priority. */
  journey_priority_changed: {
    dealRoomId: string;
    priority: "high" | "normal" | "low";
  };
  /** Fired when a buyer saves a custom label on a journey. */
  journey_label_saved: { dealRoomId: string };
  /** Fired when the buyer types in the journeys search input. */
  journey_search_used: { queryLength: number };
  /** Fired when the journeys page mounts with filter query params set. */
  journey_deep_link_opened_with_filters: { filters: string };
  /** Fired when a stale-activity warning appears on a journey card. */
  journey_stale_warning_shown: { dealRoomId: string };
  /** Fired when the buyer acts on a stale-activity warning. */
  journey_stale_warning_action: { dealRoomId: string; action: string };
  /** Fired when a buyer resumes a journey from the dashboard home teaser. */
  journey_resume_from_home_teaser: {
    dealRoomId: string;
    propertyId: string;
  };
  /** Fired when the empty-state CTA on the journey list is clicked. */
  journey_list_empty_cta_clicked: { cta: string };

  // ─── Buyer stories (KIN-1087) ──────────────────────────────────────
  /** Fired when a story card first enters the viewport. */
  testimonial_card_viewed: { storyId: string; source: "home" | "pricing" };
  /** Fired when a story card is clicked (navigates to /stories/[slug]). */
  testimonial_card_clicked: { storyId: string; source: "home" | "pricing" };
  /** Fired when /stories/[slug] detail page mounts. */
  story_page_viewed: { storyId: string };
  /** Fired on page unload; reports how long the buyer spent on the story. */
  story_read_time_ms: { storyId: string; timeMs: number };
  /** Fired when the sticky bottom "Start your story" CTA is clicked. */
  story_cta_clicked: { storyId: string };
  /** Fired when a related-story card in the carousel is clicked. */
  story_related_clicked: {
    sourceStoryId: string;
    destinationStoryId: string;
  };
  /** Fired when the homepage aggregate savings counter first enters the viewport. */
  aggregate_savings_counter_viewed: {
    totalSavedUsd: number;
    storyCount: number;
  };

  // ─── Marketing guides (KIN-1090) ────────────────────────────────────
  /** Fired when a `/guides/<slug>` page first mounts. */
  guide_page_viewed: { guideSlug: string; guideCategory: string };
  /** Fired when a buyer clicks the footer CTA on a guide page. */
  guide_cta_clicked: { guideSlug: string };
  /** Fired when the `/our-process` page first mounts. */
  our_process_page_viewed: Record<string, never>;

  // ─── System events ──────────────────────────────────────────────────
  /**
   * Fired when a React error boundary catches an error.
   * `location` is optional so existing call sites that only pass
   * `{ error, url }` continue to type-check — call sites are encouraged
   * to add a component/route string over time.
   */
  error_boundary_hit: { error: string; location?: string; url?: string };
  /** Fired when a /api/health probe fails on the server. */
  health_check_failed: { check: string; status: number };
  /** Fired when a Python worker job surfaces a permanent failure. */
  worker_job_failed: { jobId: string; jobType: string; error: string };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

/** Back-compat alias for the previous string-union export. */
export type AnalyticsEvent = AnalyticsEventName;

// ─── Event metadata for governance ────────────────────────────────────

export type EventCategory =
  | "funnel"
  | "deal_room"
  | "documents"
  | "tour"
  | "offer"
  | "closing"
  | "communication"
  | "agent_ops"
  | "engagement"
  | "journeys"
  | "system";

export interface EventMetadata {
  category: EventCategory;
  /** Business owner or guild responsible for this event. */
  owner: string;
  /** Natural-language description of when this event is fired. */
  whenFired: string;
  /** Whether this event is guaranteed PII-safe without stripping. */
  piiSafe: boolean;
}

export const EVENT_METADATA: Record<AnalyticsEventName, EventMetadata> = {
  link_pasted: {
    category: "funnel",
    owner: "growth",
    whenFired: "Paste input submit on marketing pages",
    piiSafe: true,
  },
  teaser_viewed: {
    category: "funnel",
    owner: "growth",
    whenFired: "Teaser page mount",
    piiSafe: true,
  },
  registration_started: {
    category: "funnel",
    owner: "growth",
    whenFired: "Registration modal opens",
    piiSafe: true,
  },
  registration_completed: {
    category: "funnel",
    owner: "growth",
    whenFired: "Successful registration",
    piiSafe: true,
  },

  deal_room_entered: {
    category: "deal_room",
    owner: "dashboard",
    whenFired: "Deal room page mount after auth",
    piiSafe: true,
  },
  deal_room_exited: {
    category: "deal_room",
    owner: "dashboard",
    whenFired: "Deal room page unmount",
    piiSafe: true,
  },
  pricing_panel_viewed: {
    category: "deal_room",
    owner: "ai",
    whenFired: "Pricing panel first paint with real result",
    piiSafe: true,
  },
  leverage_analysis_viewed: {
    category: "deal_room",
    owner: "ai",
    whenFired: "Leverage section scrolled into view",
    piiSafe: true,
  },
  cost_breakdown_viewed: {
    category: "deal_room",
    owner: "ai",
    whenFired: "Cost breakdown section scrolled into view",
    piiSafe: true,
  },
  comps_expanded: {
    category: "deal_room",
    owner: "ai",
    whenFired: "Comps collapsible toggled open",
    piiSafe: true,
  },
  ai_analysis_viewed: {
    category: "deal_room",
    owner: "ai",
    whenFired: "Any AI engine output first rendered",
    piiSafe: true,
  },
  list_price_review_viewed: {
    category: "deal_room",
    owner: "ai",
    whenFired: "List Price Review card first mounts with non-null data",
    piiSafe: true,
  },
  list_price_review_assessment_rendered: {
    category: "deal_room",
    owner: "ai",
    whenFired: "Assessment chip first renders after data load",
    piiSafe: true,
  },
  list_price_review_reference_tooltip_opened: {
    category: "deal_room",
    owner: "ai",
    whenFired: "User opens a reference tile's provenance tooltip",
    piiSafe: true,
  },

  document_uploaded: {
    category: "documents",
    owner: "ops",
    whenFired: "Upload completes (Convex file id returned)",
    piiSafe: true,
  },
  document_downloaded: {
    category: "documents",
    owner: "ops",
    whenFired: "Download link clicked",
    piiSafe: true,
  },
  document_parsed: {
    category: "documents",
    owner: "ops",
    whenFired: "Parser finishes successfully",
    piiSafe: true,
  },
  document_parse_failed: {
    category: "documents",
    owner: "ops",
    whenFired: "Parser throws or returns validation errors",
    // Free-form error strings may leak PII — let stripPii run defensively.
    piiSafe: false,
  },

  tour_requested: {
    category: "tour",
    owner: "brokerage",
    whenFired: "Buyer submits tour request form",
    piiSafe: true,
  },
  tour_confirmed: {
    category: "tour",
    owner: "brokerage",
    whenFired: "Agent confirms tour slot",
    piiSafe: true,
  },
  tour_completed: {
    category: "tour",
    owner: "brokerage",
    whenFired: "Tour marked completed by agent or buyer",
    piiSafe: true,
  },
  tour_canceled: {
    category: "tour",
    owner: "brokerage",
    whenFired: "Either side cancels before start",
    piiSafe: true,
  },
  tour_no_show: {
    category: "tour",
    owner: "brokerage",
    whenFired: "No-show recorded post-window",
    piiSafe: true,
  },

  offer_started: {
    category: "offer",
    owner: "brokerage",
    whenFired: "Offer creation modal or page opened",
    piiSafe: true,
  },
  offer_scenario_selected: {
    category: "offer",
    owner: "brokerage",
    whenFired: "Buyer picks a scenario from the offer engine output",
    piiSafe: true,
  },
  offer_submitted: {
    category: "offer",
    owner: "brokerage",
    whenFired: "Offer mutation succeeds",
    piiSafe: true,
  },
  offer_countered: {
    category: "offer",
    owner: "brokerage",
    whenFired: "Counter-offer received from seller side",
    piiSafe: true,
  },
  offer_accepted: {
    category: "offer",
    owner: "brokerage",
    whenFired: "Offer marked accepted",
    piiSafe: true,
  },
  offer_rejected: {
    category: "offer",
    owner: "brokerage",
    whenFired: "Offer marked rejected",
    // Free-form reason strings may leak PII.
    piiSafe: false,
  },
  offer_withdrawn: {
    category: "offer",
    owner: "brokerage",
    whenFired: "Buyer withdraws before acceptance",
    // Free-form reason strings may leak PII.
    piiSafe: false,
  },

  contract_signed: {
    category: "closing",
    owner: "brokerage",
    whenFired: "Contract fully executed by all parties",
    piiSafe: true,
  },
  contract_amended: {
    category: "closing",
    owner: "brokerage",
    whenFired: "Contract amendment signed",
    piiSafe: true,
  },
  milestone_completed: {
    category: "closing",
    owner: "brokerage",
    whenFired: "Closing milestone checkbox ticks completed",
    piiSafe: true,
  },
  deal_closed: {
    category: "closing",
    owner: "brokerage",
    whenFired: "Deal reaches terminal closed state",
    piiSafe: true,
  },

  message_sent: {
    category: "communication",
    owner: "platform",
    whenFired: "Outbound message queued",
    piiSafe: true,
  },
  message_delivered: {
    category: "communication",
    owner: "platform",
    whenFired: "Delivery webhook received",
    piiSafe: true,
  },
  message_opened: {
    category: "communication",
    owner: "platform",
    whenFired: "Open pixel or push receipt",
    piiSafe: true,
  },
  message_clicked: {
    category: "communication",
    owner: "platform",
    whenFired: "Link click tracked via redirect",
    piiSafe: true,
  },
  sms_inbound_received: {
    category: "communication",
    owner: "platform",
    whenFired: "Twilio inbound webhook accepts a new SMS payload",
    piiSafe: true,
  },
  sms_inbound_parsed: {
    category: "communication",
    owner: "platform",
    whenFired: "Inbound SMS listing URL parses to a supported portal",
    piiSafe: true,
  },
  sms_inbound_dealroom_created: {
    category: "communication",
    owner: "platform",
    whenFired: "Inbound SMS creates a new deal room",
    piiSafe: true,
  },
  sms_inbound_unsupported_url: {
    category: "communication",
    owner: "platform",
    whenFired: "Inbound SMS contains an unsupported portal URL",
    piiSafe: true,
  },
  sms_inbound_unverified_sender: {
    category: "communication",
    owner: "platform",
    whenFired: "Inbound SMS comes from an unverified sender",
    piiSafe: true,
  },
  sms_inbound_duplicate: {
    category: "communication",
    owner: "platform",
    whenFired: "Inbound SMS resolves to an existing deal room",
    piiSafe: true,
  },
  message_failed: {
    category: "communication",
    owner: "platform",
    whenFired: "Outbound notification attempt fails before delivery",
    piiSafe: true,
  },
  message_bounced: {
    category: "communication",
    owner: "platform",
    whenFired: "Provider reports a bounce or undeliverable recipient",
    piiSafe: true,
  },
  message_suppressed: {
    category: "communication",
    owner: "platform",
    whenFired: "Delivery is skipped because the recipient is suppressed",
    piiSafe: true,
  },
  notification_preference_changed: {
    category: "communication",
    owner: "platform",
    whenFired: "A notification preference mutation succeeds",
    piiSafe: true,
  },
  notification_manage_link_clicked: {
    category: "communication",
    owner: "platform",
    whenFired: "Profile notifications opens from an email footer link",
    piiSafe: true,
  },
  notification_delivery_fanout_started: {
    category: "communication",
    owner: "platform",
    whenFired: "Notification fanout worker starts a sweep",
    piiSafe: true,
  },
  notification_delivery_backpressure_applied: {
    category: "communication",
    owner: "platform",
    whenFired: "Fanout worker sheds lower-priority events under load",
    piiSafe: true,
  },
  notification_fanout_backpressure: {
    category: "communication",
    owner: "platform",
    whenFired: "Fanout backpressure sheds relationship or digest-only events",
    piiSafe: true,
  },
  notification_delivery_attempt_recorded: {
    category: "communication",
    owner: "platform",
    whenFired: "Outbound notification attempt recorded in the delivery ledger",
    piiSafe: true,
  },
  notification_delivery_state_changed: {
    category: "communication",
    owner: "platform",
    whenFired: "Buyer update event delivery state changes",
    piiSafe: true,
  },
  notification_webhook_receipt_recorded: {
    category: "communication",
    owner: "platform",
    whenFired: "Provider webhook receipt is ingested and deduped",
    piiSafe: true,
  },

  disclosure_request_card_viewed: {
    category: "communication",
    owner: "platform",
    whenFired: "Request Disclosures card first mounts in a deal room",
    piiSafe: true,
  },
  disclosure_request_preview_opened: {
    category: "communication",
    owner: "platform",
    whenFired: "Buyer opens the preview-the-email dialog",
    piiSafe: true,
  },
  disclosure_request_sent: {
    category: "communication",
    owner: "platform",
    whenFired: "Disclosure request mutation succeeds",
    piiSafe: true,
  },
  disclosure_request_reply_received: {
    category: "communication",
    owner: "platform",
    whenFired: "Listing-agent reply ingested by the mail rail",
    piiSafe: true,
  },
  disclosure_request_follow_up_scheduled: {
    category: "communication",
    owner: "platform",
    whenFired: "Follow-up sweep flips a sent request to follow_up_needed",
    piiSafe: true,
  },
  welcome_email_sent: {
    category: "communication",
    owner: "platform",
    whenFired: "Welcome email queue marker is persisted for a new buyer account",
    piiSafe: true,
  },

  agent_coverage_created: {
    category: "agent_ops",
    owner: "brokerage",
    whenFired: "New coverage record written",
    piiSafe: true,
  },
  agent_assigned: {
    category: "agent_ops",
    owner: "brokerage",
    whenFired: "Tour assignment created (any path)",
    piiSafe: true,
  },
  payout_created: {
    category: "agent_ops",
    owner: "brokerage",
    whenFired: "Showing payout obligation created",
    piiSafe: true,
  },
  payout_approved: {
    category: "agent_ops",
    owner: "brokerage",
    whenFired: "Broker approves payout",
    piiSafe: true,
  },
  payout_paid: {
    category: "agent_ops",
    owner: "brokerage",
    whenFired: "Payout marked paid in monthly batch",
    piiSafe: true,
  },

  calculator_used: {
    category: "engagement",
    owner: "growth",
    whenFired: "Calculator interacted with (submit or slider release)",
    piiSafe: true,
  },
  pricing_faq_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "FAQ item expanded",
    piiSafe: true,
  },
  faq_page_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "/faq page mount",
    piiSafe: true,
  },
  faq_theme_jump_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "Jump-nav pill on /faq clicked",
    piiSafe: true,
  },
  faq_question_opened: {
    category: "engagement",
    owner: "growth",
    whenFired: "Accordion question on /faq expanded",
    piiSafe: true,
  },
  faq_question_link_copied: {
    category: "engagement",
    owner: "growth",
    whenFired: "Copy-link icon on a /faq question clicked",
    piiSafe: true,
  },
  faq_question_dwell_ms: {
    category: "engagement",
    owner: "growth",
    whenFired: "Question on /faq closed or unmounted while open",
    piiSafe: true,
  },
  faq_theme_engaged: {
    category: "engagement",
    owner: "growth",
    whenFired: "Two or more questions opened within the same /faq theme",
    piiSafe: true,
  },
  faq_contact_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "/faq Still-have-questions contact CTA clicked",
    piiSafe: true,
  },
  faq_deep_link_landed: {
    category: "engagement",
    owner: "growth",
    whenFired: "/faq mount with a hash matching a public question slug",
    piiSafe: true,
  },
  faq_teaser_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "FAQ teaser on /pricing or /how-it-works clicked through to /faq",
    piiSafe: true,
  },
  home_how_it_works_section_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "IntersectionObserver on #how-it-works crosses 40% visible",
    piiSafe: true,
  },
  home_how_it_works_step_interacted: {
    category: "engagement",
    owner: "growth",
    whenFired: "Hover or keyboard focus on a step card",
    piiSafe: true,
  },
  home_how_it_works_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "CTA button below the 4 steps clicked",
    piiSafe: true,
  },
  home_comparison_section_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "IntersectionObserver on #how-we-compare crosses 40% visible",
    piiSafe: true,
  },
  home_comparison_row_interacted: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "Row hover on desktop or tap on mobile within the home comparison table",
    piiSafe: true,
  },
  home_comparison_pricing_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "\"See the full pricing math\" CTA clicked in the home comparison section",
    piiSafe: true,
  },
  home_comparison_intake_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "\"Paste a Zillow, Redfin, or Realtor link\" CTA clicked in the home comparison section",
    piiSafe: true,
  },
  fl_strip_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "FL availability strip enters the viewport for the first time on a marketing route",
    piiSafe: true,
  },
  fl_strip_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "FL availability strip CTA clicked to open the waitlist dialog",
    piiSafe: true,
  },
  fl_strip_dismissed: {
    category: "engagement",
    owner: "growth",
    whenFired: "FL availability strip closed via the dismiss control",
    piiSafe: true,
  },
  waitlist_dialog_opened: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "Non-FL waitlist dialog opened from the strip CTA or a deep link",
    piiSafe: true,
  },
  waitlist_submitted: {
    category: "engagement",
    owner: "growth",
    whenFired: "waitlistSignups.upsert mutation returns ok: true",
    // Only the 2-letter state code and a boolean flag are sent — no raw
    // email or zip — so the event is safe to emit without scrubbing.
    piiSafe: true,
  },
  waitlist_submit_error: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "waitlistSignups.upsert mutation returns ok: false, or the network call fails",
    piiSafe: true,
  },
  contact_form_submitted: {
    category: "engagement",
    owner: "growth",
    whenFired: "Contact form mutation returns ok: true",
    piiSafe: true,
  },
  home_rebate_slider_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "IntersectionObserver on #rebate-slider crosses 40% visible",
    piiSafe: true,
  },
  home_rebate_slider_changed: {
    category: "engagement",
    owner: "growth",
    whenFired: "Slider value committed after 250ms debounce window",
    piiSafe: true,
  },
  home_rebate_slider_snap_reached: {
    category: "engagement",
    owner: "growth",
    whenFired: "Slider thumb snapped to a magnetic snap point",
    piiSafe: true,
  },
  home_rebate_aspiration_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "Aspiration band copy rendered for a new rebate band",
    piiSafe: true,
  },
  home_rebate_disclosure_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "Disclosure footer entered viewport",
    piiSafe: true,
  },
  home_rebate_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "Paste a property link CTA clicked in the rebate slider section",
    piiSafe: true,
  },
  home_rebate_slider_deep_link_landed: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "Page loaded with ?price= query param targeting the rebate slider",
    piiSafe: true,
  },
  home_rebate_slider_interaction_depth: {
    category: "engagement",
    owner: "growth",
    whenFired: "Final drag distance reported when slider loses focus",
    piiSafe: true,
  },
  home_rebate_slider_fallback_shown: {
    category: "engagement",
    owner: "growth",
    whenFired:
      "Static fallback table rendered instead of the interactive slider",
    piiSafe: true,
  },

  journeys_index_viewed: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "/dashboard/journeys page mount",
    piiSafe: true,
  },
  journey_card_opened: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Buyer opens a journey card from the list",
    piiSafe: true,
  },
  journey_continue_clicked: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Continue CTA on a journey card is clicked",
    piiSafe: true,
  },
  journey_archive_clicked: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Archive action triggered on a journey",
    piiSafe: true,
  },
  journey_archive_undo_clicked: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Undo on the archive toast before commit",
    piiSafe: true,
  },
  journey_archive_committed: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Archive persists after the undo window elapses",
    piiSafe: true,
  },
  journey_restored: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Archived journey restored to active",
    piiSafe: true,
  },
  journey_filter_changed: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Buyer changes the journeys list filter",
    piiSafe: true,
  },
  journey_sort_changed: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Buyer changes the journeys list sort",
    piiSafe: true,
  },
  journey_priority_changed: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Journey priority updated by the buyer",
    piiSafe: true,
  },
  journey_label_saved: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Buyer saves a custom label on a journey",
    piiSafe: true,
  },
  journey_search_used: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Buyer types in the journeys search input",
    piiSafe: true,
  },
  journey_deep_link_opened_with_filters: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Journeys page mount with filter query params",
    piiSafe: true,
  },
  journey_stale_warning_shown: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Stale-activity warning surfaced on a journey card",
    piiSafe: true,
  },
  journey_stale_warning_action: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Buyer acts on a stale-activity warning",
    piiSafe: true,
  },
  journey_resume_from_home_teaser: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Buyer resumes a journey from the home dashboard teaser",
    piiSafe: true,
  },
  journey_list_empty_cta_clicked: {
    category: "journeys",
    owner: "dashboard",
    whenFired: "Empty-state CTA on the journeys list is clicked",
    piiSafe: true,
  },

  testimonial_card_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "Story card enters viewport (IntersectionObserver)",
    piiSafe: true,
  },
  testimonial_card_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "Story card clicked on homepage or pricing",
    piiSafe: true,
  },
  story_page_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "/stories/[slug] detail page mount",
    piiSafe: true,
  },
  story_read_time_ms: {
    category: "engagement",
    owner: "growth",
    whenFired: "Story detail page unmount or visibility-change",
    piiSafe: true,
  },
  story_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "Sticky 'Start your story' CTA on detail page clicked",
    piiSafe: true,
  },
  story_related_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "Related-story card in carousel clicked",
    piiSafe: true,
  },
  aggregate_savings_counter_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "Homepage aggregate savings counter enters viewport",
    piiSafe: true,
  },

  guide_page_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "Guide detail page mount",
    piiSafe: true,
  },
  guide_cta_clicked: {
    category: "engagement",
    owner: "growth",
    whenFired: "Guide footer CTA click",
    piiSafe: true,
  },
  our_process_page_viewed: {
    category: "engagement",
    owner: "growth",
    whenFired: "Our process page mount",
    piiSafe: true,
  },

  error_boundary_hit: {
    category: "system",
    owner: "platform",
    whenFired: "React error boundary catches error",
    // Error strings and URLs may carry free-form PII — strip defensively.
    piiSafe: false,
  },
  health_check_failed: {
    category: "system",
    owner: "platform",
    whenFired: "/api/health returns non-200",
    piiSafe: true,
  },
  worker_job_failed: {
    category: "system",
    owner: "platform",
    whenFired: "Python worker posts final failure",
    // Free-form error strings may leak PII.
    piiSafe: false,
  },
};

// ─── Typed track() API ────────────────────────────────────────────────

/**
 * Track an analytics event with typed properties. TypeScript enforces
 * that the properties shape matches the event's entry in AnalyticsEventMap.
 * PII stripping still runs on non-piiSafe events as a belt-and-suspenders
 * safety net — downstream dashboards should never see unexpected PII.
 */
export function track<K extends AnalyticsEventName>(
  event: K,
  properties: AnalyticsEventMap[K],
): void {
  const metadata = EVENT_METADATA[event];
  const context = resolveObservabilityContext({
    defaultService: "buyer-v2-web",
  });
  // For non-piiSafe events, run deep scrubbing that walks BOTH field
  // names AND string values. This catches PII that leaks into free-text
  // fields like error messages, reason strings, or parser output —
  // cases where field-name redaction alone can't see the risk.
  const safeProps =
    metadata && !metadata.piiSafe
      ? (deepScrubPii(
          properties as unknown as Record<string, unknown>,
        ) as AnalyticsEventMap[K])
      : properties;
  const payload = {
    ...safeProps,
    app_environment: context.environment,
    app_release: context.release,
    app_service: context.service,
    app_deployment: context.deployment,
  } satisfies Record<string, unknown>;

  if (typeof window !== "undefined" && posthog.__loaded) {
    posthog.capture(event, payload);
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[analytics] ${event}`, payload);
  }
}

/**
 * Track a funnel step with funnel name and position metadata. Adds
 * funnel_name and step_number to the event properties. These are
 * additional context fields that every funnel event can carry without
 * being redeclared in each event's properties type.
 */
export function trackFunnelStep<K extends AnalyticsEventName>(
  event: K,
  funnelName: string,
  stepNumber: number,
  properties: AnalyticsEventMap[K],
): void {
  track(event, {
    ...properties,
    funnel_name: funnelName,
    step_number: stepNumber,
  } as AnalyticsEventMap[K]);
}

/** Return all event names for a given category. Useful for catalog tooling. */
export function listEventsByCategory(
  category: EventCategory,
): AnalyticsEventName[] {
  return Object.entries(EVENT_METADATA)
    .filter(([, meta]) => meta.category === category)
    .map(([name]) => name as AnalyticsEventName);
}
