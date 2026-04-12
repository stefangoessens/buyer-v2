import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireAuth, requireRole } from "./lib/session";
import { assignmentStatus, routingPath } from "./lib/validators";

// ═══════════════════════════════════════════════════════════════════════════
// KIN-804 — Agent Coverage Registry & Tour Assignment Routing
//
// This module implements:
//   - Agent coverage registry (which agents serve which zips / areas)
//   - Tour assignment routing (network → showami → manual queue)
//   - Assignment lifecycle with auditable state transitions
//
// Conventions:
//   - All mutations are broker/admin scoped (buyers can read their own tour's
//     assignments via getAssignmentsByTour)
//   - Coverage area matching is performed in JS after collecting active agents
//     because `coverageAreas` is an array field and cannot be directly indexed.
//   - Every mutation writes an auditLog entry keyed to the entity it mutates.
// ═══════════════════════════════════════════════════════════════════════════

// ═══ Helpers (not exported as Convex functions) ═════════════════════════════

/**
 * Return active agent coverage records whose coverageAreas include the given
 * zip. Used by both `findAgentsForZip` (the public query) and the internal
 * routing logic of `assignTour`.
 */
async function findActiveAgentsForZipInternal(
  ctx: { db: { query: (name: "agentCoverage") => any } },
  zip: string,
): Promise<Doc<"agentCoverage">[]> {
  const actives = await ctx.db
    .query("agentCoverage")
    .withIndex("by_isActive", (q: any) => q.eq("isActive", true))
    .collect();

  return actives.filter((cov: Doc<"agentCoverage">) =>
    cov.coverageAreas.some((area) => area.zip === zip),
  );
}

// Valid assignment status transitions.
//   pending → confirmed → in_progress → completed
//   any non-terminal → canceled
const VALID_ASSIGNMENT_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "canceled"],
  confirmed: ["in_progress", "canceled"],
  in_progress: ["completed", "canceled"],
  completed: [],
  canceled: [],
};

// ═══ Queries ═════════════════════════════════════════════════════════════════

/** List all agents with isActive=true. Broker/admin only. */
export const listActiveAgents = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      return [];
    }

    return await ctx.db
      .query("agentCoverage")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();
  },
});

/**
 * Find all active agent coverage records whose coverageAreas include the given
 * zip code. Broker/admin only.
 */
export const findAgentsForZip = query({
  args: { zip: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      return [];
    }

    return await findActiveAgentsForZipInternal(ctx, args.zip);
  },
});

/** Get the coverage record for a specific agent. Broker/admin only. */
export const getAgentCoverage = query({
  args: { agentId: v.id("users") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      return null;
    }

    return await ctx.db
      .query("agentCoverage")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();
  },
});

/**
 * Get all assignments for a tour. A tour should generally have one current
 * assignment, but canceled/replaced assignments remain as history.
 *
 * Access:
 *   - Buyer can read assignments for their own tour
 *   - Broker/admin can read any tour's assignments
 */
export const getAssignmentsByTour = query({
  args: { tourId: v.id("tours") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const tour = await ctx.db.get(args.tourId);
    if (!tour) return [];

    const isOwner = tour.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isStaff) return [];

    return await ctx.db
      .query("tourAssignments")
      .withIndex("by_tourId", (q) => q.eq("tourId", args.tourId))
      .collect();
  },
});

/**
 * Get assignments for a specific agent, optionally filtered by status.
 * Broker/admin only.
 */
export const getAssignmentsByAgent = query({
  args: {
    agentId: v.id("users"),
    status: v.optional(assignmentStatus),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      return [];
    }

    if (args.status) {
      const status = args.status;
      return await ctx.db
        .query("tourAssignments")
        .withIndex("by_agentId_and_status", (q) =>
          q.eq("agentId", args.agentId).eq("status", status),
        )
        .collect();
    }

    return await ctx.db
      .query("tourAssignments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

// ═══ Mutations ═══════════════════════════════════════════════════════════════

/** Create a new agent coverage record. Broker/admin only. */
export const createCoverage = mutation({
  args: {
    agentId: v.id("users"),
    coverageAreas: v.array(
      v.object({
        zip: v.string(),
        city: v.optional(v.string()),
        county: v.optional(v.string()),
      }),
    ),
    isActive: v.boolean(),
    maxToursPerDay: v.optional(v.number()),
    fixedFeePerShowing: v.number(),
    brokerage: v.string(),
    brokerageId: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
  },
  returns: v.id("agentCoverage"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    // Verify agent user exists
    const agentUser = await ctx.db.get(args.agentId);
    if (!agentUser) throw new Error("Agent user not found");

    // Prevent duplicate coverage records for the same agent
    const existing = await ctx.db
      .query("agentCoverage")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();
    if (existing) {
      throw new Error(
        "Coverage record already exists for this agent. Use updateCoverage instead.",
      );
    }

    const now = new Date().toISOString();

    const coverageId = await ctx.db.insert("agentCoverage", {
      agentId: args.agentId,
      coverageAreas: args.coverageAreas,
      isActive: args.isActive,
      maxToursPerDay: args.maxToursPerDay,
      fixedFeePerShowing: args.fixedFeePerShowing,
      brokerage: args.brokerage,
      brokerageId: args.brokerageId,
      licenseNumber: args.licenseNumber,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agent_coverage_created",
      entityType: "agentCoverage",
      entityId: coverageId,
      details: JSON.stringify({
        agentId: args.agentId,
        brokerage: args.brokerage,
        isActive: args.isActive,
        fixedFeePerShowing: args.fixedFeePerShowing,
        zipCount: args.coverageAreas.length,
      }),
      timestamp: now,
    });

    return coverageId;
  },
});

/** Update an existing coverage record. Broker/admin only. */
export const updateCoverage = mutation({
  args: {
    coverageId: v.id("agentCoverage"),
    coverageAreas: v.optional(
      v.array(
        v.object({
          zip: v.string(),
          city: v.optional(v.string()),
          county: v.optional(v.string()),
        }),
      ),
    ),
    isActive: v.optional(v.boolean()),
    maxToursPerDay: v.optional(v.number()),
    fixedFeePerShowing: v.optional(v.number()),
    brokerage: v.optional(v.string()),
    brokerageId: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const existing = await ctx.db.get(args.coverageId);
    if (!existing) throw new Error("Coverage record not found");

    const now = new Date().toISOString();

    const patch: Partial<Doc<"agentCoverage">> = { updatedAt: now };
    if (args.coverageAreas !== undefined) patch.coverageAreas = args.coverageAreas;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.maxToursPerDay !== undefined) patch.maxToursPerDay = args.maxToursPerDay;
    if (args.fixedFeePerShowing !== undefined) {
      patch.fixedFeePerShowing = args.fixedFeePerShowing;
    }
    if (args.brokerage !== undefined) patch.brokerage = args.brokerage;
    if (args.brokerageId !== undefined) patch.brokerageId = args.brokerageId;
    if (args.licenseNumber !== undefined) patch.licenseNumber = args.licenseNumber;

    await ctx.db.patch(args.coverageId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agent_coverage_updated",
      entityType: "agentCoverage",
      entityId: args.coverageId,
      details: JSON.stringify({
        agentId: existing.agentId,
        changedFields: Object.keys(patch).filter((k) => k !== "updatedAt"),
      }),
      timestamp: now,
    });

    return null;
  },
});

/** Toggle an agent's active status. Broker/admin only. */
export const setAgentActive = mutation({
  args: {
    agentId: v.id("users"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const coverage = await ctx.db
      .query("agentCoverage")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .unique();
    if (!coverage) {
      throw new Error("No coverage record found for this agent");
    }

    const now = new Date().toISOString();

    await ctx.db.patch(coverage._id, {
      isActive: args.isActive,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: args.isActive ? "agent_activated" : "agent_deactivated",
      entityType: "agentCoverage",
      entityId: coverage._id,
      details: JSON.stringify({
        agentId: args.agentId,
        isActive: args.isActive,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Assign a tour to an agent via the network routing path.
 *
 * Routing logic:
 *   1. If `preferredAgentId` is provided, create a `manual` assignment to that
 *      agent (broker explicitly picked them).
 *   2. Otherwise, look up active agents whose coverage includes the tour's
 *      property zip, and assign the first match via the `network` path.
 *   3. If no network agents are available, throw an error — the caller must
 *      explicitly fall back to Showami or the manual queue via
 *      `recordAssignmentFromShowami` / `recordManualAssignment`. This keeps
 *      automatic assignment limited to the network path and leaves human-in-
 *      the-loop escalation explicit.
 *
 * Broker/admin only.
 */
export const assignTour = mutation({
  args: {
    tourId: v.id("tours"),
    dealRoomId: v.id("dealRooms"),
    preferredAgentId: v.optional(v.id("users")),
  },
  returns: v.id("tourAssignments"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");
    if (tour.dealRoomId !== args.dealRoomId) {
      throw new Error("Tour does not belong to the given deal room");
    }

    // Guard against duplicate active assignments.
    const existing = await ctx.db
      .query("tourAssignments")
      .withIndex("by_tourId", (q) => q.eq("tourId", args.tourId))
      .collect();
    const hasActive = existing.some(
      (a) => a.status !== "canceled" && a.status !== "completed",
    );
    if (hasActive) {
      throw new Error(
        "Tour already has an active assignment. Cancel it first before reassigning.",
      );
    }

    const now = new Date().toISOString();

    let chosenAgentId: Id<"users">;
    let chosenPath: "network" | "manual";

    if (args.preferredAgentId) {
      // Manual broker pick.
      const agentUser = await ctx.db.get(args.preferredAgentId);
      if (!agentUser) throw new Error("Preferred agent user not found");

      chosenAgentId = args.preferredAgentId;
      chosenPath = "manual";
    } else {
      // Auto-route via network.
      const property = await ctx.db.get(tour.propertyId);
      if (!property) throw new Error("Tour property not found");

      const zip = property.address.zip;
      const candidates = await findActiveAgentsForZipInternal(ctx, zip);

      if (candidates.length === 0) {
        throw new Error(
          `No active network agents cover zip ${zip}. Fall back to Showami via recordAssignmentFromShowami or route to the manual queue via recordManualAssignment.`,
        );
      }

      // Simple strategy: pick the first candidate. Future scope: load balance
      // against maxToursPerDay, brokerage diversity, tour count in flight.
      chosenAgentId = candidates[0].agentId;
      chosenPath = "network";
    }

    const assignmentId = await ctx.db.insert("tourAssignments", {
      tourId: args.tourId,
      agentId: chosenAgentId,
      routingPath: chosenPath,
      status: "pending",
      assignedAt: now,
    });

    // Mirror the agent onto the tour record for quick reads.
    await ctx.db.patch(args.tourId, { agentId: chosenAgentId });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_assigned",
      entityType: "tourAssignments",
      entityId: assignmentId,
      details: JSON.stringify({
        tourId: args.tourId,
        dealRoomId: args.dealRoomId,
        agentId: chosenAgentId,
        routingPath: chosenPath,
        preferred: args.preferredAgentId !== undefined,
      }),
      timestamp: now,
    });

    return assignmentId;
  },
});

/**
 * Explicitly record a Showami fallback assignment. This is used when the
 * network path returns no matches and the broker (or an integration worker)
 * hands the tour off to Showami. The `agentId` here is the user record that
 * represents the Showami-assigned agent (created by the integration layer),
 * and `showamiFallbackId` is the external Showami request ID for sync.
 *
 * Broker/admin only.
 */
export const recordAssignmentFromShowami = mutation({
  args: {
    tourId: v.id("tours"),
    showamiFallbackId: v.string(),
    agentId: v.id("users"),
    notes: v.optional(v.string()),
  },
  returns: v.id("tourAssignments"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");

    const agentUser = await ctx.db.get(args.agentId);
    if (!agentUser) throw new Error("Agent user not found");

    const now = new Date().toISOString();

    const assignmentId = await ctx.db.insert("tourAssignments", {
      tourId: args.tourId,
      agentId: args.agentId,
      routingPath: "showami",
      status: "pending",
      showamiFallbackId: args.showamiFallbackId,
      assignedAt: now,
      notes: args.notes,
    });

    // Mirror agent onto tour for canonical reads.
    await ctx.db.patch(args.tourId, { agentId: args.agentId });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_assigned_showami",
      entityType: "tourAssignments",
      entityId: assignmentId,
      details: JSON.stringify({
        tourId: args.tourId,
        agentId: args.agentId,
        showamiFallbackId: args.showamiFallbackId,
        routingPath: "showami",
      }),
      timestamp: now,
    });

    return assignmentId;
  },
});

/** Explicitly record a manual queue assignment. Broker/admin only. */
export const recordManualAssignment = mutation({
  args: {
    tourId: v.id("tours"),
    agentId: v.id("users"),
    notes: v.optional(v.string()),
  },
  returns: v.id("tourAssignments"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");

    const agentUser = await ctx.db.get(args.agentId);
    if (!agentUser) throw new Error("Agent user not found");

    const now = new Date().toISOString();

    const assignmentId = await ctx.db.insert("tourAssignments", {
      tourId: args.tourId,
      agentId: args.agentId,
      routingPath: "manual",
      status: "pending",
      assignedAt: now,
      notes: args.notes,
    });

    // Mirror agent onto tour for canonical reads.
    await ctx.db.patch(args.tourId, { agentId: args.agentId });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "tour_assigned_manual",
      entityType: "tourAssignments",
      entityId: assignmentId,
      details: JSON.stringify({
        tourId: args.tourId,
        agentId: args.agentId,
        routingPath: "manual",
      }),
      timestamp: now,
    });

    return assignmentId;
  },
});

/**
 * Update an assignment status with validated transitions.
 *
 * Valid transitions:
 *   pending → confirmed → in_progress → completed
 *   pending | confirmed | in_progress → canceled
 *
 * Broker/admin only.
 */
export const updateAssignmentStatus = mutation({
  args: {
    assignmentId: v.id("tourAssignments"),
    newStatus: assignmentStatus,
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const allowed = VALID_ASSIGNMENT_TRANSITIONS[assignment.status] ?? [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid transition: ${assignment.status} → ${args.newStatus}. Allowed: ${allowed.join(", ") || "none"}`,
      );
    }

    const now = new Date().toISOString();

    const patch: Partial<Doc<"tourAssignments">> = { status: args.newStatus };
    if (args.newStatus === "completed") {
      patch.completedAt = now;
    }
    if (args.newStatus === "canceled") {
      patch.canceledAt = now;
      patch.cancelReason = args.reason;
    }

    await ctx.db.patch(args.assignmentId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: `assignment_${args.newStatus}`,
      entityType: "tourAssignments",
      entityId: args.assignmentId,
      details: JSON.stringify({
        from: assignment.status,
        to: args.newStatus,
        reason: args.reason,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Sync a Showami-routed assignment based on an external status update (pulled
 * from the Showami marketplace integration). Applies the same state transition
 * rules as `updateAssignmentStatus` but is keyed by external Showami fallback
 * ID rather than Convex assignment ID. Represents the canonical sync-back of
 * Showami tour progress into the deal room.
 *
 * Broker/admin only.
 */
export const syncShowamiStatus = mutation({
  args: {
    showamiFallbackId: v.string(),
    newStatus: assignmentStatus,
    completedAt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    // Find the assignment by showamiFallbackId. No dedicated index, so walk
    // the routingPath index and filter — the showami subset is small.
    const showamiAssignments = await ctx.db
      .query("tourAssignments")
      .withIndex("by_routingPath", (q) => q.eq("routingPath", "showami"))
      .collect();

    const assignment = showamiAssignments.find(
      (a) => a.showamiFallbackId === args.showamiFallbackId,
    );

    if (!assignment) {
      throw new Error(
        `No Showami assignment found with fallbackId ${args.showamiFallbackId}`,
      );
    }

    const allowed = VALID_ASSIGNMENT_TRANSITIONS[assignment.status] ?? [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid Showami sync transition: ${assignment.status} → ${args.newStatus}. Allowed: ${allowed.join(", ") || "none"}`,
      );
    }

    const now = new Date().toISOString();

    const patch: Partial<Doc<"tourAssignments">> = { status: args.newStatus };
    if (args.newStatus === "completed") {
      patch.completedAt = args.completedAt ?? now;
    }
    if (args.newStatus === "canceled") {
      patch.canceledAt = now;
    }

    await ctx.db.patch(assignment._id, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "showami_sync",
      entityType: "tourAssignments",
      entityId: assignment._id,
      details: JSON.stringify({
        showamiFallbackId: args.showamiFallbackId,
        from: assignment.status,
        to: args.newStatus,
        completedAt: args.completedAt,
      }),
      timestamp: now,
    });

    return null;
  },
});
