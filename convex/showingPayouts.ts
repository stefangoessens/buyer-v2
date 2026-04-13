import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/session";
import { payoutStatus } from "./lib/validators";
import {
  resolveFixedFee,
  type AgentCoverageRecord,
  type GeographyFeeConfig,
} from "./lib/assignmentRouting";

const DEFAULT_SHOWAMI_FEE = 75;

const geographyTypeValidator = v.union(
  v.literal("zip"),
  v.literal("county"),
  v.literal("statewide"),
);

function serializeDetails(details: Record<string, unknown>): string {
  return JSON.stringify(details);
}

function toCoverageRecord(
  coverage: {
    agentId: string;
    coverageAreas: Array<{ zip: string; city?: string; county?: string }>;
    isActive: boolean;
    fixedFeePerShowing: number;
  },
): AgentCoverageRecord {
  return {
    agentId: coverage.agentId,
    coverageAreas: coverage.coverageAreas,
    isActive: coverage.isActive,
    fixedFeePerShowing: coverage.fixedFeePerShowing,
  };
}

function toFeeConfigRecord(
  config: {
    geographyType: "zip" | "county" | "statewide";
    geographyValue: string;
    feeAmount: number;
    isActive: boolean;
  },
): GeographyFeeConfig {
  return {
    geographyType: config.geographyType,
    geographyValue: config.geographyValue,
    feeAmount: config.feeAmount,
    isActive: config.isActive,
  };
}

export const getByTourAssignment = query({
  args: { tourAssignmentId: v.id("tourAssignments") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("showingPayouts")
      .withIndex("by_tourAssignmentId", (q) =>
        q.eq("tourAssignmentId", args.tourAssignmentId),
      )
      .unique();
  },
});

export const getByAgent = query({
  args: {
    agentId: v.id("users"),
    status: v.optional(payoutStatus),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    const payouts = await ctx.db
      .query("showingPayouts")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();

    return args.status
      ? payouts.filter((payout) => payout.payoutStatus === args.status)
      : payouts;
  },
});

export const getPendingPayouts = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("showingPayouts")
      .withIndex("by_payoutStatus", (q) => q.eq("payoutStatus", "pending"))
      .collect();
  },
});

export const getBatchForMonth = query({
  args: { batchMonth: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("showingPayouts")
      .withIndex("by_batchMonth", (q) => q.eq("batchMonth", args.batchMonth))
      .collect();
  },
});

export const listFeeConfigs = query({
  args: {
    geographyType: v.optional(geographyTypeValidator),
    isActive: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    const configs = args.isActive === true
      ? await ctx.db
          .query("showingPayoutFeeConfigs")
          .withIndex("by_isActive", (q) => q.eq("isActive", true))
          .collect()
      : await ctx.db.query("showingPayoutFeeConfigs").collect();

    return args.geographyType
      ? configs.filter((config) => config.geographyType === args.geographyType)
      : configs;
  },
});

export async function createPayoutObligationCore(
  ctx: any,
  tourAssignmentId: Id<"tourAssignments">,
  actorId: Id<"users"> | undefined,
): Promise<Id<"showingPayouts">> {
  const assignment = await ctx.db.get(tourAssignmentId);
  if (!assignment) {
    throw new Error("Tour assignment not found");
  }

  if (assignment.status !== "completed") {
    throw new Error("Only completed assignments generate payout obligations");
  }

  if (!assignment.agentId) {
    throw new Error(
      "Completed assignment is missing an agent. Cannot create payout obligation.",
    );
  }

  const existing = await ctx.db
    .query("showingPayouts")
    .withIndex("by_tourAssignmentId", (q: any) =>
      q.eq("tourAssignmentId", tourAssignmentId),
    )
    .unique();
  if (existing) {
    throw new Error("Payout already exists for this assignment");
  }

  const coverage = await ctx.db
    .query("agentCoverage")
    .withIndex("by_agentId", (q: any) => q.eq("agentId", assignment.agentId))
    .unique();
  const tour = await ctx.db.get(assignment.tourId);
  if (!tour) {
    throw new Error("Tour not found for assignment");
  }
  const property = await ctx.db.get(tour.propertyId);
  if (!property) {
    throw new Error("Property not found for tour");
  }

  const feeConfigs = await ctx.db
    .query("showingPayoutFeeConfigs")
    .withIndex("by_isActive", (q: any) => q.eq("isActive", true))
    .collect();

  const feeResolution = resolveFixedFee({
    geography: {
      zip: property.address.zip,
      county: property.address.county,
    },
    agentCoverage: coverage ? toCoverageRecord(coverage) : null,
    feeConfigs: feeConfigs.map(toFeeConfigRecord),
    defaultFee: DEFAULT_SHOWAMI_FEE,
  });

  const brokerage =
    assignment.cooperatingBrokerage ??
    coverage?.brokerage ??
    (assignment.routingPath === "showami"
      ? "Showami cooperating brokerage"
      : "Unknown cooperating brokerage");

  const now = new Date().toISOString();
  const payoutId = await ctx.db.insert("showingPayouts", {
    tourAssignmentId,
    tourId: assignment.tourId,
    tourRequestId: assignment.tourRequestId,
    agentId: assignment.agentId,
    brokerage,
    feeAmount: feeResolution.feeAmount,
    payoutStatus: "pending" as const,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("auditLog", {
    userId: actorId,
    action: "showing_payout_created",
    entityType: "showingPayouts",
    entityId: payoutId,
    details: serializeDetails({
      tourAssignmentId,
      tourId: assignment.tourId,
      tourRequestId: assignment.tourRequestId,
      agentId: assignment.agentId,
      brokerage,
      feeAmount: feeResolution.feeAmount,
      feeSource: feeResolution.source,
      routingPath: assignment.routingPath,
    }),
    timestamp: now,
  });

  return payoutId;
}

export const createPayoutObligation = mutation({
  args: { tourAssignmentId: v.id("tourAssignments") },
  returns: v.id("showingPayouts"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    return await createPayoutObligationCore(ctx, args.tourAssignmentId, user._id);
  },
});

export const saveFeeConfig = mutation({
  args: {
    configId: v.optional(v.id("showingPayoutFeeConfigs")),
    geographyType: geographyTypeValidator,
    geographyValue: v.string(),
    feeAmount: v.number(),
    isActive: v.boolean(),
    notes: v.optional(v.string()),
  },
  returns: v.union(v.id("showingPayoutFeeConfigs"), v.null()),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const now = new Date().toISOString();

    if (args.configId) {
      const existing = await ctx.db.get(args.configId);
      if (!existing) {
        throw new Error("Fee config not found");
      }

      await ctx.db.patch(args.configId, {
        geographyType: args.geographyType,
        geographyValue: args.geographyValue,
        feeAmount: args.feeAmount,
        isActive: args.isActive,
        notes: args.notes,
        updatedAt: now,
      });

      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "showing_payout_fee_config_updated",
        entityType: "showingPayoutFeeConfigs",
        entityId: args.configId,
        details: serializeDetails({
          geographyType: args.geographyType,
          geographyValue: args.geographyValue,
          feeAmount: args.feeAmount,
          isActive: args.isActive,
        }),
        timestamp: now,
      });

      return args.configId;
    }

    const configId = await ctx.db.insert("showingPayoutFeeConfigs", {
      geographyType: args.geographyType,
      geographyValue: args.geographyValue,
      feeAmount: args.feeAmount,
      isActive: args.isActive,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "showing_payout_fee_config_created",
      entityType: "showingPayoutFeeConfigs",
      entityId: configId,
      details: serializeDetails({
        geographyType: args.geographyType,
        geographyValue: args.geographyValue,
        feeAmount: args.feeAmount,
        isActive: args.isActive,
      }),
      timestamp: now,
    });

    return configId;
  },
});

export const approvePayout = mutation({
  args: {
    payoutId: v.id("showingPayouts"),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) {
      throw new Error("Payout not found");
    }
    if (payout.payoutStatus !== "pending") {
      throw new Error("Only pending payouts can be approved");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.payoutId, {
      payoutStatus: "approved",
      approvedBy: user._id,
      approvedAt: now,
      updatedAt: now,
      ...(args.notes !== undefined ? { invoiceReference: args.notes } : {}),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "showing_payout_approved",
      entityType: "showingPayouts",
      entityId: args.payoutId,
      details: serializeDetails({
        brokerage: payout.brokerage,
        feeAmount: payout.feeAmount,
        notes: args.notes,
      }),
      timestamp: now,
    });

    return null;
  },
});

export const markPayoutPaid = mutation({
  args: {
    payoutId: v.id("showingPayouts"),
    invoiceReference: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) {
      throw new Error("Payout not found");
    }
    if (payout.payoutStatus !== "approved") {
      throw new Error("Only approved payouts can be marked paid");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.payoutId, {
      payoutStatus: "paid",
      paidAt: now,
      updatedAt: now,
      ...(args.invoiceReference !== undefined
        ? { invoiceReference: args.invoiceReference }
        : {}),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "showing_payout_paid",
      entityType: "showingPayouts",
      entityId: args.payoutId,
      details: serializeDetails({
        brokerage: payout.brokerage,
        feeAmount: payout.feeAmount,
        invoiceReference: args.invoiceReference ?? payout.invoiceReference,
      }),
      timestamp: now,
    });

    return null;
  },
});

export const generateMonthlyBatch = mutation({
  args: { batchMonth: v.string() },
  returns: v.array(v.id("showingPayouts")),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    if (!/^\d{4}-\d{2}$/.test(args.batchMonth)) {
      throw new Error("batchMonth must be in YYYY-MM format");
    }

    const pending = await ctx.db
      .query("showingPayouts")
      .withIndex("by_payoutStatus", (q) => q.eq("payoutStatus", "pending"))
      .collect();
    const approved = await ctx.db
      .query("showingPayouts")
      .withIndex("by_payoutStatus", (q) => q.eq("payoutStatus", "approved"))
      .collect();

    const now = new Date().toISOString();
    const included: Array<Id<"showingPayouts">> = [];

    for (const payout of [...pending, ...approved]) {
      if (payout.batchMonth) {
        continue;
      }

      const assignment = await ctx.db.get(payout.tourAssignmentId);
      if (!assignment?.completedAt) {
        continue;
      }
      if (!assignment.completedAt.startsWith(args.batchMonth)) {
        continue;
      }

      await ctx.db.patch(payout._id, {
        batchMonth: args.batchMonth,
        updatedAt: now,
      });
      included.push(payout._id);

      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "showing_payout_batched",
        entityType: "showingPayouts",
        entityId: payout._id,
        details: serializeDetails({
          batchMonth: args.batchMonth,
          brokerage: payout.brokerage,
          feeAmount: payout.feeAmount,
          payoutStatus: payout.payoutStatus,
        }),
        timestamp: now,
      });
    }

    return included;
  },
});

export const createPayoutObligationInternal = internalMutation({
  args: { tourAssignmentId: v.id("tourAssignments") },
  returns: v.id("showingPayouts"),
  handler: async (ctx, args) => {
    return await createPayoutObligationCore(ctx, args.tourAssignmentId, undefined);
  },
});
