/**
 * convex/adminShell.ts — KIN-797 Internal Console Shell backend.
 *
 * Single entry point the Next.js admin layout queries on every mount.
 * Returns the current user, their role-filtered nav, and a compact
 * at-a-glance snapshot of queue/metrics health. Non-internal users
 * (buyers, logged-out visitors) get a `null` session so the client
 * shows the access-denied surface instead of leaking data.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/session";

// ─── canonical static nav ────────────────────────────────────────────────────
// Keep in sync with src/lib/admin/nav.ts (STATIC_NAV_ITEMS). We deliberately
// duplicate the list here rather than cross-import — Convex server code runs
// in a separate bundle and we do not want to pull in `@/lib/admin` via the
// web alias. Schema is tiny and code review catches drift.

type InternalRole = "broker" | "admin";

interface StaticNavItem {
  slug: string;
  label: string;
  href: string;
  section: "overview" | "queues" | "metrics" | "tools" | "settings";
  allowedRoles: InternalRole[];
  description?: string;
}

const STATIC_NAV: StaticNavItem[] = [
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
    slug: "settings",
    label: "Settings",
    href: "/settings",
    section: "settings",
    allowedRoles: ["admin"],
    description: "Feature flags, thresholds, and broker-tunable knobs",
  },
];

const navItemValidator = v.object({
  slug: v.string(),
  label: v.string(),
  href: v.string(),
  section: v.union(
    v.literal("overview"),
    v.literal("queues"),
    v.literal("metrics"),
    v.literal("tools"),
    v.literal("settings"),
  ),
  allowedRoles: v.array(v.union(v.literal("broker"), v.literal("admin"))),
  description: v.optional(v.string()),
});

const sessionUserValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
  role: v.union(v.literal("broker"), v.literal("admin")),
});

const snapshotValidator = v.object({
  openReviewItems: v.number(),
  urgentReviewItems: v.number(),
  latestKpiComputedAt: v.union(v.string(), v.null()),
  pendingOverrideCount: v.number(),
});

const sessionValidator = v.object({
  user: sessionUserValidator,
  navItems: v.array(navItemValidator),
  snapshot: snapshotValidator,
});

/**
 * Primary admin shell query. Returns:
 *   - `null` for any caller who cannot access the console (unauthenticated,
 *     buyer role, unknown user). The client treats `null` as access denied.
 *   - The current user (name/email/role), their role-filtered nav items
 *     (static + custom dynamic entries from `adminNavItems`), and a compact
 *     snapshot for the topbar and overview page.
 *
 * All data is computed server-side. The UI never recomputes role gating.
 */
export const getCurrentSession = query({
  args: {},
  returns: v.union(sessionValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    if (user.role !== "broker" && user.role !== "admin") return null;
    const role: InternalRole = user.role;

    // Filter the static canonical list to this user's role.
    const staticFiltered = STATIC_NAV.filter((item) =>
      item.allowedRoles.includes(role),
    );

    // Merge dynamic nav items persisted in `adminNavItems` (empty by default).
    // We read the full table — ops sets are small (< 50 rows expected) — and
    // skip items the caller's role cannot see.
    const dynamic = await ctx.db.query("adminNavItems").collect();
    const dynamicFiltered = dynamic
      .filter((row) => !row.hidden)
      .filter((row) => row.allowedRoles.includes(role))
      .map((row): StaticNavItem => ({
        slug: row.slug,
        label: row.label,
        href: row.href,
        section: row.section,
        allowedRoles: row.allowedRoles,
      }))
      // Stable order: by section order, then by the row's `order` field.
      .sort((a, b) => a.label.localeCompare(b.label));

    const mergedBySlug = new Map<string, StaticNavItem>();
    for (const item of staticFiltered) mergedBySlug.set(item.slug, item);
    for (const item of dynamicFiltered) {
      if (!mergedBySlug.has(item.slug)) mergedBySlug.set(item.slug, item);
    }
    const navItems = Array.from(mergedBySlug.values());

    // Snapshot — cheap aggregates that power the topbar badge + overview
    // hero. Each lookup is O(index hit) and bounded.
    const openReviewItems = await ctx.db
      .query("opsReviewQueueItems")
      .withIndex("by_status_and_priority", (q) => q.eq("status", "open"))
      .collect();
    const urgent = openReviewItems.filter((row) => row.priority === "urgent");

    // Pick the globally-newest snapshot across every metric key via the
    // dedicated `by_computedAt` index. Using `by_metric_and_bucketStart`
    // here would order by metricKey first and return a stale timestamp
    // from the lexicographically-highest key.
    const latestKpi = await ctx.db
      .query("kpiSnapshots")
      .withIndex("by_computedAt")
      .order("desc")
      .take(1);

    // Overrides that have not yet been reversed count as "pending" for the
    // overview — ops uses this to check that every change has a matched
    // review entry in the audit log. We count the full unreversed set
    // rather than a capped window so older pending overrides never get
    // dropped and give operators a false "all clear" signal. The table
    // is small (manual overrides are rare) so a collect() is fine here;
    // KIN-799 will replace this with an indexed status field.
    const allOverrides = await ctx.db
      .query("manualOverrideRecords")
      .collect();
    const pendingOverrideCount = allOverrides.filter(
      (row) => !row.reversedAt,
    ).length;

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role,
      },
      navItems,
      snapshot: {
        openReviewItems: openReviewItems.length,
        urgentReviewItems: urgent.length,
        latestKpiComputedAt: latestKpi[0]?.computedAt ?? null,
        pendingOverrideCount,
      },
    };
  },
});

/**
 * Lightweight existence check. The Next.js layout can call this from a
 * server component in the future if we add an RSC path — it avoids
 * shipping user PII to the client just to answer "are you allowed in?".
 */
export const canAccessConsole = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;
    return user.role === "broker" || user.role === "admin";
  },
});
