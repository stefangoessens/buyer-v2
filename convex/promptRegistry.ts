import { query, internalQuery, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { generateVersionHash, buildVersionContent } from "./lib/promptVersion";
import { getCurrentUser, requireRole } from "./lib/session";

// ═══ Queries ═══

/** Get the active prompt for an engine type (internal — engines call this server-side) */
export const getActivePrompt = internalQuery({
  args: { engineType: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("promptRegistry")
      .withIndex("by_engineType_and_isActive", (q) =>
        q.eq("engineType", args.engineType).eq("isActive", true)
      )
      .unique();
  },
});

/** Get a specific prompt version (internal — for reproduction/debugging) */
export const getByVersion = internalQuery({
  args: {
    engineType: v.string(),
    version: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("promptRegistry")
      .withIndex("by_engineType_and_version", (q) =>
        q.eq("engineType", args.engineType).eq("version", args.version)
      )
      .unique();
  },
});

/** List all versions for an engine type (admin console — auth-gated) */
export const listVersions = query({
  args: { engineType: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user || (user.role !== "broker" && user.role !== "admin")) return [];

    return await ctx.db
      .query("promptRegistry")
      .withIndex("by_engineType", (q) => q.eq("engineType", args.engineType))
      .order("desc")
      .collect();
  },
});

// ═══ Mutations ═══

/** Register a new prompt version (internal — called by deployment/seeding scripts) */
export const registerPrompt = internalMutation({
  args: {
    engineType: v.string(),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    model: v.string(),
    author: v.string(),
    changeNotes: v.optional(v.string()),
    activateImmediately: v.optional(v.boolean()),
  },
  returns: v.object({
    id: v.id("promptRegistry"),
    version: v.string(),
  }),
  handler: async (ctx, args) => {
    const versionContent = buildVersionContent(args.prompt, args.systemPrompt, args.model);
    const version = generateVersionHash(versionContent);
    const shouldActivate = args.activateImmediately ?? false;

    // Check if this exact version already exists
    const existing = await ctx.db
      .query("promptRegistry")
      .withIndex("by_engineType_and_version", (q) =>
        q.eq("engineType", args.engineType).eq("version", version)
      )
      .unique();

    if (existing) {
      // Honor activateImmediately even for existing versions
      if (shouldActivate && !existing.isActive) {
        const currentActive = await ctx.db
          .query("promptRegistry")
          .withIndex("by_engineType_and_isActive", (q) =>
            q.eq("engineType", args.engineType).eq("isActive", true)
          )
          .unique();
        if (currentActive) {
          await ctx.db.patch(currentActive._id, { isActive: false });
        }
        await ctx.db.patch(existing._id, { isActive: true });
      }
      return { id: existing._id, version };
    }

    // If activating, deactivate current active version
    if (shouldActivate) {
      const currentActive = await ctx.db
        .query("promptRegistry")
        .withIndex("by_engineType_and_isActive", (q) =>
          q.eq("engineType", args.engineType).eq("isActive", true)
        )
        .unique();
      if (currentActive) {
        await ctx.db.patch(currentActive._id, { isActive: false });
      }
    }

    const id = await ctx.db.insert("promptRegistry", {
      engineType: args.engineType,
      version,
      prompt: args.prompt,
      systemPrompt: args.systemPrompt,
      model: args.model,
      isActive: shouldActivate,
      createdAt: new Date().toISOString(),
      author: args.author,
      changeNotes: args.changeNotes,
    });

    return { id, version };
  },
});

/** Activate a specific prompt version (admin only) */
export const activateVersion = mutation({
  args: {
    engineType: v.string(),
    version: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");

    const target = await ctx.db
      .query("promptRegistry")
      .withIndex("by_engineType_and_version", (q) =>
        q.eq("engineType", args.engineType).eq("version", args.version)
      )
      .unique();
    if (!target) throw new Error("Prompt version not found");

    const currentActive = await ctx.db
      .query("promptRegistry")
      .withIndex("by_engineType_and_isActive", (q) =>
        q.eq("engineType", args.engineType).eq("isActive", true)
      )
      .unique();
    if (currentActive) {
      await ctx.db.patch(currentActive._id, { isActive: false });
    }

    await ctx.db.patch(target._id, { isActive: true });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "prompt_version_activated",
      entityType: "promptRegistry",
      entityId: target._id,
      details: JSON.stringify({ engineType: args.engineType, version: args.version }),
      timestamp: new Date().toISOString(),
    });

    return null;
  },
});
