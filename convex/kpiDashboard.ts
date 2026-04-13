/**
 * convex/kpiDashboard.ts — KIN-800 Internal KPI dashboard backend.
 *
 * Typed queries that compute every metric used by the dashboard. The
 * client never recomputes metrics — it just renders what this file
 * returns.
 *
 * Metric values come from a blend of two sources:
 *   1. Precomputed rows in `kpiSnapshots` (preferred) — when an offline
 *      worker populates the table, we pick the latest snapshot that
 *      falls inside the requested range.
 *   2. On-demand aggregates from the canonical event/state tables —
 *      `leadAttribution`, `dealRooms`, `tours`, `offers`,
 *      `opsReviewQueueItems`, `aiEngineOutputs`. Used when there is no
 *      precomputed snapshot for the metric key.
 *
 * Access is role-gated (broker or admin). The catalog of metric keys
 * lives in `src/lib/admin/kpiCatalog.ts` and is duplicated as a
 * constant below so the Convex bundle stays self-contained.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { type QueryCtx } from "./_generated/server";
import { buildLeadAttributionReadModel } from "./lib/leadAttribution";
import { requireAuth } from "./lib/session";

// ─── range + metric validators ──────────────────────────────────────────────

const rangeValidator = v.object({
  start: v.string(),
  end: v.string(),
});

const metricValueValidator = v.object({
  key: v.string(),
  label: v.string(),
  category: v.union(
    v.literal("funnel"),
    v.literal("engagement"),
    v.literal("ops"),
    v.literal("ai"),
  ),
  unit: v.union(
    v.literal("count"),
    v.literal("percent"),
    v.literal("duration_ms"),
    v.literal("currency_usd"),
  ),
  direction: v.union(
    v.literal("higher_better"),
    v.literal("lower_better"),
    v.literal("neutral"),
  ),
  value: v.union(v.number(), v.null()),
  previousValue: v.union(v.number(), v.null()),
  source: v.union(v.literal("snapshot"), v.literal("computed"), v.literal("unavailable")),
});

// ─── metric catalog (duplicated from src/lib/admin/kpiCatalog.ts) ──────────

type MetricCategory = "funnel" | "engagement" | "ops" | "ai";
type MetricUnit = "count" | "percent" | "duration_ms" | "currency_usd";
type MetricDirection = "higher_better" | "lower_better" | "neutral";

interface MetricDef {
  key: string;
  label: string;
  category: MetricCategory;
  unit: MetricUnit;
  direction: MetricDirection;
}

const METRICS: readonly MetricDef[] = [
  {
    key: "funnel.visits",
    label: "Unique visits",
    category: "funnel",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "funnel.paste_link_submissions",
    label: "Paste-a-link submissions",
    category: "funnel",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "funnel.registrations",
    label: "Registrations",
    category: "funnel",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "funnel.registration_rate",
    label: "Registration rate",
    category: "funnel",
    unit: "percent",
    direction: "higher_better",
  },
  {
    key: "engagement.deal_rooms_created",
    label: "Deal rooms created",
    category: "engagement",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "engagement.tours_requested",
    label: "Tours requested",
    category: "engagement",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "engagement.offers_submitted",
    label: "Offers submitted",
    category: "engagement",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "engagement.deal_room_to_offer_rate",
    label: "Deal room → offer rate",
    category: "engagement",
    unit: "percent",
    direction: "higher_better",
  },
  {
    key: "ops.queue_items_resolved",
    label: "Queue items resolved",
    category: "ops",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "ops.queue_items_opened",
    label: "Queue items opened",
    category: "ops",
    unit: "count",
    direction: "neutral",
  },
  {
    key: "ops.avg_queue_resolution_ms",
    label: "Avg resolution time",
    category: "ops",
    unit: "duration_ms",
    direction: "lower_better",
  },
  {
    key: "ai.engine_outputs_generated",
    label: "AI engine outputs",
    category: "ai",
    unit: "count",
    direction: "higher_better",
  },
  {
    key: "ai.engine_review_rate",
    label: "Needs-review rate",
    category: "ai",
    unit: "percent",
    direction: "lower_better",
  },
];

// ─── helpers ────────────────────────────────────────────────────────────────

async function requireInternalUser(ctx: QueryCtx) {
  const user = await requireAuth(ctx);
  if (user.role !== "broker" && user.role !== "admin") {
    throw new Error("Internal console access required");
  }
  return user;
}

function withinRange(iso: string, startMs: number, endMs: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startMs && t < endMs;
}

function previousRange(start: string, end: string): { startMs: number; endMs: number } {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const span = Math.max(0, e - s);
  return { startMs: s - span, endMs: s };
}

// ─── metric computation ────────────────────────────────────────────────────

async function computeMetric(
  ctx: QueryCtx,
  metric: MetricDef,
  startMs: number,
  endMs: number,
): Promise<number | null> {
  switch (metric.key) {
    case "funnel.visits": {
      const rows = await ctx.db.query("leadAttribution").collect();
      const visits = rows.map((row) => buildLeadAttributionReadModel(row));
      return visits.filter((visit) => withinRange(visit.createdAt, startMs, endMs))
        .length;
    }
    case "funnel.paste_link_submissions": {
      // sourceListings created during the window approximate paste-a-link
      // submissions one-to-one.
      const rows = await ctx.db.query("sourceListings").collect();
      return rows.filter((r) => {
        const created = (r as unknown as { _creationTime: number })._creationTime;
        return created >= startMs && created < endMs;
      }).length;
    }
    case "funnel.registrations": {
      const rows = await ctx.db.query("leadAttribution").collect();
      const visits = rows.map((row) => buildLeadAttributionReadModel(row));
      return visits.filter(
        (visit) =>
          visit.status !== "anonymous" &&
          visit.registeredAt !== undefined &&
          withinRange(visit.registeredAt, startMs, endMs),
      ).length;
    }
    case "funnel.registration_rate": {
      const rows = await ctx.db.query("leadAttribution").collect();
      const visits = rows.map((row) => buildLeadAttributionReadModel(row));
      const inWindow = visits.filter((visit) =>
        withinRange(visit.createdAt, startMs, endMs)
      );
      const registered = inWindow.filter(
        (visit) => visit.status !== "anonymous",
      ).length;
      if (inWindow.length === 0) return 0;
      return registered / inWindow.length;
    }
    case "engagement.deal_rooms_created": {
      const rows = await ctx.db.query("dealRooms").collect();
      return rows.filter((r) => {
        const created = (r as unknown as { _creationTime: number })._creationTime;
        return created >= startMs && created < endMs;
      }).length;
    }
    case "engagement.tours_requested": {
      const rows = await ctx.db.query("tours").collect();
      return rows.filter((r) => {
        const created = (r as unknown as { _creationTime: number })._creationTime;
        return created >= startMs && created < endMs;
      }).length;
    }
    case "engagement.offers_submitted": {
      const rows = await ctx.db.query("offers").collect();
      return rows.filter((r) => {
        const created = (r as unknown as { _creationTime: number })._creationTime;
        return created >= startMs && created < endMs;
      }).length;
    }
    case "engagement.deal_room_to_offer_rate": {
      const dealRooms = await ctx.db.query("dealRooms").collect();
      const offers = await ctx.db.query("offers").collect();
      const newRooms = dealRooms.filter((r) => {
        const created = (r as unknown as { _creationTime: number })._creationTime;
        return created >= startMs && created < endMs;
      });
      if (newRooms.length === 0) return 0;
      const roomIds = new Set(newRooms.map((r) => r._id));
      const matchedOffers = offers.filter(
        (o) =>
          roomIds.has(
            (o as unknown as { dealRoomId: typeof newRooms[number]["_id"] }).dealRoomId,
          ),
      );
      const uniqueRooms = new Set(
        matchedOffers.map(
          (o) => (o as unknown as { dealRoomId: string }).dealRoomId,
        ),
      );
      return uniqueRooms.size / newRooms.length;
    }
    case "ops.queue_items_resolved": {
      const rows = await ctx.db
        .query("opsReviewQueueItems")
        .withIndex("by_status_and_priority", (q) => q.eq("status", "resolved"))
        .collect();
      return rows.filter(
        (r) => r.resolvedAt !== undefined && withinRange(r.resolvedAt, startMs, endMs),
      ).length;
    }
    case "ops.queue_items_opened": {
      const rows = await ctx.db.query("opsReviewQueueItems").collect();
      return rows.filter((r) => withinRange(r.openedAt, startMs, endMs)).length;
    }
    case "ops.avg_queue_resolution_ms": {
      const rows = await ctx.db
        .query("opsReviewQueueItems")
        .withIndex("by_status_and_priority", (q) => q.eq("status", "resolved"))
        .collect();
      const resolved = rows.filter(
        (r) => r.resolvedAt !== undefined && withinRange(r.resolvedAt, startMs, endMs),
      );
      if (resolved.length === 0) return null;
      let total = 0;
      let count = 0;
      for (const row of resolved) {
        const open = new Date(row.openedAt).getTime();
        const done = new Date(row.resolvedAt!).getTime();
        if (!Number.isNaN(open) && !Number.isNaN(done) && done >= open) {
          total += done - open;
          count++;
        }
      }
      if (count === 0) return null;
      return total / count;
    }
    case "ai.engine_outputs_generated": {
      const rows = await ctx.db.query("aiEngineOutputs").collect();
      return rows.filter((r) => {
        const created = (r as unknown as { _creationTime: number })._creationTime;
        return created >= startMs && created < endMs;
      }).length;
    }
    case "ai.engine_review_rate": {
      const rows = await ctx.db.query("aiEngineOutputs").collect();
      const inWindow = rows.filter((r) => {
        const created = (r as unknown as { _creationTime: number })._creationTime;
        return created >= startMs && created < endMs;
      });
      if (inWindow.length === 0) return 0;
      const needingReview = inWindow.filter(
        (r) =>
          (r as unknown as { reviewState: string }).reviewState === "pending",
      ).length;
      return needingReview / inWindow.length;
    }
    default:
      return null;
  }
}

async function resolveMetric(
  ctx: QueryCtx,
  metric: MetricDef,
  startMs: number,
  endMs: number,
): Promise<{ value: number | null; source: "snapshot" | "computed" | "unavailable" }> {
  // Prefer precomputed snapshots when the metric has a row in
  // kpiSnapshots for any bucketStart inside the window. Pick the latest
  // one inside the window by computedAt.
  const snapshots = await ctx.db
    .query("kpiSnapshots")
    .withIndex("by_metric_and_bucketStart", (q) => q.eq("metricKey", metric.key))
    .collect();
  const candidates = snapshots.filter((s) => {
    const t = new Date(s.bucketStart).getTime();
    return !Number.isNaN(t) && t >= startMs && t < endMs;
  });
  if (candidates.length > 0) {
    candidates.sort(
      (a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime(),
    );
    return { value: candidates[0]!.value, source: "snapshot" };
  }

  try {
    const value = await computeMetric(ctx, metric, startMs, endMs);
    return { value, source: value === null ? "unavailable" : "computed" };
  } catch {
    return { value: null, source: "unavailable" };
  }
}

// ─── queries ────────────────────────────────────────────────────────────────

/**
 * Full dashboard payload for the given range. Includes every metric in
 * the catalog, plus a parallel "previous range" value so the UI can
 * render delta indicators without a second round trip.
 */
export const getDashboard = query({
  args: {
    range: rangeValidator,
  },
  returns: v.object({
    range: rangeValidator,
    previousRange: rangeValidator,
    metrics: v.array(metricValueValidator),
    latestSnapshotAt: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireInternalUser(ctx);

    const startMs = new Date(args.range.start).getTime();
    const endMs = new Date(args.range.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      throw new Error("Invalid date range");
    }
    const { startMs: prevStartMs, endMs: prevEndMs } = previousRange(
      args.range.start,
      args.range.end,
    );

    const metrics: Array<typeof metricValueValidator.type> = [];
    for (const metric of METRICS) {
      const [current, previous] = await Promise.all([
        resolveMetric(ctx, metric, startMs, endMs),
        resolveMetric(ctx, metric, prevStartMs, prevEndMs),
      ]);
      metrics.push({
        key: metric.key,
        label: metric.label,
        category: metric.category,
        unit: metric.unit,
        direction: metric.direction,
        value: current.value,
        previousValue: previous.value,
        source: current.source,
      });
    }

    const latest = await ctx.db
      .query("kpiSnapshots")
      .withIndex("by_computedAt")
      .order("desc")
      .take(1);

    return {
      range: args.range,
      previousRange: {
        start: new Date(prevStartMs).toISOString(),
        end: new Date(prevEndMs).toISOString(),
      },
      metrics,
      latestSnapshotAt: latest[0]?.computedAt ?? null,
    };
  },
});

/**
 * Lightweight query returning only the metric catalog (no values).
 * Used by the filter UI so the client can show placeholders while the
 * full dashboard payload loads.
 */
export const getCatalog = query({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      category: v.union(
        v.literal("funnel"),
        v.literal("engagement"),
        v.literal("ops"),
        v.literal("ai"),
      ),
      unit: v.union(
        v.literal("count"),
        v.literal("percent"),
        v.literal("duration_ms"),
        v.literal("currency_usd"),
      ),
      direction: v.union(
        v.literal("higher_better"),
        v.literal("lower_better"),
        v.literal("neutral"),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireInternalUser(ctx);
    return METRICS.map((m) => ({
      key: m.key,
      label: m.label,
      category: m.category,
      unit: m.unit,
      direction: m.direction,
    }));
  },
});
