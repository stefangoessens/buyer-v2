import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUser, requireRole } from "./lib/session";
import { buildVersionContent, generateVersionHash } from "./lib/promptVersion";
import {
  DEFAULT_PROMPT_REGISTRY_ENTRIES,
  PROMPT_REGISTRY_ENGINE_TYPES,
  type PromptRegistryEngineType,
} from "../packages/shared/src/prompt-registry";

const engineTypeValidator = v.union(
  v.literal("pricing"),
  v.literal("comps"),
  v.literal("leverage"),
  v.literal("offer"),
  v.literal("cost"),
  v.literal("doc_parser"),
  v.literal("copilot"),
  v.literal("case_synthesis"),
);

const promptRegistryDocValidator = v.object({
  _id: v.id("promptRegistry"),
  _creationTime: v.number(),
  engineType: engineTypeValidator,
  promptKey: v.string(),
  version: v.string(),
  prompt: v.string(),
  systemPrompt: v.optional(v.string()),
  model: v.string(),
  isActive: v.boolean(),
  createdAt: v.string(),
  author: v.string(),
  changeNotes: v.optional(v.string()),
});

const promptVersionRefValidator = v.object({
  engineType: engineTypeValidator,
  promptKey: v.string(),
  version: v.string(),
});

const consoleSnapshotValidator = v.object({
  engineType: engineTypeValidator,
  promptCount: v.number(),
  activeVersions: v.array(
    v.object({
      promptKey: v.string(),
      version: v.string(),
      model: v.string(),
      createdAt: v.string(),
      author: v.string(),
      changeNotes: v.optional(v.string()),
    }),
  ),
  recentVersions: v.array(
    v.object({
      promptKey: v.string(),
      version: v.string(),
      model: v.string(),
      createdAt: v.string(),
      author: v.string(),
      isActive: v.boolean(),
    }),
  ),
});

const replayBundleValidator = v.object({
  output: v.object({
    outputId: v.id("aiEngineOutputs"),
    propertyId: v.id("properties"),
    engineType: engineTypeValidator,
    promptKey: v.union(v.string(), v.null()),
    promptVersion: v.union(v.string(), v.null()),
    modelId: v.string(),
    generatedAt: v.string(),
    confidence: v.number(),
    reviewState: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    inputSnapshot: v.union(v.string(), v.null()),
    outputSnapshot: v.string(),
    citations: v.array(v.string()),
  }),
  prompt: v.union(v.null(), promptRegistryDocValidator),
});

function normalizePromptKey(promptKey?: string): string {
  return promptKey ?? "default";
}

function toPromptDoc(row: Doc<"promptRegistry">) {
  return {
    ...row,
    promptKey: normalizePromptKey(row.promptKey),
    engineType: row.engineType as PromptRegistryEngineType,
  };
}

async function requireBrokerOrAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user || (user.role !== "broker" && user.role !== "admin")) {
    return null;
  }
  return user;
}

async function findPromptRow(
  ctx: QueryCtx | MutationCtx,
  engineType: PromptRegistryEngineType,
  promptKey: string,
  version: string,
) {
  const byKey = await ctx.db
    .query("promptRegistry")
    .withIndex("by_engineType_and_promptKey_and_version", (q) =>
      q.eq("engineType", engineType).eq("promptKey", promptKey).eq("version", version),
    )
    .unique();
  if (byKey) return byKey;

  if (promptKey !== "default") return null;

  return await ctx.db
    .query("promptRegistry")
    .withIndex("by_engineType_and_version", (q) =>
      q.eq("engineType", engineType).eq("version", version),
    )
    .unique();
}

async function findActivePromptRow(
  ctx: QueryCtx | MutationCtx,
  engineType: PromptRegistryEngineType,
  promptKey: string,
) {
  const byKey = await ctx.db
    .query("promptRegistry")
    .withIndex("by_engineType_and_promptKey_and_isActive", (q) =>
      q.eq("engineType", engineType).eq("promptKey", promptKey).eq("isActive", true),
    )
    .unique();
  if (byKey) return byKey;

  if (promptKey !== "default") return null;

  return await ctx.db
    .query("promptRegistry")
    .withIndex("by_engineType_and_isActive", (q) =>
      q.eq("engineType", engineType).eq("isActive", true),
    )
    .unique();
}

async function syncCatalogPromptsInDb(
  ctx: MutationCtx,
  activateMissing: boolean,
) {
  let inserted = 0;
  let activated = 0;

  for (const entry of DEFAULT_PROMPT_REGISTRY_ENTRIES) {
    const existing = await findPromptRow(
      ctx,
      entry.engineType,
      entry.promptKey,
      entry.version,
    );
    if (!existing) {
      await ctx.db.insert("promptRegistry", {
        engineType: entry.engineType,
        promptKey: entry.promptKey,
        version: entry.version,
        prompt: entry.prompt,
        systemPrompt: entry.systemPrompt,
        model: entry.model,
        isActive: false,
        createdAt: new Date().toISOString(),
        author: entry.author,
        changeNotes: entry.changeNotes,
      });
      inserted++;
    }

    if (!activateMissing || !entry.isActive) {
      continue;
    }

    const currentActive = await findActivePromptRow(
      ctx,
      entry.engineType,
      entry.promptKey,
    );
    if (!currentActive) {
      const row = await findPromptRow(
        ctx,
        entry.engineType,
        entry.promptKey,
        entry.version,
      );
      if (row && !row.isActive) {
        await ctx.db.patch(row._id, { isActive: true });
        activated++;
      }
    }
  }

  return { inserted, activated };
}

export const getByVersion = internalQuery({
  args: {
    engineType: engineTypeValidator,
    promptKey: v.optional(v.string()),
    version: v.string(),
  },
  returns: v.union(v.null(), promptRegistryDocValidator),
  handler: async (ctx, args) => {
    const row = await findPromptRow(
      ctx,
      args.engineType,
      normalizePromptKey(args.promptKey),
      args.version,
    );
    return row ? toPromptDoc(row) : null;
  },
});

export const getVersion = query({
  args: {
    engineType: engineTypeValidator,
    promptKey: v.optional(v.string()),
    version: v.string(),
  },
  returns: v.union(v.null(), promptRegistryDocValidator),
  handler: async (ctx, args) => {
    const user = await requireBrokerOrAdmin(ctx);
    if (!user) return null;

    const row = await findPromptRow(
      ctx,
      args.engineType,
      normalizePromptKey(args.promptKey),
      args.version,
    );
    return row ? toPromptDoc(row) : null;
  },
});

export const getActiveVersionRefs = internalQuery({
  args: {
    engineType: v.optional(engineTypeValidator),
  },
  returns: v.array(promptVersionRefValidator),
  handler: async (ctx, args) => {
    const { engineType } = args;
    const rows = engineType
      ? await ctx.db
          .query("promptRegistry")
          .withIndex("by_engineType_and_isActive", (q) =>
            q.eq("engineType", engineType).eq("isActive", true),
          )
          .collect()
      : await ctx.db
          .query("promptRegistry")
          .withIndex("by_isActive", (q) => q.eq("isActive", true))
          .collect();

    return rows.map((row) => ({
      engineType: row.engineType as PromptRegistryEngineType,
      promptKey: normalizePromptKey(row.promptKey),
      version: row.version,
    }));
  },
});

export const listVersions = query({
  args: {
    engineType: engineTypeValidator,
    promptKey: v.optional(v.string()),
  },
  returns: v.array(promptRegistryDocValidator),
  handler: async (ctx, args) => {
    const user = await requireBrokerOrAdmin(ctx);
    if (!user) return [];

    const promptKey = normalizePromptKey(args.promptKey);
    const rows = args.promptKey !== undefined
      ? await ctx.db
          .query("promptRegistry")
          .withIndex("by_engineType_and_promptKey", (q) =>
            q.eq("engineType", args.engineType).eq("promptKey", promptKey),
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("promptRegistry")
          .withIndex("by_engineType", (q) => q.eq("engineType", args.engineType))
          .order("desc")
          .collect();

    return rows
      .map(toPromptDoc)
      .filter((row) => args.promptKey === undefined || row.promptKey === promptKey);
  },
});

export const getConsoleSnapshot = query({
  args: {},
  returns: v.array(consoleSnapshotValidator),
  handler: async (ctx) => {
    const user = await requireBrokerOrAdmin(ctx);
    if (!user) return [];

    const rows = (await ctx.db.query("promptRegistry").collect()).map(toPromptDoc);
    const byEngine = new Map<PromptRegistryEngineType, Array<ReturnType<typeof toPromptDoc>>>();

    for (const row of rows) {
      const existing = byEngine.get(row.engineType) ?? [];
      existing.push(row);
      byEngine.set(row.engineType, existing);
    }

    return PROMPT_REGISTRY_ENGINE_TYPES.map((engineType) => {
      const engineRows = (byEngine.get(engineType) ?? []).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      const activeVersions = engineRows
        .filter((row) => row.isActive)
        .map((row) => ({
          promptKey: row.promptKey,
          version: row.version,
          model: row.model,
          createdAt: row.createdAt,
          author: row.author,
          changeNotes: row.changeNotes,
        }));

      return {
        engineType,
        promptCount: engineRows.length,
        activeVersions,
        recentVersions: engineRows.slice(0, 5).map((row) => ({
          promptKey: row.promptKey,
          version: row.version,
          model: row.model,
          createdAt: row.createdAt,
          author: row.author,
          isActive: row.isActive,
        })),
      };
    });
  },
});

export const getReplayBundle = query({
  args: { outputId: v.id("aiEngineOutputs") },
  returns: v.union(v.null(), replayBundleValidator),
  handler: async (ctx, args) => {
    const user = await requireBrokerOrAdmin(ctx);
    if (!user) return null;

    const output = await ctx.db.get(args.outputId);
    if (!output) return null;

    const prompt = output.promptVersion
      ? await findPromptRow(
          ctx,
          output.engineType as PromptRegistryEngineType,
          normalizePromptKey(output.promptKey),
          output.promptVersion,
        )
      : null;

    return {
      output: {
        outputId: output._id,
        propertyId: output.propertyId,
        engineType: output.engineType as PromptRegistryEngineType,
        promptKey: output.promptKey ?? null,
        promptVersion: output.promptVersion ?? null,
        modelId: output.modelId,
        generatedAt: output.generatedAt,
        confidence: output.confidence,
        reviewState: output.reviewState,
        inputSnapshot: output.inputSnapshot ?? null,
        outputSnapshot: output.output,
        citations: output.citations,
      },
      prompt: prompt ? toPromptDoc(prompt) : null,
    };
  },
});

export const registerPrompt = internalMutation({
  args: {
    engineType: engineTypeValidator,
    promptKey: v.optional(v.string()),
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
    const promptKey = normalizePromptKey(args.promptKey);
    const version = DEFAULT_PROMPT_REGISTRY_ENTRIES.find(
      (entry) =>
        entry.engineType === args.engineType &&
        entry.promptKey === promptKey &&
        entry.prompt === args.prompt &&
        entry.systemPrompt === args.systemPrompt &&
        entry.model === args.model,
    )?.version;

    const computedVersion =
      version ??
      generateVersionHash(
        buildVersionContent(args.prompt, args.systemPrompt, args.model),
      );

    const existing = await findPromptRow(
      ctx,
      args.engineType,
      promptKey,
      computedVersion,
    );

    const now = new Date().toISOString();
    const shouldActivate = args.activateImmediately ?? false;

    if (shouldActivate) {
      const currentActive = await findActivePromptRow(
        ctx,
        args.engineType,
        promptKey,
      );
      if (currentActive && (!existing || currentActive._id !== existing._id)) {
        await ctx.db.patch(currentActive._id, { isActive: false });
      }
    }

    if (existing) {
      if (shouldActivate && !existing.isActive) {
        await ctx.db.patch(existing._id, { isActive: true });
      }
      return { id: existing._id, version: computedVersion };
    }

    const id = await ctx.db.insert("promptRegistry", {
      engineType: args.engineType,
      promptKey,
      version: computedVersion,
      prompt: args.prompt,
      systemPrompt: args.systemPrompt,
      model: args.model,
      isActive: shouldActivate,
      createdAt: now,
      author: args.author,
      changeNotes: args.changeNotes,
    });

    return { id, version: computedVersion };
  },
});

export const activateVersion = mutation({
  args: {
    engineType: engineTypeValidator,
    promptKey: v.optional(v.string()),
    version: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");
    const promptKey = normalizePromptKey(args.promptKey);

    const target = await findPromptRow(ctx, args.engineType, promptKey, args.version);
    if (!target) {
      throw new Error("Prompt version not found");
    }

    const currentActive = await findActivePromptRow(ctx, args.engineType, promptKey);
    const now = new Date().toISOString();

    if (currentActive && currentActive._id !== target._id) {
      await ctx.db.patch(currentActive._id, { isActive: false });
    }

    if (!target.isActive) {
      await ctx.db.patch(target._id, { isActive: true });
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "prompt_version_activated",
      entityType: "promptRegistry",
      entityId: target._id,
      details: JSON.stringify({
        engineType: args.engineType,
        promptKey,
        version: args.version,
      }),
      timestamp: now,
    });

    return null;
  },
});

export const ensureCatalogPrompts = mutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    activated: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireBrokerOrAdmin(ctx);
    if (!user) {
      throw new Error("Not authorized");
    }

    return await syncCatalogPromptsInDb(ctx, true);
  },
});

export const syncCatalogPrompts = internalMutation({
  args: {
    activateMissing: v.optional(v.boolean()),
  },
  returns: v.object({
    inserted: v.number(),
    activated: v.number(),
  }),
  handler: async (ctx, args) =>
    syncCatalogPromptsInDb(ctx, args.activateMissing ?? true),
});
