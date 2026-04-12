/**
 * Formatting helpers for the internal console. Kept in `src/lib/admin`
 * so they can be imported by both client components and tests without
 * pulling in Next or Convex runtime deps.
 */

/** Format an ISO timestamp as "Apr 12, 3:04 PM" for console tables. */
export function formatConsoleTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Format a count with a singular/plural suffix, e.g. 1 → "1 item",
 * 4 → "4 items". Keeps route placeholders readable without i18n setup.
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  const label = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count.toLocaleString("en-US")} ${label}`;
}

/** Short role-scoped initials for the topbar avatar placeholder. */
export function initialsFromName(name: string | null | undefined): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}
