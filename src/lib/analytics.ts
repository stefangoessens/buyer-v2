import posthog from "posthog-js";
import type { LaunchEventMap } from "@buyer-v2/shared/launch-events";
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
  /** Fired when delivery is confirmed by the channel provider. */
  message_delivered: { messageId: string; channel: string };
  /** Fired when a recipient opens a message (email/push). */
  message_opened: { messageId: string; channel: string };
  /** Fired when a recipient clicks a link in a message. */
  message_clicked: { messageId: string; channel: string; link: string };

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
    calculator: "affordability" | "cost" | "pricing";
    durationMs?: number;
  };
  /** Fired when the pricing FAQ is opened. */
  pricing_faq_viewed: { source: string };
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
