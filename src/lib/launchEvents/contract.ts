import type { LaunchEventContract } from "./types";

/**
 * The canonical launch event contract (KIN-845).
 *
 * This is the *single source of truth* for launch-critical analytics
 * event schemas. Web, backend, browser extension, and iOS all
 * reference this same contract (iOS generates a Swift analog from it
 * in a downstream build step; for now the TS shape is canonical).
 *
 * Versioning rules:
 *   - `MAJOR.MINOR.PATCH` semver.
 *   - **PATCH** — docs-only changes (description, owner).
 *   - **MINOR** — append an event, append an optional prop to an
 *     existing event, or widen an enum.
 *   - **MAJOR** — remove an event, make a previously-optional prop
 *     required, narrow an enum, or rename anything. Major bumps
 *     require coordinated consumer upgrades.
 *
 * Every event listed here MUST also be in the broader
 * `AnalyticsEventMap` in `src/lib/analytics.ts` so compile-time
 * callers get TS coverage when they emit via `track()`.
 *
 * Deliberately NOT included (handled by the broader analytics
 * module, not launch-critical):
 *   - Document upload / parse events (ops tooling)
 *   - Agent ops events (payouts, coverage)
 *   - Engagement events (calculator, FAQ opens)
 *   - System events (error boundary, health check, worker jobs)
 */

export const LAUNCH_EVENT_CONTRACT: LaunchEventContract = {
  version: "1.0.0",
  lastUpdated: "2026-04-12",
  events: {
    // ─── Public site funnel ──────────────────────────────────────────
    link_pasted: {
      name: "link_pasted",
      category: "public_site",
      description: "Buyer pastes a property URL into the intake form.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        url: {
          type: "string",
          required: true,
          description: "Raw pasted URL.",
        },
        source: {
          type: "enum",
          required: true,
          description: "Which public surface the paste came from.",
          enumValues: ["home", "blog", "city", "community", "newconstruction"],
        },
      },
    },
    teaser_viewed: {
      name: "teaser_viewed",
      category: "public_site",
      description: "Teaser page renders before the registration gate.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        propertyId: {
          type: "string",
          required: true,
          description: "Property id surfaced in the teaser.",
        },
        source: {
          type: "string",
          required: false,
          description: "Optional referrer tag.",
        },
      },
    },
    registration_started: {
      name: "registration_started",
      category: "public_site",
      description: "Registration modal opens in response to a gated surface.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        source: {
          type: "string",
          required: true,
          description: "Which surface triggered the gate.",
        },
      },
    },
    registration_completed: {
      name: "registration_completed",
      category: "public_site",
      description: "Registration form submission succeeds.",
      owner: "growth",
      introducedIn: "1.0.0",
      props: {
        userId: {
          type: "string",
          required: true,
          description: "Convex user id of the new account.",
        },
        source: {
          type: "string",
          required: false,
          description: "Origin surface.",
        },
      },
    },

    // ─── Deal room ──────────────────────────────────────────────────
    deal_room_entered: {
      name: "deal_room_entered",
      category: "deal_room",
      description: "Buyer enters a deal room after the access gate.",
      owner: "dashboard",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Convex deal room id.",
        },
        propertyId: {
          type: "string",
          required: true,
          description: "Convex property id.",
        },
        accessLevel: {
          type: "enum",
          required: true,
          description: "Access level resolved for the session.",
          enumValues: ["anonymous", "registered", "full"],
        },
      },
    },
    pricing_panel_viewed: {
      name: "pricing_panel_viewed",
      category: "deal_room",
      description: "Pricing panel first paint with a real engine result.",
      owner: "ai",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        propertyId: {
          type: "string",
          required: true,
          description: "Property id.",
        },
        overallConfidence: {
          type: "number",
          required: true,
          description: "Engine confidence 0..1.",
          min: 0,
          max: 1,
        },
      },
    },

    // ─── Tour ───────────────────────────────────────────────────────
    tour_requested: {
      name: "tour_requested",
      category: "tour",
      description: "Buyer submits a tour request from the deal room.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        propertyId: {
          type: "string",
          required: true,
          description: "Property id.",
        },
        requestedWindow: {
          type: "string",
          required: true,
          description: "ISO-8601 time window string (free-form for now).",
        },
      },
    },
    tour_confirmed: {
      name: "tour_confirmed",
      category: "tour",
      description: "Showing agent confirms the tour slot.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        tourId: {
          type: "string",
          required: true,
          description: "Tour id.",
        },
        agentId: {
          type: "string",
          required: true,
          description: "Showing agent id.",
        },
        scheduledAt: {
          type: "string",
          required: true,
          description: "ISO-8601 start timestamp.",
        },
      },
    },
    tour_completed: {
      name: "tour_completed",
      category: "tour",
      description: "Tour marked completed after it happens.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        tourId: {
          type: "string",
          required: true,
          description: "Tour id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Parent deal room id.",
        },
      },
    },

    // ─── Offer ──────────────────────────────────────────────────────
    offer_submitted: {
      name: "offer_submitted",
      category: "offer",
      description: "Offer mutation succeeds and the offer goes to seller.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        offerId: {
          type: "string",
          required: true,
          description: "Offer id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        offerPrice: {
          type: "integer",
          required: true,
          description: "Offer price in whole dollars.",
          min: 0,
        },
      },
    },
    offer_accepted: {
      name: "offer_accepted",
      category: "offer",
      description: "Offer marked accepted by the listing side.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        offerId: {
          type: "string",
          required: true,
          description: "Offer id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        finalPrice: {
          type: "integer",
          required: true,
          description: "Accepted price in whole dollars.",
          min: 0,
        },
      },
    },

    // ─── Closing ────────────────────────────────────────────────────
    contract_signed: {
      name: "contract_signed",
      category: "closing",
      description: "Purchase contract fully executed by all parties.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        contractId: {
          type: "string",
          required: true,
          description: "Contract id.",
        },
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
      },
    },
    deal_closed: {
      name: "deal_closed",
      category: "closing",
      description: "Deal reaches the terminal closed state.",
      owner: "brokerage",
      introducedIn: "1.0.0",
      props: {
        dealRoomId: {
          type: "string",
          required: true,
          description: "Deal room id.",
        },
        contractId: {
          type: "string",
          required: true,
          description: "Contract id.",
        },
        closingDate: {
          type: "string",
          required: true,
          description: "ISO-8601 closing date.",
        },
      },
    },

    // ─── Communication ──────────────────────────────────────────────
    message_sent: {
      name: "message_sent",
      category: "communication",
      description: "Outbound message is queued for delivery.",
      owner: "platform",
      introducedIn: "1.0.0",
      props: {
        channel: {
          type: "enum",
          required: true,
          description: "Delivery channel.",
          enumValues: ["email", "sms", "push", "in_app"],
        },
        templateKey: {
          type: "string",
          required: true,
          description: "Template id (matches communication template catalog).",
        },
      },
    },
  },
};

/**
 * Convenience: the set of event names the launch contract covers.
 * Computed from the contract so drift is impossible — if a contract
 * entry is removed, this set shrinks to match.
 */
export const LAUNCH_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.keys(LAUNCH_EVENT_CONTRACT.events)
);
