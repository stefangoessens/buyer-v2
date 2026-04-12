import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

/** Get buyer profile for the authenticated user */
export const getMyProfile = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", identity.subject))
      .unique();
    if (!user) return null;

    const profile = await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!profile) return null;

    // Hide internal notes from buyers
    if (user.role === "buyer") {
      const { notes, ...buyerVisible } = profile;
      return buyerVisible;
    }

    return profile;
  },
});

/** Get profile by userId (for broker/admin views) */
export const getByUserId = query({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) => q.eq("authSubject", identity.subject))
      .unique();

    // Only the profile owner or broker/admin can view
    if (!currentUser) return null;
    if (currentUser._id !== args.userId && currentUser.role !== "broker" && currentUser.role !== "admin") {
      return null;
    }

    const profile = await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!profile) return null;

    // Hide notes from the buyer viewing their own profile
    if (currentUser.role === "buyer") {
      const { notes, ...buyerVisible } = profile;
      return buyerVisible;
    }

    return profile;
  },
});

/** Internal query — no access control */
export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/** Create or update buyer profile (upsert) */
export const createOrUpdate = mutation({
  args: {
    preferredAreas: v.optional(v.array(v.string())),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    preApproved: v.optional(v.boolean()),
    preApprovalAmount: v.optional(v.number()),
    propertyTypes: v.optional(v.array(v.string())),
    mustHaves: v.optional(v.array(v.string())),
    dealbreakers: v.optional(v.array(v.string())),
    timeline: v.optional(v.string()),
    financingType: v.optional(v.union(
      v.literal("cash"),
      v.literal("conventional"),
      v.literal("fha"),
      v.literal("va"),
      v.literal("other")
    )),
    lenderName: v.optional(v.string()),
    preApprovalExpiry: v.optional(v.string()),
    communicationPrefs: v.optional(v.object({
      email: v.boolean(),
      sms: v.boolean(),
      push: v.boolean(),
    })),
    householdSize: v.optional(v.number()),
    moveTimeline: v.optional(v.union(
      v.literal("asap"),
      v.literal("1_3_months"),
      v.literal("3_6_months"),
      v.literal("6_plus_months"),
      v.literal("just_looking")
    )),
    notes: v.optional(v.string()), // Internal — only broker/admin should set this
  },
  returns: v.id("buyerProfiles"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Strip notes from buyer input — only broker/admin can write notes
    if (args.notes !== undefined && user.role === "buyer") {
      delete (args as Record<string, unknown>).notes;
    }

    const existing = await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      // Partial update — only patch provided fields
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined) patch[key] = value;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }

    // Create new profile
    return await ctx.db.insert("buyerProfiles", {
      userId: user._id,
      ...args,
    });
  },
});

/** Update communication preferences only */
export const updateCommPrefs = mutation({
  args: {
    email: v.boolean(),
    sms: v.boolean(),
    push: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const profile = await ctx.db
      .query("buyerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!profile) throw new Error("Profile not found — create one first");

    await ctx.db.patch(profile._id, {
      communicationPrefs: {
        email: args.email,
        sms: args.sms,
        push: args.push,
      },
    });

    return null;
  },
});
