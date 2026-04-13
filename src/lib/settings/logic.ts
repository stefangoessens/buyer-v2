/**
 * Pure validation + decision logic for the internal settings
 * catalog (KIN-807).
 *
 * Every function is pure — no Convex calls, no IO. The Convex
 * mutation layer composes these helpers so the full decision
 * tree is exercised in Vitest without a live backend.
 */

import { SETTINGS_CATALOG, findCatalogEntry } from "./catalog";
import type {
  SettingCatalogEntry,
  SettingValidation,
  SettingValidationError,
  SettingValue,
  SettingValueKind,
  SettingsCatalog,
} from "./types";

// MARK: - Entry point

/**
 * Validate a candidate setting value against the catalog entry
 * for its key. Returns a discriminated-union result — callers
 * either proceed with the write or surface the typed errors to
 * the admin UI.
 *
 * Rules enforced:
 *   1. Key exists in the catalog
 *   2. Value kind matches the catalog's declared kind (no cross-
 *      kind writes — you can't write a string to a number setting)
 *   3. Number values respect min/max bounds and integer flag;
 *      NaN is rejected explicitly
 *   4. String / richText values respect minLength / maxLength
 *   5. String / richText values respect pattern when declared
 *      (bad regex pattern in the catalog surfaces as a typed
 *      `invalidCatalogPattern` error rather than a silent
 *      compile error)
 *   6. JSON values include every required top-level key declared
 *      in `requiredJsonKeys`
 *
 * Catalog is injectable so tests can exercise bad catalog states
 * without mutating the real `SETTINGS_CATALOG`.
 */
export function validateSettingValue(
  key: string,
  value: SettingValue,
  catalog: SettingsCatalog = SETTINGS_CATALOG
): SettingValidation {
  const entry = findCatalogEntry(catalog, key);
  if (!entry) {
    return { ok: false, errors: [{ kind: "unknownKey", key }] };
  }

  const errors: SettingValidationError[] = [];

  // Rule 2 — kind match
  if (value.kind !== entry.kind) {
    errors.push({
      kind: "kindMismatch",
      key,
      expected: entry.kind,
      actual: value.kind,
    });
    // Subsequent rules assume the kind matches. Return early so
    // we don't emit confusing "numberOutOfRange" errors for a
    // string value.
    return { ok: false, errors };
  }

  // Rule 3 — number
  if (value.kind === "number") {
    if (typeof value.value !== "number" || Number.isNaN(value.value)) {
      errors.push({ kind: "notANumber", key });
    } else {
      const min = entry.constraints?.min;
      const max = entry.constraints?.max;
      if (
        (min !== undefined && value.value < min) ||
        (max !== undefined && value.value > max)
      ) {
        errors.push({
          kind: "numberOutOfRange",
          key,
          value: value.value,
          min,
          max,
        });
      }
      if (entry.constraints?.integer && !Number.isInteger(value.value)) {
        errors.push({ kind: "notAnInteger", key, value: value.value });
      }
    }
  }

  // Rule 4/5 — string + richText
  if (value.kind === "string" || value.kind === "richText") {
    const minLength = entry.constraints?.minLength;
    const maxLength = entry.constraints?.maxLength;
    if (minLength !== undefined && value.value.length < minLength) {
      errors.push({
        kind: "stringTooShort",
        key,
        length: value.value.length,
        min: minLength,
      });
    }
    if (maxLength !== undefined && value.value.length > maxLength) {
      errors.push({
        kind: "stringTooLong",
        key,
        length: value.value.length,
        max: maxLength,
      });
    }
    if (entry.constraints?.pattern !== undefined) {
      const patternError = checkPattern(key, value.value, entry.constraints.pattern);
      if (patternError) errors.push(patternError);
    }
  }

  // Rule 6 — JSON required keys
  if (value.kind === "json") {
    const required = entry.constraints?.requiredJsonKeys ?? [];
    for (const requiredKey of required) {
      if (!(requiredKey in value.value)) {
        errors.push({
          kind: "missingRequiredJsonKey",
          key,
          missingKey: requiredKey,
        });
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Compile and run a catalog-declared regex. A bad catalog pattern
 * is surfaced as `invalidCatalogPattern` so the admin sees a
 * typed error rather than a silent runtime SyntaxError.
 */
function checkPattern(
  key: string,
  value: string,
  pattern: string
): SettingValidationError | null {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return { kind: "invalidCatalogPattern", key, pattern };
  }
  if (!regex.test(value)) {
    return { kind: "patternMismatch", key, value, pattern };
  }
  return null;
}

// MARK: - Default resolution

/**
 * Resolve a setting value to the catalog's default when a stored
 * value doesn't exist for the key. Used by runtime readers so
 * they never have to handle missing rows.
 *
 * Returns undefined for unknown keys — callers that see undefined
 * are trying to read a setting that isn't in the catalog, which
 * is a programmer error (not a config oversight).
 */
export function resolveSetting(
  key: string,
  stored: SettingValue | undefined,
  catalog: SettingsCatalog = SETTINGS_CATALOG
): SettingValue | undefined {
  const entry = findCatalogEntry(catalog, key);
  if (!entry) return undefined;
  return stored ?? entry.defaultValue;
}

/**
 * Bulk resolver — returns every catalog key mapped to either the
 * stored value or the catalog default. Used by the admin UI to
 * populate the form and by runtime services that need a full
 * config snapshot.
 */
export function resolveAllSettings(
  stored: Record<string, SettingValue>,
  catalog: SettingsCatalog = SETTINGS_CATALOG
): Record<string, SettingValue> {
  const result: Record<string, SettingValue> = {};
  for (const entry of catalog.entries) {
    result[entry.key] = stored[entry.key] ?? entry.defaultValue;
  }
  return result;
}

// MARK: - Role gating

/**
 * Check whether a caller with `callerRole` may write the given
 * setting key. Returns a typed verdict rather than a boolean so
 * the Convex mutation can throw with a clear error message.
 *
 * Admin can always write anything. Brokers can only write
 * entries where `writeRole === "broker"`.
 */
export function canWriteSetting(
  key: string,
  callerRole: "admin" | "broker" | "buyer",
  catalog: SettingsCatalog = SETTINGS_CATALOG
):
  | { ok: true }
  | { ok: false; reason: "unknownKey" | "insufficientRole" } {
  const entry = findCatalogEntry(catalog, key);
  if (!entry) return { ok: false, reason: "unknownKey" };
  if (callerRole === "admin") return { ok: true };
  if (callerRole === "broker" && entry.writeRole === "broker") {
    return { ok: true };
  }
  return { ok: false, reason: "insufficientRole" };
}

// MARK: - Value kind helpers

/**
 * Check if a SettingValueKind is one of the text kinds. Used by
 * the admin UI to decide which editor to render.
 */
export function isTextKind(kind: SettingValueKind): boolean {
  return kind === "string" || kind === "richText";
}

/**
 * Narrow a `SettingValue` to the expected kind or throw. Used by
 * runtime readers that know the expected kind and want a clean
 * error at the boundary rather than propagating a union.
 */
export function assertValueKind<K extends SettingValueKind>(
  value: SettingValue,
  expected: K
): Extract<SettingValue, { kind: K }> {
  if (value.kind !== expected) {
    throw new Error(
      `settings kind mismatch: expected ${expected}, got ${value.kind}`
    );
  }
  return value as Extract<SettingValue, { kind: K }>;
}

// MARK: - Catalog selector aliases

/**
 * Re-exports so importers can pull both the catalog + logic from
 * one module without juggling two sub-paths.
 */
export { SETTINGS_CATALOG, findCatalogEntry } from "./catalog";
export type { SettingCatalogEntry };
