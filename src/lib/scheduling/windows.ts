/**
 * Availability window utilities (KIN-836).
 *
 * Pure TypeScript — no Convex, no React, no Next. Safe to import from both
 * the Next.js app and (after duplication into `convex/lib/scheduling.ts`)
 * the Convex runtime.
 *
 * The domain model keeps the original ISO-8601-with-offset strings as the
 * canonical user-facing format so wall-clock intent is preserved (e.g. a
 * buyer saying "2pm on May 1 in Miami" stays "2pm" on display) while a
 * UTC normalized pair is computed for storage indexing, overlap checks,
 * and range queries.
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
  /** IANA timezone name (e.g. "America/New_York"). */
  timezone: string;
  /** Duration in milliseconds (endUtc - startUtc). */
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

/**
 * Max allowed window duration, in hours. Used to catch absurd inputs
 * (e.g. a forgotten year boundary turning a 2-hour window into 8000h).
 */
export const MAX_WINDOW_DURATION_HOURS = 24 * 7; // 1 week

const MAX_WINDOW_DURATION_MS = MAX_WINDOW_DURATION_HOURS * 60 * 60 * 1000;

/**
 * Check if a string is a valid IANA timezone name. Best-effort: delegates
 * to the runtime's Intl.DateTimeFormat which throws RangeError for unknown
 * time zones in every modern V8/JSC build.
 */
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
 * Convert a local ISO-8601-with-offset string to a UTC ISO-8601 string
 * (Z suffix). Throws if the input is not parseable as a Date.
 */
export function toUtc(localIso: string): string {
  const d = new Date(localIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO-8601 string: ${localIso}`);
  }
  return d.toISOString();
}

/**
 * Normalize a start/end/timezone trio into a canonical UTC pair + local
 * strings. Validates parseability, duration sign, zero-duration, and max
 * length. Returns a discriminated union so callers can branch cleanly.
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
  }

  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) {
    errors.push({
      code: "invalid_end",
      message: `Invalid ISO-8601 end: ${end}`,
    });
  }

  // Can't reason about duration if either bound is bad.
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
      message: `Window duration ${formatDuration(
        durationMs
      )} exceeds maximum of ${MAX_WINDOW_DURATION_HOURS}h`,
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
 * overlapping, which matches calendar "back-to-back" semantics.
 */
export function windowsOverlap(
  a: NormalizedWindow,
  b: NormalizedWindow
): boolean {
  return a.startUtc < b.endUtc && b.startUtc < a.endUtc;
}

/**
 * Human-readable duration formatter for logging and error messages.
 * Emits the largest non-zero unit pair, e.g. "2h 30m", "45m", "3d 4h".
 */
export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs)) return "unknown";
  const abs = Math.abs(durationMs);
  const sign = durationMs < 0 ? "-" : "";

  const seconds = Math.floor(abs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remH = hours % 24;
    return `${sign}${days}d${remH > 0 ? ` ${remH}h` : ""}`;
  }
  if (hours > 0) {
    const remM = minutes % 60;
    return `${sign}${hours}h${remM > 0 ? ` ${remM}m` : ""}`;
  }
  if (minutes > 0) {
    const remS = seconds % 60;
    return `${sign}${minutes}m${remS > 0 ? ` ${remS}s` : ""}`;
  }
  return `${sign}${seconds}s`;
}
