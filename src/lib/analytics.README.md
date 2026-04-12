# Analytics Event Catalog — Governance

The canonical event catalog lives in `src/lib/analytics.ts`. Every event tracked by web or iOS must be declared in `AnalyticsEventMap` with typed properties.

## Adding a new event
1. Add a key to `AnalyticsEventMap` with the properties shape. Include a JSDoc comment describing when the event fires.
2. Add a matching entry in `EVENT_METADATA` with `{ category, owner, whenFired, piiSafe }`.
3. Use `track("event_name", { ... })` at the call site — TypeScript enforces the shape.
4. Open a PR with the catalog change and the call site together. The owner guild must approve.

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
