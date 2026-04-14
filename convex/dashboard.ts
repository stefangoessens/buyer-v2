// ═══════════════════════════════════════════════════════════════════════════
// Buyer Dashboard Deal Index (KIN-842)
//
// Typed query surface that returns a buyer's active and recent deal rooms
// plus summary badges. The dashboard UI consumes this directly — it does
// NOT join tables client-side because:
//   1. Role-based field filtering belongs at the boundary
//   2. The deal row shape is stable across web and iOS
//   3. The summary badges (most urgent, oldest active) need all rows to
//      compute, so doing it server-side avoids N queries
//
// Buyer-facing rows strip internal fields via the pure `buildDealIndex`
// helper — the boundary has a single choke point where policy is applied.
// ═══════════════════════════════════════════════════════════════════════════

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/session";
import {
  buildDealIndex,
  type DealStatus,
  type RawDealRoom,
  type RawProperty,
  type DashboardDealIndex,
  TERMINAL_STATUSES,
} from "./lib/dashboardDealIndex";
import {
  JOURNEY_STEP_INDEX,
  JOURNEY_STEP_LABEL,
  labelForJourneyStatus,
  projectNextAction,
  percentCompleteForStatus,
} from "./lib/journeyProjection";
import { composeBuyerEventFeed } from "./lib/buyerEvents";
import type { BuyerEventReadModel } from "./lib/buyerEvents";
import { computeOfferEligibility } from "./lib/offerEligibilityCompute";

// ───────────────────────────────────────────────────────────────────────────
// Return value shape — mirrored as a Convex validator so the dashboard
// client gets strongly-typed results without guessing at the JSON.
// ───────────────────────────────────────────────────────────────────────────

const dashboardDealRowValidator = v.object({
  dealRoomId: v.string(),
  propertyId: v.string(),
  status: v.union(
    v.literal("intake"),
    v.literal("analysis"),
    v.literal("tour_scheduled"),
    v.literal("offer_prep"),
    v.literal("offer_sent"),
    v.literal("under_contract"),
    v.literal("closing"),
    v.literal("closed"),
    v.literal("withdrawn"),
  ),
  category: v.union(v.literal("active"), v.literal("recent")),
  urgencyRank: v.number(),
  addressLine: v.string(),
  listPrice: v.union(v.number(), v.null()),
  beds: v.union(v.number(), v.null()),
  baths: v.union(v.number(), v.null()),
  sqft: v.union(v.number(), v.null()),
  primaryPhotoUrl: v.union(v.string(), v.null()),
  accessLevel: v.union(
    v.literal("anonymous"),
    v.literal("registered"),
    v.literal("full"),
  ),
  updatedAt: v.string(),
  detailState: v.union(
    v.literal("loading"),
    v.literal("partial"),
    v.literal("complete"),
  ),
  missingFields: v.array(
    v.union(
      v.literal("listPrice"),
      v.literal("beds"),
      v.literal("baths"),
      v.literal("sqft"),
      v.literal("primaryPhoto"),
    ),
  ),
});

const dashboardIndexValidator = v.object({
  active: v.array(dashboardDealRowValidator),
  recent: v.array(dashboardDealRowValidator),
  summary: v.object({
    activeCount: v.number(),
    recentCount: v.number(),
    mostUrgentStatus: v.union(
      v.literal("intake"),
      v.literal("analysis"),
      v.literal("tour_scheduled"),
      v.literal("offer_prep"),
      v.literal("offer_sent"),
      v.literal("under_contract"),
      v.literal("closing"),
      v.literal("closed"),
      v.literal("withdrawn"),
      v.null(),
    ),
    oldestActiveDays: v.union(v.number(), v.null()),
    hasAnyDeals: v.boolean(),
    hasPartialDeals: v.boolean(),
    badges: v.array(
      v.object({
        kind: v.union(
          v.literal("active_count"),
          v.literal("recent_count"),
          v.literal("most_urgent"),
          v.literal("oldest_active"),
        ),
        label: v.string(),
        tone: v.union(
          v.literal("primary"),
          v.literal("neutral"),
          v.literal("warning"),
        ),
        value: v.string(),
        isEmpty: v.boolean(),
      }),
    ),
  }),
});

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/**
 * Get the buyer's dashboard deal index — active and recent deal rooms
 * plus summary badges. Buyers can only read their own; brokers/admins
 * can optionally pass `buyerId` to inspect another buyer's dashboard
 * for support scenarios.
 */
export const getDealIndex = query({
  args: { buyerId: v.optional(v.id("users")) },
  returns: dashboardIndexValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Resolve the target buyer: self by default; broker/admin can override.
    const targetBuyerId = args.buyerId ?? user._id;
    if (
      targetBuyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      // Unauthorized cross-buyer access — return an empty index instead
      // of throwing so the UI can render a "no access" state gracefully.
      const empty: DashboardDealIndex = {
        active: [],
        recent: [],
        summary: {
          activeCount: 0,
          recentCount: 0,
          mostUrgentStatus: null,
          oldestActiveDays: null,
          hasAnyDeals: false,
          hasPartialDeals: false,
          badges: [
            {
              kind: "active_count",
              label: "Active",
              tone: "neutral",
              value: "0",
              isEmpty: true,
            },
            {
              kind: "recent_count",
              label: "Recent",
              tone: "neutral",
              value: "0",
              isEmpty: true,
            },
            {
              kind: "most_urgent",
              label: "Most urgent",
              tone: "neutral",
              value: "None",
              isEmpty: true,
            },
            {
              kind: "oldest_active",
              label: "Oldest active",
              tone: "neutral",
              value: "None",
              isEmpty: true,
            },
          ],
        },
      };
      return empty;
    }

    // Pull all deal rooms for this buyer. Scoped query via the
    // `by_buyerId` index, no broader scan.
    const deals = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", targetBuyerId))
      .collect();

    // Shape deal rooms into the pure-TS input shape.
    const rawDeals: RawDealRoom[] = deals.map((d: Doc<"dealRooms">) => ({
      _id: d._id,
      propertyId: d.propertyId,
      buyerId: d.buyerId,
      status: d.status,
      accessLevel: d.accessLevel,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    // Fetch the linked properties in parallel. Missing properties
    // (e.g. still extracting) are fine — the row builder marks them
    // as `detailState: "loading"`.
    const propertyById = new Map<string, RawProperty>();
    const propertyIds = Array.from(new Set(deals.map((d) => d.propertyId)));
    const properties = await Promise.all(
      propertyIds.map((id) => ctx.db.get(id)),
    );
    for (const p of properties) {
      if (!p) continue;
      propertyById.set(p._id, {
        _id: p._id,
        canonicalId: p.canonicalId,
        address: {
          street: p.address.street,
          unit: p.address.unit,
          city: p.address.city,
          state: p.address.state,
          zip: p.address.zip,
          formatted: p.address.formatted,
        },
        listPrice: p.listPrice,
        beds: p.beds,
        bathsFull: p.bathsFull,
        bathsHalf: p.bathsHalf,
        sqftLiving: p.sqftLiving,
        photoUrls: p.photoUrls,
      });
    }

    return buildDealIndex(rawDeals, propertyById);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// /dashboard/journeys canonical projection (KIN-1082)
//
// `getJourneys` is the single reactive surface the new "My Journeys" screen
// consumes. Every row is a fully-baked projection with:
//   - buyer-facing status copy
//   - current step (1..5) and human label
//   - next action (label + href + severity)
//   - attention count + top reason (live events, offer eligibility, blocked
//     close tasks)
//   - archive state, priority, label
//
// The two views ("active" vs "archived") are mutually exclusive: a row is
// active when it's not archived AND not in a terminal status; otherwise it's
// archived. This keeps the UI filter pill behavior deterministic and avoids
// the edge case where a manually restored but closed deal shows up in both.
// ═══════════════════════════════════════════════════════════════════════════

const journeyPriorityValidator = v.union(
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

const journeyStatusValidator = v.union(
  v.literal("intake"),
  v.literal("analysis"),
  v.literal("tour_scheduled"),
  v.literal("offer_prep"),
  v.literal("offer_sent"),
  v.literal("under_contract"),
  v.literal("closing"),
  v.literal("closed"),
  v.literal("withdrawn"),
);

const journeyRowValidator = v.object({
  dealRoomId: v.string(),
  propertyId: v.string(),
  address: v.string(),
  cityState: v.string(),
  photoUrl: v.union(v.string(), v.null()),
  photoCount: v.number(),
  status: journeyStatusValidator,
  buyerFacingStatusLabel: v.string(),
  currentStep: v.number(),
  stepLabel: v.string(),
  percentComplete: v.number(),
  lastActivityAt: v.string(),
  nextActionLabel: v.string(),
  nextActionHref: v.string(),
  nextActionSeverity: v.union(
    v.literal("info"),
    v.literal("warning"),
    v.literal("error"),
  ),
  journeyPriority: journeyPriorityValidator,
  journeyLabel: v.union(v.string(), v.null()),
  attentionCount: v.number(),
  attentionLabel: v.union(v.string(), v.null()),
  topAttentionReason: v.union(v.string(), v.null()),
  archivedAt: v.union(v.string(), v.null()),
});

type JourneyRow = {
  dealRoomId: string;
  propertyId: string;
  address: string;
  cityState: string;
  photoUrl: string | null;
  photoCount: number;
  status: DealStatus;
  buyerFacingStatusLabel: string;
  currentStep: number;
  stepLabel: string;
  percentComplete: number;
  lastActivityAt: string;
  nextActionLabel: string;
  nextActionHref: string;
  nextActionSeverity: "info" | "warning" | "error";
  journeyPriority: "high" | "normal" | "low";
  journeyLabel: string | null;
  attentionCount: number;
  attentionLabel: string | null;
  topAttentionReason: string | null;
  archivedAt: string | null;
};

function formatCityState(addr: {
  city?: string;
  state?: string;
} | null | undefined): string {
  if (!addr) return "";
  const city = addr.city ?? "";
  const state = addr.state ?? "";
  if (city && state) return `${city}, ${state}`;
  return city || state;
}

function buyerEventAttentionReason(item: BuyerEventReadModel): string {
  switch (item.eventType) {
    case "tour_confirmed":
      return "Tour confirmed — confirm details";
    case "tour_canceled":
      return "Tour canceled — reschedule";
    case "tour_reminder":
      return "Upcoming tour reminder";
    case "agent_assigned":
      return "Agent assigned — review intro";
    case "offer_countered":
      return "Seller countered your offer";
    case "offer_accepted":
      return "Offer accepted — start closing";
    case "offer_rejected":
      return "Offer rejected — plan next move";
    case "agreement_received":
      return "Agreement ready for signature";
    case "agreement_signed_reminder":
      return "Sign your representation agreement";
    case "document_ready":
      return "New document ready to review";
    case "milestone_upcoming":
      return "Upcoming milestone";
    case "price_changed":
      return "Listing price changed";
    case "new_comp_arrived":
      return "New comps available";
    case "ai_analysis_ready":
      return "AI analysis ready";
    case "broker_message":
      return "New message from your broker";
  }
}

async function buildAttentionForDealRoom(
  ctx: { db: any },
  dealRoomId: Id<"dealRooms">,
  buyerId: Id<"users">,
  status: DealStatus,
): Promise<{
  attentionCount: number;
  topAttentionReason: string | null;
}> {
  let attentionCount = 0;
  let topAttentionReason: string | null = null;

  // 1. Unresolved buyer update events for this deal room — the canonical
  //    in-app attention surface. Events are `pending` or `seen` while live;
  //    `resolved` / `superseded` are excluded by selecting only `pending` +
  //    `seen` rows via the dealRoom/status index.
  const pendingEvents = await ctx.db
    .query("buyerUpdateEvents")
    .withIndex("by_dealRoomId_and_status", (q: any) =>
      q.eq("dealRoomId", dealRoomId).eq("status", "pending"),
    )
    .collect();
  const seenEvents = await ctx.db
    .query("buyerUpdateEvents")
    .withIndex("by_dealRoomId_and_status", (q: any) =>
      q.eq("dealRoomId", dealRoomId).eq("status", "seen"),
    )
    .collect();

  const liveEventRows = [...pendingEvents, ...seenEvents];
  if (liveEventRows.length > 0) {
    const storageRecords = liveEventRows.map((row: Doc<"buyerUpdateEvents">) => ({
      id: row._id,
      buyerId: row.buyerId,
      dealRoomId: row.dealRoomId,
      eventType: row.eventType,
      state: row.state ?? {
        kind: row.eventType,
        referenceId: row.dedupeKey.split(":").slice(1).join(":") || "",
      },
      dedupeKey: row.dedupeKey,
      status: row.status,
      priority: row.priority,
      emittedAt: row.emittedAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      dedupeCount: row.dedupeCount,
      lastDedupedAt: row.lastDedupedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
    const feed = composeBuyerEventFeed(storageRecords as any);
    attentionCount += feed.counts.live;
    if (feed.items.length > 0) {
      topAttentionReason = buyerEventAttentionReason(feed.items[0]);
    }
  }

  // 2. Offer lifecycle gating: if the buyer is in offer_prep or offer_sent
  //    and offer eligibility is blocked, that's actionable — they need to
  //    sign a representation agreement before the offer can move.
  if (status === "offer_prep" || status === "offer_sent") {
    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_dealRoomId", (q: any) => q.eq("dealRoomId", dealRoomId))
      .collect();
    const agreementSnapshots = agreements.map((a: Doc<"agreements">) => ({
      _id: a._id as string,
      dealRoomId: a.dealRoomId as string,
      buyerId: a.buyerId as string,
      type: a.type,
      status: a.status,
      signedAt: a.signedAt,
    }));
    const eligibility = computeOfferEligibility(
      agreementSnapshots,
      dealRoomId as unknown as string,
    );
    if (!eligibility.isEligible) {
      attentionCount += 1;
      if (!topAttentionReason) {
        topAttentionReason = eligibility.blockingReasonMessage;
      }
    }
  }

  // 3. Closing lifecycle gating: blocked close tasks signal a bottleneck the
  //    buyer needs to see before landing on the /closing wizard.
  if (status === "under_contract" || status === "closing") {
    const blockedTasks = await ctx.db
      .query("closeTasks")
      .withIndex("by_dealRoomId_and_status", (q: any) =>
        q.eq("dealRoomId", dealRoomId).eq("status", "blocked"),
      )
      .collect();
    if (blockedTasks.length > 0) {
      attentionCount += blockedTasks.length;
      if (!topAttentionReason) {
        const first = blockedTasks[0] as Doc<"closeTasks">;
        topAttentionReason = `Blocked: ${first.title}`;
      }
    }
  }

  // Silence the unused-warning on buyerId — we accept it for symmetry with
  // related helpers that DO use it, and to future-proof buyer-scoped lookups.
  void buyerId;

  return { attentionCount, topAttentionReason };
}

async function buildJourneyRow(
  ctx: { db: any },
  dealRoom: Doc<"dealRooms">,
): Promise<JourneyRow | null> {
  const property = await ctx.db.get(dealRoom.propertyId);
  if (!property) return null;

  const status = dealRoom.status;
  const { currentStep, nextAction } = projectNextAction(
    status,
    dealRoom.propertyId,
  );

  const stepIndex = JOURNEY_STEP_INDEX[status];
  const stepLabel = JOURNEY_STEP_LABEL[stepIndex] ?? "";

  const address =
    (property.address && property.address.formatted) ||
    (property.address && property.address.street) ||
    "Unknown";
  const cityState = formatCityState(property.address);

  const photoUrls: string[] = property.photoUrls ?? [];
  const photoUrl = photoUrls[0] ?? null;
  const photoCount =
    typeof property.photoCount === "number"
      ? property.photoCount
      : photoUrls.length;

  const attention = await buildAttentionForDealRoom(
    ctx,
    dealRoom._id,
    dealRoom.buyerId,
    status,
  );

  const attentionLabel: string | null =
    attention.attentionCount === 0
      ? null
      : attention.attentionCount === 1
        ? "1 needs attention"
        : `${attention.attentionCount} need attention`;

  // Next-action severity is bumped to "error" when the journey has an
  // attention reason — gives the card a clear visual distinction between
  // "business as usual" and "needs you now".
  const severity: "info" | "warning" | "error" =
    attention.attentionCount > 0 &&
    (nextAction.severity === "info" || nextAction.severity === "warning")
      ? "error"
      : nextAction.severity;

  return {
    dealRoomId: dealRoom._id as string,
    propertyId: dealRoom.propertyId as string,
    address,
    cityState,
    photoUrl,
    photoCount,
    status,
    buyerFacingStatusLabel: labelForJourneyStatus(status),
    currentStep: stepIndex,
    stepLabel,
    percentComplete: percentCompleteForStatus(status),
    lastActivityAt: dealRoom.updatedAt,
    nextActionLabel: nextAction.label,
    nextActionHref: nextAction.href,
    nextActionSeverity: severity,
    journeyPriority: dealRoom.journeyPriority ?? "normal",
    journeyLabel: dealRoom.journeyLabel ?? null,
    attentionCount: attention.attentionCount,
    attentionLabel,
    topAttentionReason: attention.topAttentionReason,
    archivedAt: dealRoom.archivedAt ?? null,
  };
}

export const getJourneys = query({
  args: {
    view: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    buyerId: v.optional(v.id("users")),
  },
  returns: v.array(journeyRowValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const view = args.view ?? "active";

    const targetBuyerId = args.buyerId ?? user._id;
    if (
      targetBuyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return [];
    }

    const dealRooms = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", targetBuyerId))
      .collect();

    const rows: JourneyRow[] = [];
    for (const dr of dealRooms) {
      const row = await buildJourneyRow(ctx, dr);
      if (!row) continue;
      const isTerminal = TERMINAL_STATUSES.includes(row.status);
      const isArchived = row.archivedAt !== null || isTerminal;
      if (view === "active" && !isArchived) rows.push(row);
      if (view === "archived" && isArchived) rows.push(row);
    }

    rows.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    return rows;
  },
});
