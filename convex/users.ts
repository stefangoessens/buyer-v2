import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

export const get = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      email: v.string(),
      name: v.string(),
      role: v.union(v.literal("buyer"), v.literal("broker"), v.literal("admin")),
      phone: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      authSubject: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const getByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      email: v.string(),
      name: v.string(),
      role: v.union(v.literal("buyer"), v.literal("broker"), v.literal("admin")),
      phone: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      authSubject: v.optional(v.string()),
    }),
    v.null()
  ),
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
    authSubject: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: args.role,
      phone: args.phone,
      authSubject: args.authSubject,
    });
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
