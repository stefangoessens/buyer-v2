import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/session";

/**
 * Buyer close dashboard aggregation layer (KIN-793).
 *
 * READ-ONLY on top of contractMilestones and contracts. The grouping,
 * urgency, and weekly-plan logic lives in a pure module at
 * src/lib/dealroom/close-dashboard-logic.ts so it's fully unit-testable
 * and shareable with the iOS client. This file only wires the data flow:
 * auth → query milestones → run the pure builder → return it.
 */

type AccessLevel = "buyer" | "broker" | "admin" | null;

async function dealRoomAccessLevel(
  ctx: any,
  dealRoom: any,
): Promise<{ user: any; level: AccessLevel }> {
  const user = await getCurrentUser(ctx);
  if (!user) return { user: null, level: null };
  if (dealRoom.buyerId === user._id) return { user, level: "buyer" };
  if (user.role === "broker") return { user, level: "broker" };
  if (user.role === "admin") return { user, level: "admin" };
  return { user, level: null };
}

function projectMilestonesForViewer(milestones: any[], level: AccessLevel) {
  const visibleMilestones =
    level === "buyer"
      ? milestones.filter((m) => m.status !== "needs_review")
      : milestones;

  return visibleMilestones.map((m) => ({
    _id: m._id,
    name: m.name,
    workstream: m.workstream,
    dueDate: m.dueDate,
    status: m.status,
    completedAt: m.completedAt ?? undefined,
  }));
}

export const getDashboard = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    const { level } = await dealRoomAccessLevel(ctx, dealRoom);
    if (!level) return null;

    const property = await ctx.db.get(dealRoom.propertyId);
    if (!property) return null;

    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const activeContract =
      contracts.find((c) => c.status === "fully_executed") ??
      contracts[contracts.length - 1] ??
      null;

    const milestones = await ctx.db
      .query("contractMilestones")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const buyerSafeMilestones = projectMilestonesForViewer(milestones, level);

    const { buildCloseDashboard } = await import(
      "../src/lib/dealroom/close-dashboard-logic"
    );

    // Derive the close date from the live milestone set rather than the
    // legacy optional `activeContract.milestones` field (which is rarely
    // populated). Preference order: earliest pending "closing" workstream
    // milestone, then any pending milestone whose name contains "clos".
    const closingWorkstreamMilestones = buyerSafeMilestones
      .filter((m) => m.workstream === "closing" && m.status !== "completed")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const nameCloseMatch = buyerSafeMilestones.find(
      (m) =>
        m.status !== "completed" &&
        typeof m.name === "string" &&
        m.name.toLowerCase().includes("clos"),
    );
    const closeDate =
      closingWorkstreamMilestones[0]?.dueDate ??
      nameCloseMatch?.dueDate ??
      null;

    const address = property.address.formatted ??
      `${property.address.street}${property.address.unit ? ` ${property.address.unit}` : ""}, ${property.address.city}, ${property.address.state} ${property.address.zip}`;

    const dashboard = buildCloseDashboard({
      dealRoomId: args.dealRoomId,
      propertyAddress: address,
      closeDate,
      milestones: buyerSafeMilestones,
      now: new Date().toISOString(),
    });

    return {
      ...dashboard,
      viewerLevel: level,
      contractStatus: activeContract?.status ?? null,
    };
  },
});

export const getWeeklyPlan = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;
    const { level } = await dealRoomAccessLevel(ctx, dealRoom);
    if (!level) return null;

    const milestones = await ctx.db
      .query("contractMilestones")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const safe = projectMilestonesForViewer(milestones, level);

    const { buildWeeklyPlan, toCloseDashboardMilestone } = await import(
      "../src/lib/dealroom/close-dashboard-logic"
    );

    const now = new Date().toISOString();
    const projected = safe.map((m) => toCloseDashboardMilestone(m, now));
    return buildWeeklyPlan(projected, now);
  },
});
