import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAuth, getCurrentUser } from "./lib/session";
import type { Id } from "./_generated/dataModel";
import {
  getPromptRegistryEntry,
  getPromptVersionRef,
} from "../packages/shared/src/prompt-registry";

/**
 * Buyer copilot orchestrator backend (KIN-858).
 *
 * Thin router: rule-based intent classification → existing engine output
 * lookup → grounded response. All prompts are registered in the prompt
 * registry so we can version them and roll back. Conversation state is
 * persisted per deal room so the UI can render the thread without having
 * to replay every message through the LLM.
 *
 * The actual orchestrator function lives in src/lib/copilot/orchestrator.ts
 * and is dependency-injected here with concrete Convex / gateway bindings.
 */

const copilotIntent = v.union(
  v.literal("pricing"),
  v.literal("comps"),
  v.literal("costs"),
  v.literal("leverage"),
  v.literal("risks"),
  v.literal("documents"),
  v.literal("offer"),
  v.literal("scheduling"),
  v.literal("agreement"),
  v.literal("other"),
);

export const getConversation = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    const isOwner = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isOwner && !isStaff) return null;

    const conversation = await ctx.db
      .query("copilotConversations")
      .withIndex("by_dealRoomId_and_buyerId", (q) =>
        q.eq("dealRoomId", args.dealRoomId).eq("buyerId", dealRoom.buyerId),
      )
      .first();

    if (!conversation) {
      return { conversation: null, messages: [] };
    }

    const messages = await ctx.db
      .query("copilotMessages")
      .withIndex("by_conversationId_and_createdAt", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("asc")
      .take(200);

    return { conversation, messages };
  },
});

export const ensureConversation = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.id("copilotConversations"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    if (dealRoom.buyerId !== user._id) {
      throw new Error("Only the buyer can open a copilot conversation");
    }
    const existing = await ctx.db
      .query("copilotConversations")
      .withIndex("by_dealRoomId_and_buyerId", (q) =>
        q.eq("dealRoomId", args.dealRoomId).eq("buyerId", user._id),
      )
      .first();
    if (existing) return existing._id;
    const now = new Date().toISOString();
    return await ctx.db.insert("copilotConversations", {
      dealRoomId: args.dealRoomId,
      buyerId: user._id,
      messageCount: 0,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const appendMessage = mutation({
  args: {
    conversationId: v.id("copilotConversations"),
    role: v.union(
      v.literal("buyer"),
      v.literal("copilot"),
      v.literal("system"),
    ),
    content: v.string(),
    intent: v.optional(copilotIntent),
    intentConfidence: v.optional(v.number()),
    intentMethod: v.optional(
      v.union(v.literal("rule"), v.literal("llm"), v.literal("fallback")),
    ),
    engineKey: v.optional(v.string()),
    engineOutputId: v.optional(v.id("aiEngineOutputs")),
    citations: v.optional(v.array(v.string())),
    promptVersion: v.optional(v.string()),
    stubbed: v.optional(v.boolean()),
  },
  returns: v.id("copilotMessages"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.buyerId !== user._id && user.role === "buyer") {
      throw new Error("Not authorized");
    }
    const now = new Date().toISOString();
    const id = await ctx.db.insert("copilotMessages", {
      conversationId: args.conversationId,
      dealRoomId: conversation.dealRoomId,
      role: args.role,
      content: args.content,
      intent: args.intent,
      intentConfidence: args.intentConfidence,
      intentMethod: args.intentMethod,
      engineKey: args.engineKey,
      engineOutputId: args.engineOutputId,
      citations: args.citations ?? [],
      promptVersion: args.promptVersion,
      stubbed: args.stubbed ?? false,
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, {
      messageCount: conversation.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const listLatestEngineOutputInternal = internalQuery({
  args: {
    propertyId: v.id("properties"),
    engineType: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", args.propertyId).eq("engineType", args.engineType),
      )
      .order("desc")
      .take(1);
    const latest = rows[0];
    if (!latest) return null;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(latest.output);
    } catch {
      parsed = null;
    }
    return {
      _id: latest._id,
      confidence: latest.confidence,
      modelId: latest.modelId,
      generatedAt: latest.generatedAt,
      citations: latest.citations,
      reviewState: latest.reviewState,
      output: parsed,
      snippet: latest.output.slice(0, 400),
    };
  },
});

/**
 * Entry-point action — runs the orchestrator against injected deps and
 * persists the round trip. This is the ONE place that both reads from
 * the engines and writes copilot messages.
 */
export const ask = action({
  args: {
    dealRoomId: v.id("dealRooms"),
    question: v.string(),
  },
  returns: v.object({
    intent: copilotIntent,
    confidence: v.number(),
    method: v.union(v.literal("rule"), v.literal("llm"), v.literal("fallback")),
    engine: v.string(),
    stubbed: v.boolean(),
    text: v.string(),
    messageId: v.id("copilotMessages"),
  }),
  handler: async (ctx, args) => {
    const { orchestrate } = await import("../src/lib/copilot/orchestrator");
    const { routeForIntent } = await import("../src/lib/copilot/router");

    await ctx.runMutation(internal.promptRegistry.syncCatalogPrompts, {
      activateMissing: true,
    });

    const cockpit: any = await ctx.runQuery(api.dealRooms.get, {
      dealRoomId: args.dealRoomId,
    });
    if (!cockpit) throw new Error("Deal room not available");

    const conversationId: Id<"copilotConversations"> = await ctx.runMutation(
      api.copilot.ensureConversation,
      { dealRoomId: args.dealRoomId },
    );

    await ctx.runMutation(api.copilot.appendMessage, {
      conversationId,
      role: "buyer",
      content: args.question,
    });

    const dealContext = cockpit.property?.address?.formatted
      ? `Property: ${cockpit.property.address.formatted}. Listing price: ${cockpit.property.listPrice ?? "unknown"}.`
      : `Deal room ${args.dealRoomId}`;

    const loadEngineOutput = async (intent: string, propertyId: string) => {
      const engineTypeByIntent: Record<string, string> = {
        pricing: "pricing",
        comps: "comps",
        costs: "cost",
        leverage: "leverage",
        offer: "offer",
      };
      const engineType = engineTypeByIntent[intent];
      if (!engineType) return null;
      const row: any = await ctx.runQuery(
        internal.copilot.listLatestEngineOutputInternal,
        {
          propertyId: propertyId as Id<"properties">,
          engineType,
        },
      );
      if (!row) return null;
      return {
        engine: engineType as any,
        engineOutputId: row._id,
        modelId: row.modelId,
        generatedAt: row.generatedAt,
        confidence: row.confidence,
        snippet: row.snippet,
      };
    };

    const { gateway } = await import("../src/lib/ai/gateway");
    const { renderTemplate } = await import("../src/lib/copilot/prompts");
    const { ALL_INTENTS } = await import("../src/lib/copilot/intents");

    const activePromptRefs: Array<{
      promptKey: string;
      version: string;
    }> = await ctx.runQuery(internal.promptRegistry.getActiveVersionRefs, {
      engineType: "copilot",
    });

    const activeVersionsByKey = new Map(
      activePromptRefs.map((ref) => [ref.promptKey, ref.version]),
    );

    const resolveCopilotPrompt = async (promptKey: string) => {
      const fallbackRef = getPromptVersionRef("copilot", promptKey);
      const version = activeVersionsByKey.get(promptKey) ?? fallbackRef.version;
      const row: {
        prompt: string;
        systemPrompt?: string;
        version: string;
      } | null = await ctx.runQuery(internal.promptRegistry.getByVersion, {
        engineType: "copilot",
        promptKey,
        version,
      });

      if (row) {
        return {
          prompt: row.prompt,
          systemPrompt: row.systemPrompt ?? "",
          version: row.version,
        };
      }

      const fallback = getPromptRegistryEntry({ engineType: "copilot", promptKey });
      return {
        prompt: fallback.prompt,
        systemPrompt: fallback.systemPrompt ?? "",
        version: fallback.version,
      };
    };

    const classifierPrompt = await resolveCopilotPrompt("classifier");
    const guardedGeneralPrompt = await resolveCopilotPrompt("guarded_general");
    const responsePrompts = {
      pricing: await resolveCopilotPrompt("response_pricing"),
      comps: await resolveCopilotPrompt("response_comps"),
      costs: await resolveCopilotPrompt("response_costs"),
      leverage: await resolveCopilotPrompt("response_leverage"),
      offer: await resolveCopilotPrompt("response_offer"),
    } as const;

    const FALLBACK_GUARDED =
      "I can only help with questions about this property and the buying process. Try asking about pricing, comps, offer terms, or next steps.";

    const llmClassify = async (question: string) => {
      const result = await gateway({
        engineType: "copilot",
        messages: [
          { role: "system", content: classifierPrompt.systemPrompt },
          {
            role: "user",
            content: renderTemplate(classifierPrompt.prompt, { question }),
          },
        ],
        maxTokens: 12,
        temperature: 0,
      });
      if (!result.success) {
        return {
          intent: "other" as const,
          confidence: 0.4,
          method: "fallback" as const,
        };
      }
      const raw = result.data.content.trim().toLowerCase();
      const matched = (ALL_INTENTS as ReadonlyArray<string>).find((i) =>
        raw.startsWith(i),
      );
      return {
        intent: (matched ?? "other") as (typeof ALL_INTENTS)[number],
        confidence: matched ? 0.9 : 0.45,
        method: "llm" as const,
      };
    };

    const llmRespond = async (
      intent: string,
      engineRef: { snippet: string; engine: string },
      question: string,
    ) => {
      const promptKeyByIntent: Record<string, keyof typeof responsePrompts> = {
        pricing: "pricing",
        comps: "comps",
        costs: "costs",
        leverage: "leverage",
        offer: "offer",
      };
      const prompt =
        responsePrompts[promptKeyByIntent[intent] ?? "pricing"];
      const result = await gateway({
        engineType: "copilot",
        messages: [
          { role: "system", content: prompt.systemPrompt },
          {
            role: "user",
            content: renderTemplate(prompt.prompt, {
              question,
              engineOutput: `Engine (${engineRef.engine}) output: ${engineRef.snippet}`,
            }),
          },
        ],
        maxTokens: 320,
        temperature: 0.2,
      });
      if (!result.success) {
        return `Based on the ${engineRef.engine} engine output: ${engineRef.snippet.slice(0, 200)}`;
      }
      const trimmed = result.data.content.trim();
      return trimmed.length > 0
        ? trimmed
        : `Based on the ${engineRef.engine} engine output: ${engineRef.snippet.slice(0, 200)}`;
    };

    const llmGuardedGeneral = async (question: string, dealContext: string) => {
      const result = await gateway({
        engineType: "copilot",
        messages: [
          { role: "system", content: guardedGeneralPrompt.systemPrompt },
          {
            role: "user",
            content: renderTemplate(guardedGeneralPrompt.prompt, {
              dealContext,
              question,
            }),
          },
        ],
        maxTokens: 200,
        temperature: 0.3,
      });
      if (!result.success) return FALLBACK_GUARDED;
      const trimmed = result.data.content.trim();
      return trimmed.length > 0 ? trimmed : FALLBACK_GUARDED;
    };

    const result = await orchestrate(
      {
        question: args.question,
        propertyId: (cockpit.property?._id as string) ?? "",
        dealContext,
      },
      {
        llmClassify,
        loadEngineOutput,
        llmRespond,
        llmGuardedGeneral,
        now: () => new Date().toISOString(),
      },
    );

    void routeForIntent; // imported for future use in the persisted route

    const responseText = result.response.text;
    const responsePromptVersion =
      result.classification.intent === "other"
        ? guardedGeneralPrompt.version
        : responsePrompts[
            (result.classification.intent as keyof typeof responsePrompts) ?? "pricing"
          ]?.version;

    const messageId: Id<"copilotMessages"> = await ctx.runMutation(
      api.copilot.appendMessage,
      {
        conversationId,
        role: "copilot",
        content: responseText,
        intent: result.classification.intent,
        intentConfidence: result.classification.confidence,
        intentMethod: result.classification.method,
        engineKey: result.response.engine,
        engineOutputId:
          result.response.citations[0] &&
          result.response.citations[0].startsWith("k")
            ? (result.response.citations[0] as Id<"aiEngineOutputs">)
            : undefined,
        citations: result.response.citations,
        promptVersion: responsePromptVersion,
        stubbed: result.response.stubbed,
      },
    );

    return {
      intent: result.classification.intent,
      confidence: result.classification.confidence,
      method: result.classification.method,
      engine: result.response.engine,
      stubbed: result.response.stubbed,
      text: responseText,
      messageId,
    };
  },
});
