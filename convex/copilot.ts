import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAuth, getCurrentUser } from "./lib/session";
import type { Id } from "./_generated/dataModel";

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
 * KIN-1081 — return the latest doc_parser row for each workflow
 * (disclosure vs. inspection) on a property. Both engines write to
 * `engineType: "doc_parser"`, so the existing
 * `listLatestEngineOutputInternal` would return whichever one ran most
 * recently. The chat + copilot need BOTH, partitioned by the JSON
 * payload's `engineVersion` prefix.
 *
 * Walks the index newest-first and stops as soon as one of each kind
 * has been found, so this stays cheap on properties with long parse
 * histories.
 */
export const listLatestDocParserOutputsInternal = internalQuery({
  args: {
    propertyId: v.id("properties"),
  },
  returns: v.object({
    disclosure: v.union(v.any(), v.null()),
    inspection: v.union(v.any(), v.null()),
  }),
  handler: async (ctx, args) => {
    let disclosure: Record<string, unknown> | null = null;
    let inspection: Record<string, unknown> | null = null;

    for await (const row of ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", args.propertyId).eq("engineType", "doc_parser"),
      )
      .order("desc")) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(row.output);
      } catch {
        parsed = null;
      }
      const engineVersion =
        parsed &&
        typeof parsed === "object" &&
        "engineVersion" in parsed &&
        typeof (parsed as { engineVersion?: unknown }).engineVersion === "string"
          ? (parsed as { engineVersion: string }).engineVersion
          : "";

      const summary = {
        _id: row._id,
        confidence: row.confidence,
        modelId: row.modelId,
        generatedAt: row.generatedAt,
        citations: row.citations,
        reviewState: row.reviewState,
        output: parsed,
        snippet: row.output.slice(0, 400),
      };

      if (engineVersion.startsWith("inspectionParser") && !inspection) {
        inspection = summary;
      } else if (engineVersion.startsWith("disclosureParser") && !disclosure) {
        disclosure = summary;
      }

      if (disclosure && inspection) break;
    }

    return { disclosure, inspection };
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
        documents: "doc_parser",
      };
      const engineType = engineTypeByIntent[intent];
      if (!engineType) return null;

      // KIN-1081 — `documents` intent must surface BOTH the latest
      // disclosure parser row AND the latest inspection parser row,
      // since they share `engineType: "doc_parser"`. The chat snippet
      // gets both summaries concatenated so the model can answer
      // questions about either packet without us having to pre-route
      // by sub-intent. Other intents still go through the original
      // single-row resolver.
      if (intent === "documents") {
        const both: { disclosure: any; inspection: any } = await ctx.runQuery(
          internal.copilot.listLatestDocParserOutputsInternal,
          { propertyId: propertyId as Id<"properties"> },
        );
        const { disclosure, inspection } = both;
        if (!disclosure && !inspection) return null;

        const parts: string[] = [];
        if (disclosure) {
          parts.push(`[disclosure] ${disclosure.snippet}`);
        }
        if (inspection) {
          parts.push(`[inspection] ${inspection.snippet}`);
        }
        const newest =
          inspection && disclosure
            ? inspection.generatedAt > disclosure.generatedAt
              ? inspection
              : disclosure
            : (inspection ?? disclosure);

        return {
          engine: engineType as any,
          engineOutputId: newest._id,
          modelId: newest.modelId,
          generatedAt: newest.generatedAt,
          confidence: newest.confidence,
          snippet: parts.join("\n\n").slice(0, 800),
        };
      }

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
    const {
      COPILOT_CLASSIFIER_SYSTEM,
      COPILOT_RESPONSE_SYSTEM,
      COPILOT_GUARDED_GENERAL_SYSTEM,
    } = await import("../src/lib/copilot/prompts");
    const { ALL_INTENTS } = await import("../src/lib/copilot/intents");

    const FALLBACK_GUARDED =
      "I can only help with questions about this property and the buying process. Try asking about pricing, comps, offer terms, or next steps.";

    const llmClassify = async (question: string) => {
      const result = await gateway({
        engineType: "copilot",
        messages: [
          { role: "system", content: COPILOT_CLASSIFIER_SYSTEM },
          { role: "user", content: `Question: ${question}\n\nIntent:` },
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
      void intent;
      const result = await gateway({
        engineType: "copilot",
        messages: [
          { role: "system", content: COPILOT_RESPONSE_SYSTEM },
          {
            role: "user",
            content: `Buyer question: ${question}\n\nEngine (${engineRef.engine}) output: ${engineRef.snippet}\n\nRender a short grounded answer (<=4 sentences). Cite the engine name.`,
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
          { role: "system", content: COPILOT_GUARDED_GENERAL_SYSTEM },
          {
            role: "user",
            content: `Deal room context: ${dealContext}\n\nBuyer question: ${question}\n\nAnswer (<=3 sentences):`,
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
        promptVersion: "copilot_orchestrator_v1",
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
