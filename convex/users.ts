import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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

export const create = mutation({
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
    userId: v.id("users"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;
    const patch: Record<string, string> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.phone !== undefined) patch.phone = updates.phone;
    if (updates.avatarUrl !== undefined) patch.avatarUrl = updates.avatarUrl;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(userId, patch);
    }
    return null;
  },
});
