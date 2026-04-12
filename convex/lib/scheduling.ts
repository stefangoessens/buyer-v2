/**
 * Availability window validation helpers for Convex backend (KIN-836).
 *
 * This file is a pared-down duplicate of `src/lib/scheduling/windows.ts`.
 * Convex has its own tsconfig scoped to the `convex/` directory, so we
 * cannot import from `../src/...`. The shared lib lives in `src/` for
 * the Next.js app + tests; mutation-side validation lives here.
 *
 * Keep the two files in sync manually — they are small.
 */

/** Normalized form of an availability window, with both local and UTC. */
export interface NormalizedWindow {
  /** ISO-8601 UTC string (Z suffix). */
  startUtc: string;
  /** ISO-8601 UTC string (Z suffix). */
  endUtc: string;
  /** Original ISO-8601 string with timezone offset. */
  startLocal: string;
  /** Original ISO-8601 string with timezone offset. */
  endLocal: string;
  /** IANA timezone name. */
  timezone: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

/** Validation error codes for normalizeWindow. */
export interface ValidationError {
  code:
    | "invalid_start"
    | "invalid_end"
    | "end_before_start"
    | "zero_duration"
    | "invalid_timezone"
    | "window_too_long";
  message: string;
}

/** Discriminated result type returned by normalizeWindow. */
export type WindowValidationResult =
  | { valid: true; normalized: NormalizedWindow }
  | { valid: false; errors: ValidationError[] };

/** Max allowed window duration, in hours. */
export const MAX_WINDOW_DURATION_HOURS = 24 * 7; // 1 week

const MAX_WINDOW_DURATION_MS = MAX_WINDOW_DURATION_HOURS * 60 * 60 * 1000;

/** Check if a string is a valid IANA timezone name (best-effort via Intl). */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an ISO-8601 datetime string carries an explicit timezone
 * designator (Z or ±HH:MM / ±HHMM offset). Strings without one are
 * interpreted in the host's local timezone, which silently drifts across
 * runtimes (browser vs Convex server vs Node) — so we reject them.
 */
export function hasTimezoneDesignator(iso: string): boolean {
  if (typeof iso !== "string") return false;
  return /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
}

/** Convert a local ISO-8601-with-offset string to UTC ISO-8601 (Z suffix). */
export function toUtc(localIso: string): string {
  const d = new Date(localIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO-8601 string: ${localIso}`);
  }
  return d.toISOString();
}

/**
 * Normalize a start/end/timezone trio into a canonical UTC pair + local
 * strings. Returns a discriminated union — see NormalizedWindow for the
 * happy-path shape, and ValidationError for the failure shape.
 */
export function normalizeWindow(
  start: string,
  end: string,
  timezone: string
): WindowValidationResult {
  const errors: ValidationError[] = [];

  if (!isValidTimezone(timezone)) {
    errors.push({
      code: "invalid_timezone",
      message: `Unknown IANA timezone: ${timezone}`,
    });
  }

  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    errors.push({
      code: "invalid_start",
      message: `Invalid ISO-8601 start: ${start}`,
    });
  } else if (!hasTimezoneDesignator(start)) {
    errors.push({
      code: "invalid_start",
      message: `Start is missing a timezone designator (Z or ±HH:MM offset): ${start}. Cross-runtime drift risk.`,
    });
  }

  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) {
    errors.push({
      code: "invalid_end",
      message: `Invalid ISO-8601 end: ${end}`,
    });
  } else if (!hasTimezoneDesignator(end)) {
    errors.push({
      code: "invalid_end",
      message: `End is missing a timezone designator (Z or ±HH:MM offset): ${end}. Cross-runtime drift risk.`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const durationMs = endDate.getTime() - startDate.getTime();

  if (durationMs < 0) {
    errors.push({
      code: "end_before_start",
      message: `End (${end}) is before start (${start})`,
    });
  } else if (durationMs === 0) {
    errors.push({
      code: "zero_duration",
      message: "Window has zero duration",
    });
  } else if (durationMs > MAX_WINDOW_DURATION_MS) {
    errors.push({
      code: "window_too_long",
      message: `Window duration exceeds maximum of ${MAX_WINDOW_DURATION_HOURS}h`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    normalized: {
      startUtc: startDate.toISOString(),
      endUtc: endDate.toISOString(),
      startLocal: start,
      endLocal: end,
      timezone,
      durationMs,
    },
  };
}

/**
 * Check if two normalized windows overlap (share any instant). Strict —
 * windows that only touch at a single edge instant do NOT count as
 * overlapping.
 */
export function windowsOverlap(
  a: NormalizedWindow,
  b: NormalizedWindow
): boolean {
  return a.startUtc < b.endUtc && b.startUtc < a.endUtc;
}

/**
 * Throws a user-facing Error if the given trio is invalid. Use this in
 * mutations so Convex surfaces a readable failure to the client.
 */
export function assertValidWindow(
  start: string,
  end: string,
  timezone: string
): NormalizedWindow {
  const result = normalizeWindow(start, end, timezone);
  if (!result.valid) {
    const msg = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`Invalid availability window — ${msg}`);
  }
  return result.normalized;
}

/**
 * Relaxed validation for range *queries* (not stored windows). Checks
 * parseability and start < end, but does NOT enforce the 1-week cap — a
 * range query may legitimately span a month or more when fetching a
 * calendar view. Returns the normalized UTC pair for overlap filtering.
 */
export function assertValidRange(
  rangeStartUtc: string,
  rangeEndUtc: string
): { startUtc: string; endUtc: string } {
  const errors: ValidationError[] = [];

  const startDate = new Date(rangeStartUtc);
  if (Number.isNaN(startDate.getTime())) {
    errors.push({
      code: "invalid_start",
      message: `Invalid ISO-8601 range start: ${rangeStartUtc}`,
    });
  } else if (!hasTimezoneDesignator(rangeStartUtc)) {
    errors.push({
      code: "invalid_start",
      message: `Range start is missing a timezone designator: ${rangeStartUtc}`,
    });
  }

  const endDate = new Date(rangeEndUtc);
  if (Number.isNaN(endDate.getTime())) {
    errors.push({
      code: "invalid_end",
      message: `Invalid ISO-8601 range end: ${rangeEndUtc}`,
    });
  } else if (!hasTimezoneDesignator(rangeEndUtc)) {
    errors.push({
      code: "invalid_end",
      message: `Range end is missing a timezone designator: ${rangeEndUtc}`,
    });
  }

  if (errors.length === 0) {
    const durationMs = endDate.getTime() - startDate.getTime();
    if (durationMs <= 0) {
      errors.push({
        code: "end_before_start",
        message: `Range end (${rangeEndUtc}) must be strictly after start (${rangeStartUtc})`,
      });
    }
  }

  if (errors.length > 0) {
    const msg = errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`Invalid range query — ${msg}`);
  }

  return {
    startUtc: startDate.toISOString(),
    endUtc: endDate.toISOString(),
  };
}
