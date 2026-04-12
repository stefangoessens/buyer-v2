/**
 * Typed launch event contract (KIN-845).
 *
 * This is the source-of-truth schema for the analytics events we
 * need for launch measurement. It sits above the existing
 * `src/lib/analytics.ts` typed-track API:
 *
 *   - `src/lib/analytics.ts` — compile-time TypeScript types for
 *      web-side PostHog `track()` calls. Covers every event in the
 *      product, including non-launch events (debugging, ops).
 *   - `src/lib/launchEvents/*` (this module) — the versioned,
 *      runtime-validated contract that frontend, backend, the
 *      browser extension, and iOS all share for LAUNCH-CRITICAL
 *      events. Subset of the full AnalyticsEventMap — the events
 *      that must remain schema-stable through launch because
 *      PostHog funnels, BI dashboards, and Railway worker jobs
 *      consume them directly.
 *
 * The two modules are intentionally separate. The broader
 * `analytics.ts` event map evolves with product work; this
 * `launchEvents` contract carries a version string and is
 * governed by a tighter review process (any change is a PR
 * review gate because downstream consumers depend on it).
 */

// MARK: - Primitive property schema

/**
 * The allowed runtime types for a launch-event property. String
 * and number cover ids, prices, timestamps; boolean covers
 * flags; enum is the only source of "one-of" constraints (for
 * cases like tour side, offer status).
 */
export type LaunchEventPropType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum";

/**
 * Spec for a single event property. `required` is enforced at
 * runtime by `validateLaunchEvent`; optional fields pass through
 * without being checked.
 *
 * For `enum` type, `enumValues` must be non-empty — the validator
 * rejects the spec itself with a clear error if it isn't.
 */
export interface LaunchEventPropSpec {
  type: LaunchEventPropType;
  required: boolean;
  description: string;
  /** Allowed values for `type === "enum"`. */
  enumValues?: readonly string[];
  /** Inclusive minimum for `type === "number" | "integer"`. */
  min?: number;
  /** Inclusive maximum for `type === "number" | "integer"`. */
  max?: number;
}

// MARK: - Event schema

/**
 * A single launch event. `kind` is the canonical event name
 * (snake_case verb_noun, must match `AnalyticsEventMap` in
 * `src/lib/analytics.ts`). `props` maps property name →
 * property spec.
 */
export interface LaunchEventDefinition {
  /**
   * Canonical event name. Uses `LaunchEventName` type in the
   * contract for compile-time safety.
   */
  name: string;
  /**
   * Business category — matches `EventCategory` in the broader
   * analytics module. Used for funnel groupings.
   */
  category:
    | "public_site"
    | "deal_room"
    | "tour"
    | "offer"
    | "closing"
    | "communication";
  /**
   * Short plain-english description of when this event fires.
   * Surfaces in the contract dump used by analytics review.
   */
  description: string;
  /**
   * Who owns the event. If the owner team stops emitting it, the
   * contract review PR must either remove the entry or reassign
   * ownership.
   */
  owner: string;
  /**
   * Contract version in which this event was introduced. Allows
   * the contract to remain append-only — future validators can
   * tell whether a given consumer speaks a version that includes
   * this event.
   */
  introducedIn: string;
  /** Property schema: name → spec. */
  props: Record<string, LaunchEventPropSpec>;
}

// MARK: - Contract

/**
 * The full versioned contract. A new contract version is a
 * reviewable PR that either adds events or appends optional
 * props to existing events — removing an event or making a
 * previously-optional prop required is a major version bump.
 */
export interface LaunchEventContract {
  version: string;
  /** ISO-8601 date the contract was last modified. */
  lastUpdated: string;
  /** Event schemas keyed by event name. */
  events: Record<string, LaunchEventDefinition>;
}

// MARK: - Validation

/**
 * Errors returned by `validateLaunchEvent`. Exposed as a
 * discriminated union so consumers can handle each case
 * exhaustively (or rethrow as a single "invalid event" error).
 */
export type LaunchEventValidationError =
  | { kind: "unknownEvent"; name: string }
  | { kind: "missingRequiredProp"; event: string; prop: string }
  | {
      kind: "wrongType";
      event: string;
      prop: string;
      expected: LaunchEventPropType;
      actual: string;
    }
  | {
      kind: "outOfRange";
      event: string;
      prop: string;
      value: number;
      min?: number;
      max?: number;
    }
  | {
      kind: "invalidEnumValue";
      event: string;
      prop: string;
      value: string;
      allowed: readonly string[];
    }
  | {
      kind: "integerExpected";
      event: string;
      prop: string;
      value: number;
    };

export type LaunchEventValidation =
  | { ok: true }
  | { ok: false; errors: LaunchEventValidationError[] };
