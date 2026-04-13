/**
 * Communication template rendering library (KIN-835).
 *
 * Pure TypeScript — no Convex imports — so it can be used from:
 *   - React Server Components rendering previews
 *   - Unit tests
 *   - The Convex backend (via a thin duplicate in
 *     `convex/lib/templateRender.ts` kept in sync)
 *
 * Template syntax is intentionally minimal:
 *   - `{{variable}}` placeholders, with optional whitespace inside the
 *     braces: `{{ variable }}` is equivalent to `{{variable}}`
 *   - No control flow, no filters, no pipelines — variables only
 *
 * Rendering validates declared vs provided variables and surfaces
 * structured errors so callers can show actionable messages in the
 * broker/admin console.
 */

import type {
  CommunicationTemplateInputValue,
  CommunicationTemplateRenderInputs,
} from "@buyer-v2/shared";

// ─── Placeholder regex ─────────────────────────────────────────────────────
//
// Matches `{{ name }}` with optional surrounding whitespace. The capture
// group holds the variable name. Names must start with a letter or
// underscore and may contain letters, digits, and underscores — this
// mirrors valid JS/TS identifiers, which is what the typed inputs use.
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RenderError {
  code: "missing_variable" | "unexpected_variable" | "invalid_template";
  message: string;
  variable?: string;
}

export type RenderResult =
  | { ok: true; rendered: string; usedVariables: string[] }
  | { ok: false; errors: RenderError[] };

export interface RenderOptions {
  /**
   * If true, extra inputs that are not declared variables are silently
   * ignored instead of producing an error. Has no effect when `strict`
   * is true (strict overrides allowExtraInputs).
   * Default: true (extras are allowed).
   */
  allowExtraInputs?: boolean;
  /**
   * If true, rendering fails when any provided input is not declared.
   * Useful for templates where unknown keys are a signal of a caller
   * bug rather than a harmless superset.
   * Default: false.
   */
  strict?: boolean;
}

export type TemplateInputValue = CommunicationTemplateInputValue;
export type TemplateInputs = CommunicationTemplateRenderInputs;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Extract all `{{variable}}` placeholder names from a template body.
 * Returns unique names in order of first appearance.
 */
export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Reset the regex index since we declared it with the /g flag at module
  // scope. Using matchAll keeps us free of hidden lastIndex state.
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Render a template by replacing `{{variable}}` placeholders with typed
 * inputs. Validates:
 *
 *   - every declared variable is provided (else: missing_variable)
 *   - every placeholder in the template body is declared (else:
 *     invalid_template) — catches drift between body and declared list
 *   - (strict mode only) every provided input is declared (else:
 *     unexpected_variable)
 *
 * Returns a tagged result so callers can surface multiple errors at
 * once instead of failing on the first.
 */
export function renderTemplate(
  template: string,
  declaredVariables: string[],
  inputs: TemplateInputs,
  options?: RenderOptions
): RenderResult {
  const errors: RenderError[] = [];
  const declaredSet = new Set(declaredVariables);
  const placeholders = extractPlaceholders(template);
  const placeholderSet = new Set(placeholders);

  // 1. Template body contains placeholders that were never declared.
  //    This catches drift: someone edited the body but forgot to add
  //    the variable to the declared list.
  for (const name of placeholders) {
    if (!declaredSet.has(name)) {
      errors.push({
        code: "invalid_template",
        message: `Template uses placeholder {{${name}}} which is not declared in variables`,
        variable: name,
      });
    }
  }

  // 2. Declared variables must all be provided as inputs. We report each
  //    missing one individually so the UI can highlight them.
  for (const name of declaredVariables) {
    if (!Object.prototype.hasOwnProperty.call(inputs, name)) {
      errors.push({
        code: "missing_variable",
        message: `Missing required variable: ${name}`,
        variable: name,
      });
    }
  }

  // 3. Strict mode: error on inputs that are not declared.
  //    allowExtraInputs only matters when strict is false — strict
  //    always rejects extras.
  const strict = options?.strict === true;
  const allowExtras = options?.allowExtraInputs !== false;
  if (strict || !allowExtras) {
    for (const name of Object.keys(inputs)) {
      if (!declaredSet.has(name)) {
        errors.push({
          code: "unexpected_variable",
          message: `Unexpected input variable: ${name}`,
          variable: name,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // All checks passed — perform substitution. We re-run the regex with a
  // replacer so we only touch each placeholder once and preserve the
  // template's surrounding text verbatim.
  const rendered = template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const value = inputs[name];
    // Known safe because we checked declared ⊆ inputs above, and
    // placeholderSet ⊆ declaredSet.
    return stringifyInput(value);
  });

  // usedVariables is the list of placeholder names actually present in
  // the template body — not the declared list. Callers use this to know
  // what was interpolated vs what was declared but unused.
  return {
    ok: true,
    rendered,
    usedVariables: Array.from(placeholderSet),
  };
}

/**
 * Check if a version string matches semver major.minor.patch. Does not
 * support pre-release suffixes — the template registry only cares about
 * stable version numbers.
 */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Compare two semver-style versions. Returns -1 if a < b, 0 if equal,
 * 1 if a > b. Throws if either input is not a valid version — callers
 * should validate first via `isValidVersion`.
 */
export function compareVersions(a: string, b: string): number {
  if (!isValidVersion(a)) {
    throw new Error(`Invalid version: ${a}`);
  }
  if (!isValidVersion(b)) {
    throw new Error(`Invalid version: ${b}`);
  }
  const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
  const [bMajor, bMinor, bPatch] = b.split(".").map(Number);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

// ─── Internals ─────────────────────────────────────────────────────────────

/**
 * Convert a typed input value into its string form for template
 * substitution. Only string/number/boolean are allowed at the type
 * level — this function is defensive against callers passing through
 * `any`.
 */
function stringifyInput(value: string | number | boolean): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  // Unreachable under correct typing; empty string is the safest fallback
  // so a single bad input does not corrupt the whole message.
  return "";
}
