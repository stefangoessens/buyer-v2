/**
 * Shared date-range model for the internal KPI dashboard (KIN-800).
 *
 * Ranges are represented as half-open [start, end) windows in ISO
 * date-time strings so both the backend query and the client URL can
 * use the exact same representation. Helpers below snap human-friendly
 * presets (last 7 / 30 / 90 days, this quarter, custom) to deterministic
 * start/end pairs so the same preset always hits the same cache key.
 */

export const DATE_RANGE_PRESETS = [
  "last_7d",
  "last_30d",
  "last_90d",
  "quarter_to_date",
  "year_to_date",
  "custom",
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABELS: Readonly<Record<DateRangePreset, string>> = {
  last_7d: "Last 7 days",
  last_30d: "Last 30 days",
  last_90d: "Last 90 days",
  quarter_to_date: "Quarter to date",
  year_to_date: "Year to date",
  custom: "Custom range",
};

export interface DateRange {
  /** Inclusive start, ISO-8601 UTC. */
  start: string;
  /** Exclusive end, ISO-8601 UTC. */
  end: string;
  preset: DateRangePreset;
}

/** Type guard for the preset string coming off URL params. */
export function isDateRangePreset(value: string): value is DateRangePreset {
  return (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function startOfQuarter(d: Date): Date {
  const month = d.getUTCMonth();
  const qStartMonth = Math.floor(month / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), qStartMonth, 1));
}

function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

/**
 * Resolve a preset (optionally with explicit custom start/end) to a
 * concrete half-open range. `now` is injected so tests can pin the
 * clock. The `end` is always the start of the next day after `now`,
 * giving a consistent "up through today, exclusive tomorrow" window.
 */
export function resolveDateRange(
  preset: DateRangePreset,
  now: Date,
  custom?: { start?: string; end?: string },
): DateRange {
  const today = startOfDayUTC(now);
  const endBoundary = addDays(today, 1);
  const endIso = endBoundary.toISOString();

  if (preset === "custom" && custom) {
    const s = custom.start ? new Date(custom.start) : today;
    const e = custom.end ? new Date(custom.end) : endBoundary;
    const startValid = !Number.isNaN(s.getTime());
    const endValid = !Number.isNaN(e.getTime());
    const start = startValid ? startOfDayUTC(s).toISOString() : today.toISOString();
    const end = endValid ? e.toISOString() : endIso;
    return { start, end, preset: "custom" };
  }

  switch (preset) {
    case "last_7d":
      return {
        start: addDays(today, -6).toISOString(),
        end: endIso,
        preset,
      };
    case "last_30d":
      return {
        start: addDays(today, -29).toISOString(),
        end: endIso,
        preset,
      };
    case "last_90d":
      return {
        start: addDays(today, -89).toISOString(),
        end: endIso,
        preset,
      };
    case "quarter_to_date":
      return {
        start: startOfQuarter(today).toISOString(),
        end: endIso,
        preset,
      };
    case "year_to_date":
      return {
        start: startOfYear(today).toISOString(),
        end: endIso,
        preset,
      };
    case "custom":
      // No custom overrides → fall back to last_30d. We prefer an
      // opinionated default over showing an empty dashboard.
      return {
        start: addDays(today, -29).toISOString(),
        end: endIso,
        preset: "custom",
      };
  }
}

/** True iff `iso` falls inside the half-open [start, end) window. */
export function isWithinRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const s = new Date(range.start).getTime();
  const e = new Date(range.end).getTime();
  return t >= s && t < e;
}

/** Days between start and end; fractional days always rounded up. */
export function rangeDayCount(range: DateRange): number {
  const s = new Date(range.start).getTime();
  const e = new Date(range.end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.ceil((e - s) / (24 * 60 * 60 * 1000));
}

/**
 * Human-friendly label, "Apr 5 → Apr 12". Kept compact because the
 * topbar only has ~200px for it.
 */
export function formatRangeLabel(range: DateRange): string {
  const s = new Date(range.start);
  const e = new Date(range.end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const endInclusive = addDays(e, -1);
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${fmt.format(s)} → ${fmt.format(endInclusive)}`;
}

/** Parse a range from URL search params. Unknown presets become last_30d. */
export function parseRangeFromSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  now: Date,
): DateRange {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const rawPreset = get("range");
  const preset: DateRangePreset = rawPreset && isDateRangePreset(rawPreset)
    ? rawPreset
    : "last_30d";
  if (preset === "custom") {
    return resolveDateRange(preset, now, {
      start: get("from"),
      end: get("to"),
    });
  }
  return resolveDateRange(preset, now);
}

/** Serialize a range back to a URL-safe object. */
export function rangeToSearchParams(range: DateRange): Record<string, string> {
  if (range.preset === "last_30d") return {};
  if (range.preset === "custom") {
    return { range: "custom", from: range.start, to: range.end };
  }
  return { range: range.preset };
}
