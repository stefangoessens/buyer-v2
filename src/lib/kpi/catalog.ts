import type { KpiCatalog, KpiDefinition } from "./types";

/**
 * Canonical KPI catalog (KIN-861 phase 1).
 *
 * Every KPI the business tracks for launch lives here. Dashboards
 * (follow-up card) consume this catalog so the formulas and source
 * event bindings are never re-defined inline. Changes go through
 * the same review rigor as the launch event contract in KIN-845 —
 * renaming an id or widening a formula is a coordinated release.
 *
 * Cross-references:
 *   - `source.kind === "launchEvent"` names MUST exist in the
 *     `LAUNCH_EVENT_CONTRACT` (KIN-845). `validateKpiCatalog` in
 *     `logic.ts` enforces this at test time.
 *   - `source.kind === "derivedState"` tables are Convex tables
 *     that must exist in `convex/schema.ts`. We don't validate
 *     this at test time (pure module can't see the schema) but
 *     the names are authoritative.
 */

const PRODUCT_KPIS: readonly KpiDefinition[] = [
  {
    id: "product.paste_to_teaser",
    category: "product",
    label: "Paste → Teaser conversion",
    description:
      "Share of paste-a-link submissions that reach a teaser page render.",
    formulaEnglish:
      "Of buyers who pasted a listing URL, the share whose browser rendered the teaser page.",
    formulaSymbolic: "count(teaser_viewed) / count(link_pasted)",
    source: {
      kind: "launchEvent",
      eventNames: ["link_pasted", "teaser_viewed"],
      combiner: "count(teaser_viewed) / count(link_pasted)",
    },
    cadence: "hourly",
    presentation: "percentage",
    owner: "growth",
    introducedIn: "1.0.0",
  },
  {
    id: "product.teaser_to_register",
    category: "product",
    label: "Teaser → Register conversion",
    description:
      "Share of teaser viewers who complete account registration.",
    formulaEnglish:
      "Of buyers who viewed the teaser page, the share who completed the registration form.",
    formulaSymbolic:
      "count(registration_completed) / count(teaser_viewed)",
    source: {
      kind: "launchEvent",
      eventNames: ["teaser_viewed", "registration_completed"],
      combiner: "count(registration_completed) / count(teaser_viewed)",
    },
    cadence: "hourly",
    presentation: "percentage",
    owner: "growth",
    introducedIn: "1.0.0",
  },
  {
    id: "product.register_to_deal_room",
    category: "product",
    label: "Register → Deal room conversion",
    description:
      "Share of newly-registered buyers who entered at least one deal room.",
    formulaEnglish:
      "Of buyers who completed registration, the share who entered at least one deal room within 24 hours.",
    formulaSymbolic:
      "count_unique_buyers(deal_room_entered) / count(registration_completed)",
    source: {
      kind: "launchEvent",
      eventNames: ["registration_completed", "deal_room_entered"],
      combiner:
        "count_unique_buyers(deal_room_entered) / count(registration_completed)",
    },
    cadence: "daily",
    presentation: "percentage",
    owner: "growth",
    introducedIn: "1.0.0",
  },
  {
    id: "product.deal_room_to_tour",
    category: "product",
    label: "Deal room → Tour conversion",
    description:
      "Share of deal rooms that produced at least one tour request.",
    formulaEnglish:
      "Of deal rooms entered, the share whose buyer submitted at least one private-tour request.",
    formulaSymbolic:
      "count_unique_dealRooms(tour_requested) / count_unique_dealRooms(deal_room_entered)",
    source: {
      kind: "launchEvent",
      eventNames: ["deal_room_entered", "tour_requested"],
      combiner:
        "count_unique_dealRooms(tour_requested) / count_unique_dealRooms(deal_room_entered)",
    },
    cadence: "daily",
    presentation: "percentage",
    owner: "growth",
    introducedIn: "1.0.0",
  },
  {
    id: "product.tour_to_offer",
    category: "product",
    label: "Tour → Offer conversion",
    description:
      "Share of completed tours that produced a submitted offer.",
    formulaEnglish:
      "Of tours marked completed, the share whose deal room produced a submitted offer within 14 days.",
    formulaSymbolic:
      "count_unique_dealRooms(offer_submitted) / count_unique_dealRooms(tour_completed)",
    source: {
      kind: "launchEvent",
      eventNames: ["tour_completed", "offer_submitted"],
      combiner:
        "count_unique_dealRooms(offer_submitted) / count_unique_dealRooms(tour_completed)",
    },
    cadence: "daily",
    presentation: "percentage",
    owner: "growth",
    introducedIn: "1.0.0",
  },
  {
    id: "product.offer_to_close",
    category: "product",
    label: "Offer → Close conversion",
    description:
      "Share of submitted offers that reach a closed deal.",
    formulaEnglish:
      "Of offers submitted, the share whose deal room reaches the closed state.",
    formulaSymbolic: "count(deal_closed) / count(offer_submitted)",
    source: {
      kind: "launchEvent",
      eventNames: ["offer_submitted", "deal_closed"],
      combiner: "count(deal_closed) / count(offer_submitted)",
    },
    cadence: "weekly",
    presentation: "percentage",
    owner: "growth",
    introducedIn: "1.0.0",
  },
];

const OPS_KPIS: readonly KpiDefinition[] = [
  {
    id: "ops.tour_fulfillment_rate",
    category: "ops",
    label: "Tour fulfillment rate",
    description:
      "Share of tour requests that reach a confirmed status.",
    formulaEnglish:
      "Of tours requested, the share that reach confirmed before the requested window.",
    formulaSymbolic:
      "count(tour_confirmed) / count(tour_requested)",
    source: {
      kind: "launchEvent",
      eventNames: ["tour_requested", "tour_confirmed"],
      combiner: "count(tour_confirmed) / count(tour_requested)",
    },
    cadence: "daily",
    presentation: "percentage",
    owner: "ops",
    introducedIn: "1.0.0",
  },
  {
    id: "ops.time_to_tour",
    category: "ops",
    label: "Time to tour",
    description:
      "Median time between tour request and confirmed scheduledAt.",
    formulaEnglish:
      "Median of (tour_confirmed.scheduledAt - tour_requested.createdAt) across confirmed tours.",
    formulaSymbolic:
      "median(tour_confirmed.scheduledAt - tour_requested.createdAt)",
    source: {
      kind: "launchEvent",
      eventNames: ["tour_requested", "tour_confirmed"],
      combiner:
        "median(tour_confirmed.scheduledAt - tour_requested.createdAt)",
    },
    cadence: "daily",
    presentation: "duration_hours",
    owner: "ops",
    introducedIn: "1.0.0",
  },
  {
    id: "ops.document_analysis_sla",
    category: "ops",
    label: "Document analysis SLA",
    description:
      "P95 latency from document upload to buyer-visible fact state.",
    formulaEnglish:
      "95th percentile of time between file upload and the first approved fileFact surfacing to the buyer.",
    formulaSymbolic:
      "p95(fileFacts.reviewedAt - uploadedFiles.createdAt)",
    source: {
      kind: "derivedState",
      tables: ["fileFacts", "uploadedFiles"],
      combiner:
        "p95 over (fileFacts.reviewedAt - uploadedFiles.createdAt) where reviewStatus='approved'",
    },
    cadence: "hourly",
    presentation: "duration_hours",
    owner: "ops",
    introducedIn: "1.0.0",
  },
  {
    id: "ops.offer_to_acceptance_time",
    category: "ops",
    label: "Offer → acceptance time",
    description:
      "Median time between offer_submitted and offer_accepted.",
    formulaEnglish:
      "Median of (offer_accepted.timestamp - offer_submitted.timestamp) across accepted offers.",
    formulaSymbolic:
      "median(offer_accepted.timestamp - offer_submitted.timestamp)",
    source: {
      kind: "launchEvent",
      eventNames: ["offer_submitted", "offer_accepted"],
      combiner:
        "median(offer_accepted.timestamp - offer_submitted.timestamp)",
    },
    cadence: "daily",
    presentation: "duration_hours",
    owner: "ops",
    introducedIn: "1.0.0",
  },
];

const BROKER_KPIS: readonly KpiDefinition[] = [
  {
    id: "broker.pipeline_by_stage",
    category: "broker",
    label: "Pipeline by stage",
    description:
      "Count of active deal rooms grouped by current status.",
    formulaEnglish:
      "Group deal rooms that are not in a terminal state by their current status field.",
    formulaSymbolic: "group_by(dealRooms, status) where status != 'closed'",
    source: {
      kind: "derivedState",
      tables: ["dealRooms"],
      combiner:
        "group_by(dealRooms, status) where status != 'closed' and status != 'withdrawn'",
    },
    cadence: "realtime",
    presentation: "count",
    owner: "brokerage",
    introducedIn: "1.0.0",
  },
  {
    id: "broker.closed_deal_count",
    category: "broker",
    label: "Closed transaction count",
    description:
      "Number of deal rooms that reached the closed state in the selected window.",
    formulaEnglish:
      "Count of deal_closed events in the selected date range.",
    formulaSymbolic:
      "count(deal_closed) grouped by closingDate",
    source: {
      kind: "launchEvent",
      eventNames: ["deal_closed"],
      combiner: "count(deal_closed) grouped by closingDate",
    },
    cadence: "daily",
    presentation: "count",
    owner: "brokerage",
    introducedIn: "1.0.0",
  },
  {
    id: "broker.total_rebates_issued",
    category: "broker",
    label: "Total rebates issued",
    description:
      "Sum of buyer credits delivered at closing in the selected window.",
    formulaEnglish:
      "Sum of buyer credits from closed offer records within the date range.",
    formulaSymbolic: "sum(offers.buyerCredits) where status='accepted'",
    source: {
      kind: "derivedState",
      tables: ["offers"],
      combiner:
        "sum(offers.buyerCredits) where status='accepted' and accepted_at between window",
    },
    cadence: "daily",
    presentation: "currency_usd",
    owner: "brokerage",
    introducedIn: "1.0.0",
  },
  {
    id: "broker.avg_rebate_per_deal",
    category: "broker",
    label: "Average rebate per deal",
    description:
      "Mean buyer credit across closed transactions in the window.",
    formulaEnglish:
      "Mean of buyer credits across closed transactions.",
    formulaSymbolic:
      "avg(offers.buyerCredits) where status='accepted'",
    source: {
      kind: "derivedState",
      tables: ["offers"],
      combiner:
        "avg(offers.buyerCredits) where status='accepted' and accepted_at between window",
    },
    cadence: "weekly",
    presentation: "currency_usd",
    owner: "brokerage",
    introducedIn: "1.0.0",
  },
  {
    id: "broker.compensation_status_distribution",
    category: "broker",
    label: "Compensation status distribution",
    description:
      "Count of active compensation records grouped by status.",
    formulaEnglish:
      "Group the compensation/payout records by their lifecycle status.",
    formulaSymbolic: "group_by(compensation, status)",
    source: {
      kind: "derivedState",
      tables: ["compensationRecords"],
      combiner: "group_by(compensationRecords, status)",
    },
    cadence: "daily",
    presentation: "count",
    owner: "brokerage",
    introducedIn: "1.0.0",
  },
];

const AI_KPIS: readonly KpiDefinition[] = [
  {
    id: "ai.engine_latency_p95",
    category: "ai",
    label: "AI engine latency (P95)",
    description:
      "95th percentile end-to-end latency for AI engine outputs.",
    formulaEnglish:
      "95th percentile of engine output durations across all engines in the window.",
    formulaSymbolic: "p95(aiEngineOutputs.durationMs)",
    source: {
      kind: "derivedState",
      tables: ["aiEngineOutputs"],
      combiner: "p95(aiEngineOutputs.durationMs) grouped by engineType",
    },
    cadence: "hourly",
    presentation: "duration_ms",
    owner: "ai",
    introducedIn: "1.0.0",
  },
  {
    id: "ai.fallback_rate",
    category: "ai",
    label: "AI fallback rate",
    description:
      "Share of engine outputs that fell back to a deterministic or stub path.",
    formulaEnglish:
      "Count of fallback/stubbed outputs divided by total engine outputs.",
    formulaSymbolic:
      "count(aiEngineOutputs where fallback=true) / count(aiEngineOutputs)",
    source: {
      kind: "derivedState",
      tables: ["aiEngineOutputs"],
      combiner:
        "count where fallback=true / total count grouped by engineType",
    },
    cadence: "hourly",
    presentation: "percentage",
    owner: "ai",
    introducedIn: "1.0.0",
  },
  {
    id: "ai.cost_per_deal_room",
    category: "ai",
    label: "AI cost per deal room",
    description:
      "Average LLM cost spent per unique deal room in the window.",
    formulaEnglish:
      "Sum of LLM cost USD divided by the distinct deal room count that engines produced outputs for.",
    formulaSymbolic:
      "sum(aiEngineOutputs.costUsd) / count_unique(aiEngineOutputs.dealRoomId)",
    source: {
      kind: "derivedState",
      tables: ["aiEngineOutputs"],
      combiner:
        "sum(costUsd) / distinct(dealRoomId) across the selected window",
    },
    cadence: "daily",
    presentation: "currency_usd",
    owner: "ai",
    introducedIn: "1.0.0",
  },
  {
    id: "ai.eval_harness_score",
    category: "ai",
    label: "Eval harness score",
    description:
      "Aggregate score from the deterministic AI eval harness suite.",
    formulaEnglish:
      "Mean of pass rates across the eval harness test suites grouped by engine.",
    formulaSymbolic:
      "mean(evalRuns.passRate) grouped by engineType",
    source: {
      kind: "derivedState",
      tables: ["aiEvalRuns"],
      combiner:
        "mean(passRate) over most recent run grouped by engineType",
    },
    cadence: "daily",
    presentation: "score",
    owner: "ai",
    introducedIn: "1.0.0",
  },
  {
    id: "ai.calibration_drift",
    category: "ai",
    label: "Calibration drift",
    description:
      "Difference between self-reported engine confidence and realized accuracy.",
    formulaEnglish:
      "Mean absolute error between predicted confidence and realized pass rate across the eval harness window.",
    formulaSymbolic:
      "mean(|engineConfidence - realizedPassRate|)",
    source: {
      kind: "derivedState",
      tables: ["aiEvalRuns", "aiEngineOutputs"],
      combiner:
        "mean(|confidence - passRate|) over the selected window",
    },
    cadence: "weekly",
    presentation: "ratio",
    owner: "ai",
    introducedIn: "1.0.0",
  },
];

export const KPI_CATALOG: KpiCatalog = {
  version: "1.0.0",
  lastUpdated: "2026-04-12",
  definitions: [
    ...PRODUCT_KPIS,
    ...OPS_KPIS,
    ...BROKER_KPIS,
    ...AI_KPIS,
  ],
};
