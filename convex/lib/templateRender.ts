/**
 * Convex-side template rendering (KIN-835).
 *
 * This is a minimal duplicate of `src/lib/templates/render.ts`. It must
 * stay in sync — any change to the render semantics here has to be
 * mirrored there (and vice versa). We keep them separate because
 * Convex functions cannot import from `src/` and we want the render
 * library to remain a pure TS module usable by RSC / unit tests /
 * future Node scripts without pulling Convex types in.
 */

import type {
  CommunicationTemplateInputValue,
  CommunicationTemplateRenderInputs,
} from "../../packages/shared/src/communication-templates";

// ─── Placeholder regex ─────────────────────────────────────────────────────
// Matches `{{ name }}` with optional surrounding whitespace. The capture
// group holds the variable name. Names must start with a letter or
// underscore, matching valid JS/TS identifiers.
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
  allowExtraInputs?: boolean;
  strict?: boolean;
}

export type TemplateInputValue = CommunicationTemplateInputValue;
export type TemplateInputs = CommunicationTemplateRenderInputs;

// ─── Public API ────────────────────────────────────────────────────────────

/** Extract unique `{{variable}}` names from a template body, in order. */
export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
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
 * Render a template with typed inputs. See the src-side twin at
 * `src/lib/templates/render.ts` for full semantics. The two must stay
 * in sync — this copy exists purely because Convex functions cannot
 * import from `src/`.
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

  // 1. Template body uses a placeholder that is not declared — catches
  //    drift between body and declared variable list.
  for (const name of placeholders) {
    if (!declaredSet.has(name)) {
      errors.push({
        code: "invalid_template",
        message: `Template uses placeholder {{${name}}} which is not declared in variables`,
        variable: name,
      });
    }
  }

  // 2. Declared variable is missing from inputs.
  for (const name of declaredVariables) {
    if (!Object.prototype.hasOwnProperty.call(inputs, name)) {
      errors.push({
        code: "missing_variable",
        message: `Missing required variable: ${name}`,
        variable: name,
      });
    }
  }

  // 3. Strict / disallow-extras: input not in declared set.
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

  const rendered = template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    return stringifyInput(inputs[name]);
  });

  return {
    ok: true,
    rendered,
    usedVariables: Array.from(placeholderSet),
  };
}

/** Check if a version string is semver major.minor.patch. */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Compare two semver-style versions. Returns -1, 0, 1. Throws on
 * invalid input — callers should validate via `isValidVersion` first.
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

function stringifyInput(value: string | number | boolean): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}
