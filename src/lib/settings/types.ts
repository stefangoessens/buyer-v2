/**
 * Typed internal settings state (KIN-807).
 *
 * This module defines the shape of the mutable configuration store
 * used by brokerage and product operations. Every setting has:
 *   - a stable `key` (catalog-authored, never changes)
 *   - a typed value (string / number / boolean / json / richText)
 *   - a registry entry describing allowed values and who may edit
 *   - an audit trail recording who changed it, when, and why
 *
 * Settings live in Convex under `settingsEntries` +
 * `settingsAuditLog`. Pure validation + decision logic is in
 * `src/lib/settings/logic.ts` so the full decision tree is
 * exercised in Vitest without a live backend.
 *
 * This is the ONLY place the schema is encoded. Convex mutations
 * reach into `SETTINGS_CATALOG` (mirrored inline in the Convex
 * file because Convex cannot import from `src/`) to validate
 * before writes land.
 */

// MARK: - Value types

/**
 * Allowed runtime value kinds. Catalog entries declare one of
 * these and `validateSettingValue` enforces it at write time.
 *
 * - `string`    — single-line free-text (short labels, ids)
 * - `number`    — numeric with optional min/max bounds
 * - `boolean`   — feature flag or on/off toggle
 * - `richText`  — multi-line markdown (disclosure copy, legal text)
 * - `json`      — structured object matching a shape hint in the
 *                 catalog. The validator runs a shallow structural
 *                 check; nested validation is the caller's job.
 */
export type SettingValueKind =
  | "string"
  | "number"
  | "boolean"
  | "richText"
  | "json";

/**
 * Tagged union of setting values. The `kind` discriminator always
 * matches the kind declared in the catalog entry — callers that
 * try to write a mismatched kind fail validation before the
 * Convex mutation lands.
 */
export type SettingValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "richText"; value: string }
  | { kind: "json"; value: Record<string, unknown> };

// MARK: - Catalog entry

/**
 * A single entry in the settings registry. `SETTINGS_CATALOG`
 * enumerates every supported setting — no setting can be created
 * ad-hoc; all keys must be registered here first.
 */
export interface SettingCatalogEntry {
  /** Stable identifier used as the Convex row's `key`. */
  key: string;
  /** Human-readable label for the admin UI. */
  label: string;
  /** What the setting controls (shown as help text). */
  description: string;
  /** Logical grouping for the admin UI. */
  category: SettingCategory;
  /** Type of value this setting carries. */
  kind: SettingValueKind;
  /** Who may edit this setting. */
  writeRole: SettingWriteRole;
  /**
   * Default value used when the Convex row doesn't exist yet.
   * Always present — callers never have to null-handle a missing
   * setting.
   */
  defaultValue: SettingValue;
  /** Optional value constraints — enforced by `validateSettingValue`. */
  constraints?: SettingConstraints;
}

export type SettingCategory =
  | "disclosures"
  | "fees"
  | "rollout"
  | "operational"
  | "branding";

/**
 * Who may write this setting. Reads are broker/admin; writes are
 * stricter since they affect runtime behavior.
 *
 * - `admin`  — admins only
 * - `broker` — broker or admin
 */
export type SettingWriteRole = "admin" | "broker";

// MARK: - Constraints

/**
 * Optional constraints per kind. All are validated at save time;
 * the validator returns a specific error for each one so the
 * admin UI can surface actionable feedback.
 */
export interface SettingConstraints {
  // string / richText
  minLength?: number;
  maxLength?: number;
  /**
   * Regex pattern (serialized as a string). Compiled at validation
   * time — callers that pass an invalid pattern get a clear
   * "catalog error" result rather than silent failure.
   */
  pattern?: string;
  // number
  min?: number;
  max?: number;
  /** When true, number must be an integer (not a float). */
  integer?: boolean;
  // json — declared set of required top-level keys
  requiredJsonKeys?: readonly string[];
}

// MARK: - Validation errors

/**
 * Typed validation errors. Discriminated union so the admin UI
 * can branch on `kind` and show the right inline message.
 */
export type SettingValidationError =
  | { kind: "unknownKey"; key: string }
  | {
      kind: "kindMismatch";
      key: string;
      expected: SettingValueKind;
      actual: SettingValueKind;
    }
  | { kind: "stringTooShort"; key: string; length: number; min: number }
  | { kind: "stringTooLong"; key: string; length: number; max: number }
  | { kind: "patternMismatch"; key: string; value: string; pattern: string }
  | {
      kind: "invalidCatalogPattern";
      key: string;
      pattern: string;
    }
  | {
      kind: "numberOutOfRange";
      key: string;
      value: number;
      min?: number;
      max?: number;
    }
  | { kind: "notAnInteger"; key: string; value: number }
  | { kind: "notANumber"; key: string }
  | {
      kind: "missingRequiredJsonKey";
      key: string;
      missingKey: string;
    };

export type SettingValidation =
  | { ok: true }
  | { ok: false; errors: SettingValidationError[] };

// MARK: - Audit log

/**
 * One row per setting change. Audit log is append-only — the
 * admin UI and forensic tooling read from here.
 */
export interface SettingAuditEntry {
  key: string;
  previousValue: SettingValue | null;
  nextValue: SettingValue;
  changedBy: string;
  reason: string;
  changedAt: string;
}

// MARK: - Catalog

export interface SettingsCatalog {
  /** Ordered list so admin UI categories render in a stable order. */
  entries: SettingCatalogEntry[];
}
