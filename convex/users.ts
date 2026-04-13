import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { authProvider } from "./lib/validators";
import { requireAuth, sessionUserValidator } from "./lib/session";

export const get = query({
  args: { userId: v.id("users") },
  returns: v.union(sessionUserValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const getByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(sessionUserValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

// User creation is internal-only — called by auth hooks, not by clients directly.
// This prevents privilege escalation via caller-supplied roles.
export const create = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("buyer"), v.literal("broker"), v.literal("admin")),
    phone: v.optional(v.string()),
    authProvider: v.optional(authProvider),
    authIssuer: v.optional(v.string()),
    authSubject: v.optional(v.string()),
    authTokenIdentifier: v.optional(v.string()),
    sessionVersion: v.optional(v.number()),
    lastAuthenticatedAt: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: args.role,
      phone: args.phone,
      authProvider: args.authProvider,
      authIssuer: args.authIssuer,
      authSubject: args.authSubject,
      authTokenIdentifier: args.authTokenIdentifier,
      sessionVersion: args.sessionVersion ?? (args.authSubject ? 1 : undefined),
      lastAuthenticatedAt: args.lastAuthenticatedAt,
    });
  },
});

export const bindAuthIdentity = internalMutation({
  args: {
    userId: v.id("users"),
    authProvider: v.optional(authProvider),
    authIssuer: v.string(),
    authSubject: v.string(),
    authTokenIdentifier: v.string(),
    sessionVersion: v.optional(v.number()),
    lastAuthenticatedAt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      authProvider: args.authProvider,
      authIssuer: args.authIssuer,
      authSubject: args.authSubject,
      authTokenIdentifier: args.authTokenIdentifier,
      sessionVersion: args.sessionVersion ?? 1,
      lastAuthenticatedAt: args.lastAuthenticatedAt ?? new Date().toISOString(),
    });
    return null;
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Enforce ownership — users can only update their own profile
    const currentUser = await requireAuth(ctx);

    const patch: Record<string, string> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.avatarUrl !== undefined) patch.avatarUrl = args.avatarUrl;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(currentUser._id, patch);
    }
    return null;
  },
});
