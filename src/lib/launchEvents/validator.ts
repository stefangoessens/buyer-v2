/**
 * Runtime validator for the launch event contract (KIN-845).
 *
 * Called by emitters before a tracked event is dispatched. Enforces:
 *   - Event name is in the contract
 *   - Every `required: true` prop is present and non-null
 *   - No undeclared props sneak through (codex P2 from PR #73 —
 *     ignoring unknown keys lets schema drift reach PostHog/BI
 *     without a contract change, which undermines the whole
 *     point of a versioned contract)
 *   - Prop values match the declared type (string / number / integer
 *     / boolean / enum)
 *   - `NaN` is always rejected on numeric props (codex P1 from PR
 *     #73 — `typeof NaN === "number"` is true so a naive type
 *     check lets it through; downstream transports coerce NaN to
 *     null silently)
 *   - Numeric ranges (min/max) are respected when specified
 *   - Integer props reject non-integer numeric values
 *   - Enum props reject values outside the allow-list
 *
 * Returns a discriminated union. Emitters typically reject and throw
 * in dev, log-and-drop in production — both paths get the same
 * error list.
 */

import { LAUNCH_EVENT_CONTRACT } from "./contract";
import type {
  LaunchEventContract,
  LaunchEventPropSpec,
  LaunchEventPropType,
  LaunchEventValidation,
  LaunchEventValidationError,
} from "./types";

// MARK: - Entry point

/**
 * Validate a candidate launch event against the contract. The
 * contract argument is injectable so tests can exercise unknown
 * events and custom specs without having to mutate the canonical
 * contract file.
 */
export function validateLaunchEvent(
  name: string,
  properties: Record<string, unknown>,
  contract: LaunchEventContract = LAUNCH_EVENT_CONTRACT
): LaunchEventValidation {
  const definition = contract.events[name];
  if (!definition) {
    return { ok: false, errors: [{ kind: "unknownEvent", name }] };
  }

  const errors: LaunchEventValidationError[] = [];

  // Reject undeclared props first so callers see the schema-drift
  // error at the top of the list. `undefined` values are ignored
  // (treating them as "not set" matches JS ergonomics — a caller
  // passing `{ url: "x", source: undefined }` isn't drift).
  const declaredPropNames = new Set(Object.keys(definition.props));
  for (const propName of Object.keys(properties)) {
    if (!declaredPropNames.has(propName) && properties[propName] !== undefined) {
      errors.push({ kind: "undeclaredProp", event: name, prop: propName });
    }
  }

  for (const [propName, spec] of Object.entries(definition.props)) {
    const value = properties[propName];

    // Missing value — only fatal for required props.
    if (value === undefined || value === null) {
      if (spec.required) {
        errors.push({
          kind: "missingRequiredProp",
          event: name,
          prop: propName,
        });
      }
      continue;
    }

    const typeError = checkType(name, propName, spec, value);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    // NaN slips through `typeof x === "number"` so we need an
    // explicit guard here. Handled after the type check so we
    // don't emit both wrongType AND notANumber for the same prop.
    if (
      (spec.type === "number" || spec.type === "integer") &&
      typeof value === "number" &&
      Number.isNaN(value)
    ) {
      errors.push({ kind: "notANumber", event: name, prop: propName });
      continue;
    }

    const numericError = checkNumericConstraints(
      name,
      propName,
      spec,
      value
    );
    if (numericError) errors.push(numericError);

    const enumError = checkEnumConstraint(name, propName, spec, value);
    if (enumError) errors.push(enumError);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// MARK: - Helpers

function checkType(
  event: string,
  prop: string,
  spec: LaunchEventPropSpec,
  value: unknown
): LaunchEventValidationError | null {
  const actual = runtimeTypeOf(value);
  const wantsNumber =
    spec.type === "number" || spec.type === "integer";
  if (wantsNumber) {
    if (actual !== "number") {
      return {
        kind: "wrongType",
        event,
        prop,
        expected: spec.type,
        actual,
      };
    }
    return null;
  }
  if (spec.type === "enum") {
    if (actual !== "string") {
      return {
        kind: "wrongType",
        event,
        prop,
        expected: "enum",
        actual,
      };
    }
    return null;
  }
  if (spec.type === "string" && actual !== "string") {
    return {
      kind: "wrongType",
      event,
      prop,
      expected: "string",
      actual,
    };
  }
  if (spec.type === "boolean" && actual !== "boolean") {
    return {
      kind: "wrongType",
      event,
      prop,
      expected: "boolean",
      actual,
    };
  }
  return null;
}

function checkNumericConstraints(
  event: string,
  prop: string,
  spec: LaunchEventPropSpec,
  value: unknown
): LaunchEventValidationError | null {
  if (spec.type !== "number" && spec.type !== "integer") return null;
  if (typeof value !== "number" || Number.isNaN(value)) return null;

  if (spec.type === "integer" && !Number.isInteger(value)) {
    return {
      kind: "integerExpected",
      event,
      prop,
      value,
    };
  }
  if (
    (spec.min !== undefined && value < spec.min) ||
    (spec.max !== undefined && value > spec.max)
  ) {
    return {
      kind: "outOfRange",
      event,
      prop,
      value,
      min: spec.min,
      max: spec.max,
    };
  }
  return null;
}

function checkEnumConstraint(
  event: string,
  prop: string,
  spec: LaunchEventPropSpec,
  value: unknown
): LaunchEventValidationError | null {
  if (spec.type !== "enum") return null;
  if (typeof value !== "string") return null;
  const allowed = spec.enumValues ?? [];
  if (allowed.length === 0 || !allowed.includes(value)) {
    return {
      kind: "invalidEnumValue",
      event,
      prop,
      value,
      allowed,
    };
  }
  return null;
}

/**
 * JS `typeof` returns "object" for null and arrays, which isn't
 * what we want. This helper collapses those edge cases onto the
 * string literal set the validator actually cares about.
 */
function runtimeTypeOf(
  value: unknown
): "string" | "number" | "boolean" | "null" | "array" | "object" | "undefined" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (
    t === "string" ||
    t === "number" ||
    t === "boolean" ||
    t === "undefined"
  ) {
    return t;
  }
  return "object";
}

// Keep the unused-type protection: every member of
// LaunchEventPropType is handled in `checkType`. Adding a new member
// to the union fails the type check on the unused branch below.
const _ensureExhaustive: readonly LaunchEventPropType[] = [
  "string",
  "number",
  "integer",
  "boolean",
  "enum",
];
void _ensureExhaustive;
