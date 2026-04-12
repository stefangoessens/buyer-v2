import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { determineReviewState } from "./lib/engineResult";

// ═══ Queries ═══

/** Get a specific engine output by ID */
export const get = query({
  args: { outputId: v.id("aiEngineOutputs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.outputId);
  },
});

/** Get all outputs for a property + engine type */
export const getByPropertyAndEngine = query({
  args: {
    propertyId: v.id("properties"),
    engineType: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", args.propertyId).eq("engineType", args.engineType),
      )
      .collect();
  },
});

/** Get the latest output for a property + engine type */
export const getLatest = query({
  args: {
    propertyId: v.id("properties"),
    engineType: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", args.propertyId).eq("engineType", args.engineType),
      )
      .order("desc")
      .first();
  },
});

/** List all outputs pending review (for ops review queue) */
export const listPendingReview = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_reviewState", (q) => q.eq("reviewState", "pending"))
      .take(args.limit ?? 50);
  },
});

// ═══ Mutations ═══

/** Create a new engine output (internal -- called by engine actions) */
export const createOutput = internalMutation({
  args: {
    propertyId: v.id("properties"),
    engineType: v.string(),
    confidence: v.number(),
    citations: v.array(v.string()),
    output: v.string(),
    modelId: v.string(),
  },
  returns: v.id("aiEngineOutputs"),
  handler: async (ctx, args) => {
    const reviewState = determineReviewState(args.confidence);
    return await ctx.db.insert("aiEngineOutputs", {
      propertyId: args.propertyId,
      engineType: args.engineType,
      confidence: args.confidence,
      citations: args.citations,
      reviewState,
      output: args.output,
      modelId: args.modelId,
      generatedAt: new Date().toISOString(),
    });
  },
});

/** Approve an engine output (broker/admin review action) */
export const approveOutput = mutation({
  args: {
    outputId: v.id("aiEngineOutputs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) =>
        q.eq("authSubject", identity.subject),
      )
      .unique();
    if (!user) throw new Error("User not found");
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can approve outputs");
    }

    await ctx.db.patch(args.outputId, {
      reviewState: "approved" as const,
      reviewedBy: user._id,
      reviewedAt: new Date().toISOString(),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "ai_output_approved",
      entityType: "aiEngineOutputs",
      entityId: args.outputId,
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});

/** Reject an engine output (broker/admin review action) */
export const rejectOutput = mutation({
  args: {
    outputId: v.id("aiEngineOutputs"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) =>
        q.eq("authSubject", identity.subject),
      )
      .unique();
    if (!user) throw new Error("User not found");
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can reject outputs");
    }

    await ctx.db.patch(args.outputId, {
      reviewState: "rejected" as const,
      reviewedBy: user._id,
      reviewedAt: new Date().toISOString(),
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "ai_output_rejected",
      entityType: "aiEngineOutputs",
      entityId: args.outputId,
      details: args.reason
        ? JSON.stringify({ reason: args.reason })
        : undefined,
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});
