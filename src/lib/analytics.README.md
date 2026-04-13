# Analytics Event Catalog — Governance

The full analytics catalog lives in `src/lib/analytics.ts`.

Launch-critical events are defined once in `@buyer-v2/shared/launch-events` and then inherited into `AnalyticsEventMap`. That shared module also owns the runtime validator, emitter helpers, contract changelog, and the serializable contract snapshot used by downstream consumers/codegen.

## Adding a new event
1. If the event is launch-critical, add it to `@buyer-v2/shared/launch-events` and update the contract changelog there.
2. Add a key to `AnalyticsEventMap` only for non-launch events. Include a JSDoc comment describing when the event fires.
3. Add a matching entry in `EVENT_METADATA` with `{ category, owner, whenFired, piiSafe }`.
4. Use `track("event_name", { ... })` at the call site — TypeScript enforces the shape.
5. Open a PR with the catalog change and the call site together. The owner guild must approve.

## Event naming convention
- `snake_case` verb_noun: `tour_requested`, `offer_submitted`, `deal_closed`
- Past tense for events that happened
- Present tense only for system probes (e.g. `health_check_failed`)

## PII rules
- Mark `piiSafe: false` for any event with free-form strings that might carry user text (error messages, reasons, notes)
- The `track()` function runs `stripPii` on these defensively before dispatch
- Never put email, phone, name, address, or any PII field directly into event properties — even on `piiSafe: true` events

## iOS coverage
- iOS events must use the same event names and property shapes (shared via a TypeScript-to-Swift codegen or manual mirror)
- KIN-826 owns the iOS PostHog SDK integration

## Baseline taxonomy
- Funnel: `link_pasted`, `teaser_viewed`, `registration_started`, `registration_completed`
- Deal workflow: `deal_room_entered`, `pricing_panel_viewed`, `tour_requested`, `offer_submitted`, `contract_signed`, `deal_closed`
- Operations workflow: `message_sent`, `message_delivered`, `agent_assigned`, `payout_created`
- System observability: `error_boundary_hit`, `health_check_failed`, `worker_job_failed`
