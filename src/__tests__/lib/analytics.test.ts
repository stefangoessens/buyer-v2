import { describe, it, expect, vi, afterEach } from "vitest";
import {
  track,
  trackFunnelStep,
  listEventsByCategory,
  EVENT_METADATA,
  type AnalyticsEventMap,
} from "@/lib/analytics";

// ─── Helpers ──────────────────────────────────────────────────────────
// Every test wraps track() in expect(...).not.toThrow() because posthog-js
// is not loaded in the vitest environment — the typeof window guard +
// __loaded check should prevent any capture call from firing. We also
// exercise the typed property shapes so tsc enforces the catalog.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("track() — funnel category", () => {
  it("accepts link_pasted with url and source", () => {
    expect(() =>
      track("link_pasted", { url: "https://zillow.com/123", source: "hero" }),
    ).not.toThrow();
  });

  it("accepts teaser_viewed with optional fields", () => {
    expect(() =>
      track("teaser_viewed", { propertyId: "prop_1", source: "paste" }),
    ).not.toThrow();
  });

  it("accepts teaser_viewed with only propertyId", () => {
    expect(() => track("teaser_viewed", { propertyId: "prop_2" })).not.toThrow();
  });

  it("accepts registration_started with source", () => {
    expect(() =>
      track("registration_started", { source: "dealroom_gate" }),
    ).not.toThrow();
  });

  it("accepts registration_completed with userId", () => {
    expect(() =>
      track("registration_completed", {
        userId: "user_abc123",
        source: "teaser",
      }),
    ).not.toThrow();
  });
});

describe("track() — deal_room category", () => {
  it("accepts deal_room_entered with access level", () => {
    expect(() =>
      track("deal_room_entered", {
        dealRoomId: "dr_1",
        propertyId: "prop_1",
        accessLevel: "registered",
      }),
    ).not.toThrow();
  });

  it("accepts pricing_panel_viewed with confidence score", () => {
    expect(() =>
      track("pricing_panel_viewed", {
        dealRoomId: "dr_1",
        propertyId: "prop_1",
        overallConfidence: 0.82,
      }),
    ).not.toThrow();
  });

  it("accepts ai_analysis_viewed for every engine type", () => {
    const engines: Array<
      AnalyticsEventMap["ai_analysis_viewed"]["engineType"]
    > = ["pricing", "comps", "leverage", "cost", "offer", "case_synthesis"];
    for (const engineType of engines) {
      expect(() =>
        track("ai_analysis_viewed", {
          dealRoomId: "dr_1",
          engineType,
          confidence: 0.75,
        }),
      ).not.toThrow();
    }
  });
});

describe("track() — documents category", () => {
  it("accepts document_uploaded with source union", () => {
    expect(() =>
      track("document_uploaded", {
        documentId: "doc_1",
        fileType: "pdf",
        sizeBytes: 12345,
        source: "buyer",
      }),
    ).not.toThrow();
  });

  it("accepts document_parsed with duration", () => {
    expect(() =>
      track("document_parsed", {
        documentId: "doc_1",
        parser: "floridaContract",
        durationMs: 420,
      }),
    ).not.toThrow();
  });
});

describe("track() — tour category", () => {
  it("accepts tour_requested with window", () => {
    expect(() =>
      track("tour_requested", {
        dealRoomId: "dr_1",
        propertyId: "prop_1",
        requestedWindow: "2026-05-01T14:00:00Z",
      }),
    ).not.toThrow();
  });

  it("accepts tour_canceled with side union", () => {
    expect(() =>
      track("tour_canceled", {
        tourId: "tour_1",
        reason: "buyer conflict",
        side: "buyer",
      }),
    ).not.toThrow();
  });
});

describe("track() — offer category", () => {
  it("accepts offer_scenario_selected with index and price", () => {
    expect(() =>
      track("offer_scenario_selected", {
        dealRoomId: "dr_1",
        scenarioIndex: 1,
        offerPrice: 525000,
      }),
    ).not.toThrow();
  });

  it("accepts offer_submitted with typed properties", () => {
    expect(() =>
      track("offer_submitted", {
        offerId: "offer_1",
        dealRoomId: "dr_1",
        offerPrice: 525000,
      }),
    ).not.toThrow();
  });

  it("accepts offer_accepted with final price", () => {
    expect(() =>
      track("offer_accepted", {
        offerId: "offer_1",
        dealRoomId: "dr_1",
        finalPrice: 520000,
      }),
    ).not.toThrow();
  });
});

describe("track() — closing category", () => {
  it("accepts contract_signed", () => {
    expect(() =>
      track("contract_signed", {
        contractId: "k_1",
        dealRoomId: "dr_1",
      }),
    ).not.toThrow();
  });

  it("accepts deal_closed with closing date", () => {
    expect(() =>
      track("deal_closed", {
        dealRoomId: "dr_1",
        contractId: "k_1",
        closingDate: "2026-06-15",
      }),
    ).not.toThrow();
  });
});

describe("track() — communication category", () => {
  it("accepts message_sent with channel union", () => {
    const channels: Array<
      AnalyticsEventMap["message_sent"]["channel"]
    > = ["email", "sms", "push", "in_app"];
    for (const channel of channels) {
      expect(() =>
        track("message_sent", { channel, templateKey: "tour_confirmed" }),
      ).not.toThrow();
    }
  });

  it("accepts message_clicked with link", () => {
    expect(() =>
      track("message_clicked", {
        messageId: "msg_1",
        channel: "email",
        link: "https://example.com/deal/1",
      }),
    ).not.toThrow();
  });

  it("accepts notification_preference_changed with the new source union", () => {
    const sources: Array<
      AnalyticsEventMap["notification_preference_changed"]["source"]
    > = [
      "preference_center",
      "one_click_unsubscribe",
      "email_footer",
      "sms_stop",
    ];

    for (const source of sources) {
      expect(() =>
        track("notification_preference_changed", {
          category: "market_updates",
          channel: "in_app",
          direction: "off",
          source,
        }),
      ).not.toThrow();
    }
  });

  it("accepts notification_manage_link_clicked for email footer landings", () => {
    expect(() =>
      track("notification_manage_link_clicked", { source: "email_footer" }),
    ).not.toThrow();
  });
});

describe("track() — agent_ops category", () => {
  it("accepts agent_assigned with routing path union", () => {
    const paths: Array<
      AnalyticsEventMap["agent_assigned"]["routingPath"]
    > = ["network", "showami", "manual"];
    for (const routingPath of paths) {
      expect(() =>
        track("agent_assigned", {
          assignmentId: "assign_1",
          tourId: "tour_1",
          routingPath,
        }),
      ).not.toThrow();
    }
  });

  it("accepts payout_created with amount", () => {
    expect(() =>
      track("payout_created", { payoutId: "pay_1", amount: 250 }),
    ).not.toThrow();
  });
});

describe("track() — engagement category", () => {
  it("accepts calculator_used with calculator union", () => {
    const calculators: Array<
      AnalyticsEventMap["calculator_used"]["calculator"]
    > = ["affordability", "cost", "pricing"];
    for (const calculator of calculators) {
      expect(() =>
        track("calculator_used", { calculator, durationMs: 5000 }),
      ).not.toThrow();
    }
  });

  it("accepts pricing_faq_viewed with source", () => {
    expect(() =>
      track("pricing_faq_viewed", { source: "marketing_home" }),
    ).not.toThrow();
  });

  it("accepts contact_form_submitted with a PII-safe payload", () => {
    expect(() =>
      track("contact_form_submitted", {
        sourcePath: "/contact",
        listingLinkPresent: true,
        messageLengthBucket: "medium",
      }),
    ).not.toThrow();
  });
});

describe("track() — communication category", () => {
  it("accepts welcome_email_sent with user id and template key", () => {
    expect(() =>
      track("welcome_email_sent", {
        userId: "user_1",
        templateKey: "account_welcome",
      }),
    ).not.toThrow();
  });
});

describe("track() — system category", () => {
  it("accepts error_boundary_hit with only error (location optional)", () => {
    expect(() =>
      track("error_boundary_hit", { error: "render_crash" }),
    ).not.toThrow();
  });

  it("accepts error_boundary_hit with error + url (PasteLinkInput shape)", () => {
    expect(() =>
      track("error_boundary_hit", {
        error: "unknown_parse_error",
        url: "https://zillow.com/123",
      }),
    ).not.toThrow();
  });

  it("accepts health_check_failed", () => {
    expect(() =>
      track("health_check_failed", { check: "convex", status: 503 }),
    ).not.toThrow();
  });
});

describe("track() — PII stripping for piiSafe: false events", () => {
  // These events are marked piiSafe: false in EVENT_METADATA. Since
  // posthog is not loaded in the test env, stripPii runs defensively on
  // the properties but no capture call is issued. We verify the calls
  // complete cleanly and that the metadata flag matches expectations.

  it("error_boundary_hit is marked piiSafe: false", () => {
    expect(EVENT_METADATA.error_boundary_hit.piiSafe).toBe(false);
    expect(() =>
      track("error_boundary_hit", {
        error: "user@example.com tried to paste invalid URL",
        url: "https://zillow.com/123",
        location: "PasteLinkInput",
      }),
    ).not.toThrow();
  });

  it("document_parse_failed is marked piiSafe: false", () => {
    expect(EVENT_METADATA.document_parse_failed.piiSafe).toBe(false);
    expect(() =>
      track("document_parse_failed", {
        documentId: "doc_1",
        parser: "contract",
        error: "parsing failed near line 12",
      }),
    ).not.toThrow();
  });

  it("offer_rejected is marked piiSafe: false", () => {
    expect(EVENT_METADATA.offer_rejected.piiSafe).toBe(false);
    expect(() =>
      track("offer_rejected", {
        offerId: "offer_1",
        reason: "seller changed their mind",
      }),
    ).not.toThrow();
  });

  it("offer_withdrawn is marked piiSafe: false", () => {
    expect(EVENT_METADATA.offer_withdrawn.piiSafe).toBe(false);
    expect(() =>
      track("offer_withdrawn", {
        offerId: "offer_1",
        reason: "found another property",
      }),
    ).not.toThrow();
  });

  it("worker_job_failed is marked piiSafe: false", () => {
    expect(EVENT_METADATA.worker_job_failed.piiSafe).toBe(false);
    expect(() =>
      track("worker_job_failed", {
        jobId: "job_1",
        jobType: "property_fetch",
        error: "upstream 502",
      }),
    ).not.toThrow();
  });
});

describe("track() — posthog guard", () => {
  it("does not throw when PostHog is not loaded", () => {
    // In the vitest jsdom/node env, posthog.__loaded is falsy so the guard
    // in track() prevents capture from ever running.
    expect(() =>
      track("link_pasted", { url: "https://zillow.com/123", source: "hero" }),
    ).not.toThrow();
  });

  it("logs to console in development mode without throwing", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    try {
      // @ts-expect-error — test override of readonly process.env.NODE_ENV
      process.env.NODE_ENV = "development";
      track("link_pasted", { url: "https://zillow.com/1", source: "hero" });
      // If the guard passed at all, we don't need to assert the call count —
      // the point is that it doesn't throw.
      expect(logSpy).toHaveBeenCalled();
    } finally {
      // @ts-expect-error — restore
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe("trackFunnelStep()", () => {
  it("does not throw for a funnel event with valid typed properties", () => {
    expect(() =>
      trackFunnelStep("link_pasted", "acquisition", 1, {
        url: "https://zillow.com/1",
        source: "hero",
      }),
    ).not.toThrow();
  });

  it("does not throw for a deal_room funnel event", () => {
    expect(() =>
      trackFunnelStep("deal_room_entered", "conversion", 3, {
        dealRoomId: "dr_1",
        propertyId: "prop_1",
        accessLevel: "registered",
      }),
    ).not.toThrow();
  });

  it("injects funnel_name and step_number into dev-mode log payload", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    try {
      // @ts-expect-error — test override of readonly process.env.NODE_ENV
      process.env.NODE_ENV = "development";
      trackFunnelStep("registration_completed", "signup", 2, {
        userId: "user_1",
        source: "teaser",
      });
      // Console.log is called with a tag and then the merged props object.
      const args = logSpy.mock.calls.find(
        (call) => call[0] === "[analytics] registration_completed",
      );
      expect(args).toBeDefined();
      const payload = args?.[1] as Record<string, unknown>;
      expect(payload).toMatchObject({
        funnel_name: "signup",
        step_number: 2,
        userId: "user_1",
        source: "teaser",
      });
    } finally {
      // @ts-expect-error — restore
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe("listEventsByCategory()", () => {
  it("returns all funnel events", () => {
    const events = listEventsByCategory("funnel");
    expect(events).toContain("link_pasted");
    expect(events).toContain("teaser_viewed");
    expect(events).toContain("registration_started");
    expect(events).toContain("registration_completed");
    expect(events).toHaveLength(4);
  });

  it("returns all deal_room events", () => {
    const events = listEventsByCategory("deal_room");
    expect(events).toContain("deal_room_entered");
    expect(events).toContain("pricing_panel_viewed");
    expect(events).toContain("ai_analysis_viewed");
    expect(events.length).toBeGreaterThanOrEqual(7);
  });

  it("returns all tour events", () => {
    const events = listEventsByCategory("tour");
    expect(events).toContain("tour_requested");
    expect(events).toContain("tour_canceled");
    expect(events).toHaveLength(5);
  });

  it("returns all offer events", () => {
    const events = listEventsByCategory("offer");
    expect(events).toContain("offer_submitted");
    expect(events).toContain("offer_accepted");
    expect(events).toHaveLength(7);
  });

  it("returns all system events", () => {
    const events = listEventsByCategory("system");
    expect(events).toContain("error_boundary_hit");
    expect(events).toContain("health_check_failed");
    expect(events).toContain("worker_job_failed");
    expect(events).toHaveLength(3);
  });

  it("returns all engagement events", () => {
    const events = listEventsByCategory("engagement");
    expect(events).toContain("calculator_used");
    expect(events).toContain("pricing_faq_viewed");
    expect(events).toContain("home_how_it_works_section_viewed");
    expect(events).toContain("home_how_it_works_step_interacted");
    expect(events).toContain("home_how_it_works_cta_clicked");
    // KIN-1084: homepage comparison section added 4 engagement events.
    expect(events).toContain("home_comparison_section_viewed");
    expect(events).toContain("home_comparison_row_interacted");
    expect(events).toContain("home_comparison_pricing_cta_clicked");
    expect(events).toContain("home_comparison_intake_cta_clicked");
    // KIN-1085: themed FAQ page added 9 engagement events.
    expect(events).toContain("faq_page_viewed");
    expect(events).toContain("faq_theme_jump_clicked");
    expect(events).toContain("faq_question_opened");
    expect(events).toContain("faq_question_link_copied");
    expect(events).toContain("faq_question_dwell_ms");
    expect(events).toContain("faq_theme_engaged");
    expect(events).toContain("faq_contact_cta_clicked");
    expect(events).toContain("faq_deep_link_landed");
    expect(events).toContain("faq_teaser_clicked");
    // KIN-1088: FL availability strip + waitlist added 6 engagement events.
    expect(events).toContain("fl_strip_viewed");
    expect(events).toContain("fl_strip_cta_clicked");
    expect(events).toContain("fl_strip_dismissed");
    expect(events).toContain("waitlist_dialog_opened");
    expect(events).toContain("waitlist_submitted");
    expect(events).toContain("waitlist_submit_error");
    // KIN-1087: verified buyer stories added 7 engagement events.
    expect(events).toContain("testimonial_card_viewed");
    expect(events).toContain("testimonial_card_clicked");
    expect(events).toContain("story_page_viewed");
    expect(events).toContain("story_read_time_ms");
    expect(events).toContain("story_cta_clicked");
    expect(events).toContain("story_related_clicked");
    expect(events).toContain("aggregate_savings_counter_viewed");
    // KIN-1086: homepage rebate slider added 9 engagement events.
    expect(events).toContain("home_rebate_slider_viewed");
    expect(events).toContain("home_rebate_slider_changed");
    expect(events).toContain("home_rebate_slider_snap_reached");
    expect(events).toContain("home_rebate_aspiration_viewed");
    expect(events).toContain("home_rebate_disclosure_viewed");
    expect(events).toContain("home_rebate_cta_clicked");
    expect(events).toContain("home_rebate_slider_deep_link_landed");
    expect(events).toContain("home_rebate_slider_interaction_depth");
    expect(events).toContain("home_rebate_slider_fallback_shown");
    // KIN-1090: marketing guides + our-process added 3 engagement events.
    expect(events).toContain("guide_page_viewed");
    expect(events).toContain("guide_cta_clicked");
    expect(events).toContain("our_process_page_viewed");
    // KIN-1096: contact form added 1 engagement event.
    expect(events).toContain("contact_form_submitted");
    // Total: 2 legacy + 3 HIW + 4 comparison + 9 FAQ + 6 FL strip/waitlist + 7 stories + 9 rebate slider + 3 guides/our-process + 1 contact = 44
    expect(events).toHaveLength(44);
  });

  it("returns all communication events", () => {
    const events = listEventsByCategory("communication");
    expect(events).toContain("message_sent");
    expect(events).toContain("message_delivered");
    expect(events).toContain("message_opened");
    expect(events).toContain("message_clicked");
    expect(events).toContain("disclosure_request_card_viewed");
    expect(events).toContain("disclosure_request_preview_opened");
    expect(events).toContain("disclosure_request_sent");
    expect(events).toContain("disclosure_request_reply_received");
    expect(events).toContain("disclosure_request_follow_up_scheduled");
    expect(events).toContain("welcome_email_sent");
    expect(events).toHaveLength(10);
  });
});

describe("EVENT_METADATA coverage", () => {
  // Because track<K>() requires K extends keyof AnalyticsEventMap and
  // EVENT_METADATA is typed as Record<AnalyticsEventName, EventMetadata>,
  // TypeScript already guarantees coverage at compile time. These runtime
  // checks protect against accidental `as` casts that might slip past tsc.

  it("every EVENT_METADATA entry has a valid category", () => {
    const validCategories = new Set([
      "funnel",
      "deal_room",
      "documents",
      "tour",
      "offer",
      "closing",
      "communication",
      "agent_ops",
      "engagement",
      "system",
      "journeys",
    ]);
    for (const [name, meta] of Object.entries(EVENT_METADATA)) {
      expect(
        validCategories.has(meta.category),
        `event ${name} has invalid category ${meta.category}`,
      ).toBe(true);
    }
  });

  it("every EVENT_METADATA entry has non-empty owner and whenFired", () => {
    for (const [name, meta] of Object.entries(EVENT_METADATA)) {
      expect(meta.owner, `event ${name} missing owner`).toBeTruthy();
      expect(meta.whenFired, `event ${name} missing whenFired`).toBeTruthy();
    }
  });

  it("every EVENT_METADATA entry has a boolean piiSafe flag", () => {
    for (const [name, meta] of Object.entries(EVENT_METADATA)) {
      expect(
        typeof meta.piiSafe,
        `event ${name} piiSafe is not boolean`,
      ).toBe("boolean");
    }
  });

  it("catalog contains at least 40 events across all categories", () => {
    const total = Object.keys(EVENT_METADATA).length;
    expect(total).toBeGreaterThanOrEqual(40);
  });

  it("known piiSafe: false events are flagged correctly", () => {
    // These are the events the analytics spec requires to be stripped.
    expect(EVENT_METADATA.error_boundary_hit.piiSafe).toBe(false);
    expect(EVENT_METADATA.document_parse_failed.piiSafe).toBe(false);
    expect(EVENT_METADATA.offer_rejected.piiSafe).toBe(false);
    expect(EVENT_METADATA.offer_withdrawn.piiSafe).toBe(false);
    expect(EVENT_METADATA.worker_job_failed.piiSafe).toBe(false);
  });
});
