import type { InternalConsoleRole } from "./roles";

/**
 * Canonical nav structure for the internal console (KIN-797).
 *
 * Sections group items visually in the sidebar. Within a section, items
 * render in the order declared here. `allowedRoles` gates each item.
 *
 * This list is the static source of truth. The `listNavForCurrentUser`
 * Convex query reads it, role-filters it, and returns the result to the
 * client. Custom dynamic entries live in the `adminNavItems` Convex table
 * (empty by default) and are merged in server-side.
 */

export type NavSection =
  | "overview"
  | "queues"
  | "metrics"
  | "tools"
  | "settings";

export interface NavItem {
  slug: string;
  label: string;
  href: string;
  section: NavSection;
  allowedRoles: readonly InternalConsoleRole[];
  description?: string;
}

export const NAV_SECTION_ORDER: readonly NavSection[] = [
  "overview",
  "queues",
  "metrics",
  "tools",
  "settings",
];

export const NAV_SECTION_LABELS: Readonly<Record<NavSection, string>> = {
  overview: "Overview",
  queues: "Review queues",
  metrics: "Metrics",
  tools: "Ops tools",
  settings: "Settings",
};

export const STATIC_NAV_ITEMS: readonly NavItem[] = [
  {
    slug: "console",
    label: "Console",
    href: "/console",
    section: "overview",
    allowedRoles: ["broker", "admin"],
    description: "Ops home — daily queue snapshot and recent activity",
  },
  {
    slug: "queues",
    label: "Review queues",
    href: "/queues",
    section: "queues",
    allowedRoles: ["broker", "admin"],
    description: "Intake, offer, contract, and escalation review queues",
  },
  {
    slug: "closing",
    label: "Closing deals",
    href: "/console/closing",
    section: "queues",
    allowedRoles: ["broker", "admin"],
    description:
      "Active under-contract and closing deals with stuck-deal signals",
  },
  {
    slug: "metrics",
    label: "KPI dashboard",
    href: "/metrics",
    section: "metrics",
    allowedRoles: ["broker", "admin"],
    description: "Funnel KPIs, deal room engagement, conversion metrics",
  },
  {
    slug: "overrides",
    label: "Manual overrides",
    href: "/overrides",
    section: "tools",
    allowedRoles: ["admin"],
    description: "Audited manual changes to buyer, offer, and contract state",
  },
  {
    slug: "notes",
    label: "Internal notes",
    href: "/notes",
    section: "tools",
    allowedRoles: ["broker", "admin"],
    description: "Buyer-hidden notes attached to properties and deals",
  },
  {
    slug: "sms",
    label: "SMS activity",
    href: "/console/sms",
    section: "tools",
    allowedRoles: ["broker", "admin"],
    description: "Inbound SMS intake, delivery state, and manual re-parse tools",
  },
  {
    slug: "settings",
    label: "Settings",
    href: "/settings",
    section: "settings",
    allowedRoles: ["admin"],
    description: "Feature flags, thresholds, and broker-tunable knobs",
  },
];

/** True iff `role` is allowed to see `item` in the sidebar. */
export function isNavItemAllowedForRole(
  item: Pick<NavItem, "allowedRoles">,
  role: InternalConsoleRole,
): boolean {
  return item.allowedRoles.includes(role);
}

/** Filter a nav item list to only items `role` can see, preserving order. */
export function filterNavItemsForRole<T extends Pick<NavItem, "allowedRoles">>(
  items: readonly T[],
  role: InternalConsoleRole,
): T[] {
  return items.filter((item) => isNavItemAllowedForRole(item, role));
}

/**
 * Group nav items by section, preserving `NAV_SECTION_ORDER`. Empty
 * sections are omitted so we never render an empty header.
 */
export function groupNavItemsBySection<T extends Pick<NavItem, "section">>(
  items: readonly T[],
): Array<{ section: NavSection; label: string; items: T[] }> {
  const bySection = new Map<NavSection, T[]>();
  for (const item of items) {
    const bucket = bySection.get(item.section) ?? [];
    bucket.push(item);
    bySection.set(item.section, bucket);
  }
  return NAV_SECTION_ORDER.flatMap((section) => {
    const sectionItems = bySection.get(section);
    if (!sectionItems || sectionItems.length === 0) return [];
    return [
      {
        section,
        label: NAV_SECTION_LABELS[section],
        items: sectionItems,
      },
    ];
  });
}

/**
 * Match the currently-active nav item from a pathname. Prefers the
 * longest matching `href` prefix so `/queues/foo` highlights `Queues`
 * rather than `Console`. Returns `null` if nothing matches — e.g. on
 * the access-denied page.
 */
export function findActiveNavSlug<T extends Pick<NavItem, "slug" | "href">>(
  items: readonly T[],
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  let best: { slug: string; length: number } | null = null;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) {
        best = { slug: item.slug, length: item.href.length };
      }
    }
  }
  return best?.slug ?? null;
}
