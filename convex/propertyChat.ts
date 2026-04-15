import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/session";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Property chat (KIN-1069) — per-user, per-property AI drawer on the
 * property detail page. Thread ID is deterministic (`${userId}:${propertyId}`)
 * so there's no separate threads table.
 *
 * License-critical wizard steps ("offer", "close") insert assistant
 * replies with `brokerReviewState="pending"`; everything else defaults
 * to `"none"`. The public `setBrokerReviewState` mutation is broker/admin
 * only and is how reviewers approve or flag pending messages.
 */

const wizardStepValidator = v.union(
  v.literal("details"),
  v.literal("price"),
  v.literal("disclosures"),
  v.literal("offer"),
  v.literal("close"),
);

const brokerReviewStateValidator = v.union(
  v.literal("none"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("flagged"),
);

const messageRoleValidator = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
);

const MAX_CONTENT_LENGTH = 4000;
const DEFAULT_LIMIT = 50;
const HISTORY_LIMIT = 20;

function threadIdFor(userId: Id<"users">, propertyId: Id<"properties">): string {
  return `${userId}:${propertyId}`;
}

function isLicenseCriticalStep(step: string | undefined): boolean {
  return step === "offer" || step === "close";
}

type DisclosurePacketBlock = {
  version: number;
  status: string;
  fileNames: string[];
  findings: Array<{
    title: string;
    severity: "low" | "medium" | "high";
    category: string;
    buyerFriendlyExplanation: string;
    recommendedAction: string;
    pageReference?: string;
    sourceFileName?: string;
  }>;
  notMentioned: Array<{
    title: string;
    severity: "low" | "medium" | "high";
    category: string;
    buyerFriendlyExplanation: string;
    recommendedAction: string;
    pageReference?: string;
    sourceFileName?: string;
  }>;
} | null;

/**
 * Render the active disclosure packet into a grounding block for the
 * chat model. Returns null when there's no packet so callers can skip
 * the extra system message entirely.
 */
function buildDisclosurePacketBlock(packet: DisclosurePacketBlock): string | null {
  if (!packet) return null;
  const lines: string[] = [];
  lines.push(
    `Disclosure packet v${packet.version} (status: ${packet.status}) — files: ${packet.fileNames.join(", ") || "none"}.`,
  );
  lines.push(
    "When the buyer asks about a disclosed item, cite the finding and its source using the format 'Source: <fileName>, <pageReference>'. If the packet status is 'partial_failure' or 'failed', note that some files couldn't be analyzed.",
  );
  if (packet.findings.length > 0) {
    lines.push("");
    lines.push("Disclosed findings:");
    for (const f of packet.findings) {
      const src = f.sourceFileName
        ? `Source: ${f.sourceFileName}${f.pageReference ? `, ${f.pageReference}` : ""}`
        : "";
      lines.push(
        `- [${f.severity}] ${f.title} (${f.category}) — ${f.buyerFriendlyExplanation} Next step: ${f.recommendedAction}. ${src}`.trim(),
      );
    }
  }
  if (packet.notMentioned.length > 0) {
    lines.push("");
    lines.push("Items the packet does NOT address (buyer should ask):");
    for (const n of packet.notMentioned) {
      lines.push(
        `- ${n.title} — ${n.buyerFriendlyExplanation} Next step: ${n.recommendedAction}.`,
      );
    }
  }
  return lines.join("\n");
}

const listedMessageValidator = v.object({
  _id: v.id("propertyChatMessages"),
  _creationTime: v.number(),
  threadId: v.string(),
  userId: v.id("users"),
  propertyId: v.id("properties"),
  role: messageRoleValidator,
  content: v.string(),
  wizardStep: v.optional(wizardStepValidator),
  brokerReviewState: v.optional(brokerReviewStateValidator),
  brokerReviewedById: v.optional(v.id("users")),
  brokerReviewedAt: v.optional(v.string()),
  modelId: v.optional(v.string()),
  createdAt: v.string(),
});

export const listMessages = query({
  args: {
    propertyId: v.id("properties"),
    limit: v.optional(v.number()),
  },
  returns: v.array(listedMessageValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, 200));
    const threadId = threadIdFor(user._id, args.propertyId);

    const rows = await ctx.db
      .query("propertyChatMessages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .order("asc")
      .take(limit);

    return rows;
  },
});

export const sendMessage = mutation({
  args: {
    propertyId: v.id("properties"),
    content: v.string(),
    wizardStep: wizardStepValidator,
  },
  returns: v.id("propertyChatMessages"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const trimmed = args.content.trim();
    if (trimmed.length === 0) {
      throw new Error("Message content cannot be empty");
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new Error(
        `Message content exceeds ${MAX_CONTENT_LENGTH} character limit`,
      );
    }

    const property = await ctx.db.get(args.propertyId);
    if (!property) {
      throw new Error("Property not found");
    }

    const threadId = threadIdFor(user._id, args.propertyId);
    const now = new Date().toISOString();

    const userMessageId = await ctx.db.insert("propertyChatMessages", {
      threadId,
      userId: user._id,
      propertyId: args.propertyId,
      role: "user",
      content: trimmed,
      wizardStep: args.wizardStep,
      brokerReviewState: "none",
      createdAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.propertyChat.runAssistantReply,
      { userMessageId },
    );

    return userMessageId;
  },
});

export const setBrokerReviewState = mutation({
  args: {
    messageId: v.id("propertyChatMessages"),
    state: brokerReviewStateValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Broker or admin role required to review chat messages");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    await ctx.db.patch(args.messageId, {
      brokerReviewState: args.state,
      brokerReviewedById: user._id,
      brokerReviewedAt: new Date().toISOString(),
    });

    return null;
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Internal: assistant reply pipeline
// ───────────────────────────────────────────────────────────────────────────

const disclosureFindingContextValidator = v.object({
  title: v.string(),
  severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  category: v.string(),
  buyerFriendlyExplanation: v.string(),
  recommendedAction: v.string(),
  pageReference: v.optional(v.string()),
  sourceFileName: v.optional(v.string()),
});

const disclosurePacketContextValidator = v.union(
  v.null(),
  v.object({
    version: v.number(),
    status: v.string(),
    fileNames: v.array(v.string()),
    findings: v.array(disclosureFindingContextValidator),
    notMentioned: v.array(disclosureFindingContextValidator),
  }),
);

const assistantContextValidator = v.union(
  v.null(),
  v.object({
    threadId: v.string(),
    userId: v.id("users"),
    propertyId: v.id("properties"),
    userContent: v.string(),
    wizardStep: wizardStepValidator,
    propertyContext: v.object({
      address: v.string(),
      listPrice: v.union(v.number(), v.null()),
      beds: v.union(v.number(), v.null()),
      baths: v.union(v.number(), v.null()),
      sqftLiving: v.union(v.number(), v.null()),
      yearBuilt: v.union(v.number(), v.null()),
      propertyType: v.union(v.string(), v.null()),
    }),
    disclosurePacket: disclosurePacketContextValidator,
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  }),
);

export const loadAssistantContext = internalQuery({
  args: { userMessageId: v.id("propertyChatMessages") },
  returns: assistantContextValidator,
  handler: async (ctx, args) => {
    const userMessage = await ctx.db.get(args.userMessageId);
    if (!userMessage || userMessage.role !== "user" || !userMessage.wizardStep) {
      return null;
    }

    const property = await ctx.db.get(userMessage.propertyId);
    if (!property) return null;

    const priorRows = await ctx.db
      .query("propertyChatMessages")
      .withIndex("by_threadId", (q) => q.eq("threadId", userMessage.threadId))
      .order("desc")
      .take(HISTORY_LIMIT + 1);

    const history = priorRows
      .filter(
        (row: Doc<"propertyChatMessages">) =>
          row._id !== userMessage._id &&
          (row.role === "user" || row.role === "assistant"),
      )
      .reverse()
      .map((row: Doc<"propertyChatMessages">) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      }));

    const bathsTotal =
      (property.bathsFull ?? 0) + 0.5 * (property.bathsHalf ?? 0);

    // Packet-aware grounding (KIN-1078): pull the buyer's active deal
    // room for this property and its latest non-superseded disclosure
    // packet. When present, the chat gets a summary of the findings
    // (including "not disclosed" gaps) so the model can cite specific
    // items rather than speculate.
    const buyerDealRooms = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", userMessage.userId))
      .collect();
    const activeDealRoom = buyerDealRooms.find(
      (r) => r.propertyId === userMessage.propertyId,
    );

    let disclosurePacket: {
      version: number;
      status: string;
      fileNames: string[];
      findings: Array<{
        title: string;
        severity: "low" | "medium" | "high";
        category: string;
        buyerFriendlyExplanation: string;
        recommendedAction: string;
        pageReference?: string;
        sourceFileName?: string;
      }>;
      notMentioned: Array<{
        title: string;
        severity: "low" | "medium" | "high";
        category: string;
        buyerFriendlyExplanation: string;
        recommendedAction: string;
        pageReference?: string;
        sourceFileName?: string;
      }>;
    } | null = null;

    if (activeDealRoom) {
      const latestPacket = await ctx.db
        .query("disclosurePackets")
        .withIndex("by_dealRoomId_and_version", (q) =>
          q.eq("dealRoomId", activeDealRoom._id),
        )
        .order("desc")
        .first();

      if (latestPacket && latestPacket.status !== "superseded") {
        const rawFindings = await ctx.db
          .query("fileAnalysisFindings")
          .withIndex("by_packetId", (q) => q.eq("packetId", latestPacket._id))
          .collect();

        const findings: Array<{
          title: string;
          severity: "low" | "medium" | "high";
          category: string;
          buyerFriendlyExplanation: string;
          recommendedAction: string;
          pageReference?: string;
          sourceFileName?: string;
        }> = [];
        const notMentioned: Array<{
          title: string;
          severity: "low" | "medium" | "high";
          category: string;
          buyerFriendlyExplanation: string;
          recommendedAction: string;
          pageReference?: string;
          sourceFileName?: string;
        }> = [];

        for (const f of rawFindings) {
          const sev = f.severity;
          const narrowedSeverity: "low" | "medium" | "high" =
            sev === "high"
              ? "high"
              : sev === "medium"
                ? "medium"
                : "low";
          const entry = {
            title: f.label,
            severity: narrowedSeverity,
            category: f.category ?? "other",
            buyerFriendlyExplanation: f.buyerFriendlyExplanation ?? f.summary,
            recommendedAction: f.recommendedAction ?? "Review with your broker",
            pageReference: f.pageReference,
            sourceFileName: f.sourceFileName,
          };
          if (f.category === "not_disclosed") {
            notMentioned.push(entry);
          } else {
            findings.push(entry);
          }
        }

        disclosurePacket = {
          version: latestPacket.version,
          status: latestPacket.status,
          fileNames: latestPacket.files.map((fl) => fl.fileName),
          findings,
          notMentioned,
        };
      }
    }

    return {
      threadId: userMessage.threadId,
      userId: userMessage.userId,
      propertyId: userMessage.propertyId,
      userContent: userMessage.content,
      wizardStep: userMessage.wizardStep,
      propertyContext: {
        address:
          property.address?.formatted ??
          `${property.address?.street ?? ""}, ${property.address?.city ?? ""}, ${property.address?.state ?? ""} ${property.address?.zip ?? ""}`.trim(),
        listPrice: property.listPrice ?? null,
        beds: property.beds ?? null,
        baths: bathsTotal > 0 ? bathsTotal : null,
        sqftLiving: property.sqftLiving ?? null,
        yearBuilt: property.yearBuilt ?? null,
        propertyType: property.propertyType ?? null,
      },
      disclosurePacket,
      history,
    };
  },
});

export const appendAssistantMessage = internalMutation({
  args: {
    threadId: v.string(),
    userId: v.id("users"),
    propertyId: v.id("properties"),
    role: messageRoleValidator,
    content: v.string(),
    wizardStep: wizardStepValidator,
    modelId: v.optional(v.string()),
  },
  returns: v.id("propertyChatMessages"),
  handler: async (ctx, args) => {
    const reviewState: "pending" | "none" = isLicenseCriticalStep(args.wizardStep)
      ? "pending"
      : "none";

    return await ctx.db.insert("propertyChatMessages", {
      threadId: args.threadId,
      userId: args.userId,
      propertyId: args.propertyId,
      role: args.role,
      content: args.content,
      wizardStep: args.wizardStep,
      brokerReviewState: reviewState,
      modelId: args.modelId,
      createdAt: new Date().toISOString(),
    });
  },
});

export const runAssistantReply = internalAction({
  args: { userMessageId: v.id("propertyChatMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context: any = await ctx.runQuery(
      internal.propertyChat.loadAssistantContext,
      { userMessageId: args.userMessageId },
    );

    if (!context) return null;

    const { buildPropertyChatRequest } = await import(
      "../src/lib/propertyChatPrompts"
    );
    const { gateway } = await import("../src/lib/ai/gateway");

    // Build the base request, then inject packet-aware grounding as a
    // system message so the model has access to the disclosure findings
    // when answering. propertyChatPrompts.ts is owned elsewhere — we
    // fold the packet block into the `messages` array here instead of
    // threading a new parameter through its signature.
    const baseRequest = buildPropertyChatRequest({
      wizardStep: context.wizardStep,
      propertyContext: context.propertyContext,
      userMessage: context.userContent,
      history: context.history,
    });

    const packetBlock = buildDisclosurePacketBlock(context.disclosurePacket);
    const request = packetBlock
      ? {
          ...baseRequest,
          messages: [
            baseRequest.messages[0],
            { role: "system" as const, content: packetBlock },
            ...baseRequest.messages.slice(1),
          ],
        }
      : baseRequest;

    const result = await gateway({
      ...request,
      engineType: "copilot",
      maxTokens: 600,
      temperature: 0.3,
    });

    if (!result.success) {
      await ctx.runMutation(internal.propertyChat.appendAssistantMessage, {
        threadId: context.threadId,
        userId: context.userId,
        propertyId: context.propertyId,
        role: "system",
        content: `The assistant is temporarily unavailable (${result.error.code}). Please try again in a moment.`,
        wizardStep: context.wizardStep,
      });
      return null;
    }

    await ctx.runMutation(internal.propertyChat.appendAssistantMessage, {
      threadId: context.threadId,
      userId: context.userId,
      propertyId: context.propertyId,
      role: "assistant",
      content: result.data.content,
      wizardStep: context.wizardStep,
      modelId: result.data.usage.model,
    });

    return null;
  },
});
