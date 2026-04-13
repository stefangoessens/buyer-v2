import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/session";

/**
 * Shape returned to callers. Mirrors InsightsOutput but trimmed for
 * wire use — we don't hand back the raw stringified engine output.
 */
type ApiInsight = {
  category: string;
  headline: string;
  body: string;
  severity: string;
  confidence: number;
  premium: boolean;
  citations: string[];
};

type LockedTeaser = {
  category: string;
  severity: string;
  confidence: number;
};

type ApiInsightsResponse = {
  insights: ApiInsight[];
  overallConfidence: number;
  generatedAt: string;
  generatedAtEngine: string;
  hasGatedPremium: boolean;
  totalCount: number;
  lockedTeasers?: LockedTeaser[];
} | null;

function parseInsightsRecord(record: {
  output: string;
  generatedAt: string;
}): { insights: ApiInsight[]; overallConfidence: number } | null {
  try {
    const parsed = JSON.parse(record.output);
    if (!parsed || typeof parsed !== "object") return null;
    const rawInsights = Array.isArray(parsed.insights) ? parsed.insights : [];
    const insights: ApiInsight[] = rawInsights
      .filter((i: unknown) => !!i && typeof i === "object")
      .map((i: Record<string, unknown>) => ({
        category: String(i.category ?? "info"),
        headline: String(i.headline ?? ""),
        body: String(i.body ?? ""),
        severity: String(i.severity ?? "info"),
        confidence: typeof i.confidence === "number" ? i.confidence : 0.5,
        premium: Boolean(i.premium),
        citations: Array.isArray(i.citations)
          ? (i.citations as unknown[]).filter(
              (c): c is string => typeof c === "string",
            )
          : [],
      }));
    const overallConfidence =
      typeof parsed.overallConfidence === "number"
        ? parsed.overallConfidence
        : 0;
    return { insights, overallConfidence };
  } catch {
    return null;
  }
}

/**
 * Public teaser query — unauthenticated.
 * Returns only insights marked premium=false. This is what the
 * anonymous /property/[id] page renders. Premium insights stay gated
 * behind deal-room registration.
 */
export const getPublic = query({
  args: { propertyId: v.id("properties") },
  returns: v.any(),
  handler: async (ctx, args): Promise<ApiInsightsResponse> => {
    const latest = await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", args.propertyId).eq("engineType", "insights"),
      )
      .order("desc")
      .first();

    if (!latest) return null;
    if (latest.reviewState === "rejected") return null;

    const parsed = parseInsightsRecord({
      output: latest.output,
      generatedAt: latest.generatedAt,
    });
    if (!parsed) return null;

    const publicOnly = parsed.insights.filter((i) => i.premium === false);
    const premiumOnly = parsed.insights.filter((i) => i.premium === true);
    // Expose real category + severity + confidence for premium teasers.
    // The UI renders an honest "locked" row — no blurred decoy text.
    // Real headlines/bodies stay server-side until the buyer signs up.
    const lockedTeasers = premiumOnly.slice(0, 3).map((i) => ({
      category: i.category,
      severity: i.severity,
      confidence: i.confidence,
    }));

    return {
      insights: publicOnly,
      overallConfidence: parsed.overallConfidence,
      generatedAt: latest.generatedAt,
      generatedAtEngine: "insights",
      hasGatedPremium: premiumOnly.length > 0,
      totalCount: parsed.insights.length,
      lockedTeasers,
    };
  },
});

/**
 * Deal-room query — auth-gated. Returns ALL insights (premium + public)
 * once the caller has proven access to the deal room. Brokers/admins
 * always see everything; buyers only see insights for deal rooms they own.
 */
export const getAllForDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args): Promise<ApiInsightsResponse> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    const isStaff = user.role === "broker" || user.role === "admin";
    const isOwner = dealRoom.buyerId === user._id;
    if (!isStaff && !isOwner) return null;

    const latest = await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", dealRoom.propertyId).eq("engineType", "insights"),
      )
      .order("desc")
      .first();

    if (!latest) return null;
    if (latest.reviewState === "rejected") return null;

    const parsed = parseInsightsRecord({
      output: latest.output,
      generatedAt: latest.generatedAt,
    });
    if (!parsed) return null;

    return {
      insights: parsed.insights,
      overallConfidence: parsed.overallConfidence,
      generatedAt: latest.generatedAt,
      generatedAtEngine: "insights",
      hasGatedPremium: false,
      totalCount: parsed.insights.length,
    };
  },
});

/**
 * Authenticated property-level query that mirrors getPublic but
 * unlocks premium insights for staff users. Useful in the admin
 * property detail view before a deal room exists.
 */
export const getForProperty = query({
  args: { propertyId: v.id("properties") },
  returns: v.any(),
  handler: async (ctx, args): Promise<ApiInsightsResponse> => {
    const user = await getCurrentUser(ctx);
    const isStaff = !!user && (user.role === "broker" || user.role === "admin");

    const latest = await ctx.db
      .query("aiEngineOutputs")
      .withIndex("by_propertyId_and_engineType", (q) =>
        q.eq("propertyId", args.propertyId).eq("engineType", "insights"),
      )
      .order("desc")
      .first();

    if (!latest) return null;
    if (latest.reviewState === "rejected" && !isStaff) return null;

    const parsed = parseInsightsRecord({
      output: latest.output,
      generatedAt: latest.generatedAt,
    });
    if (!parsed) return null;

    const insights = isStaff
      ? parsed.insights
      : parsed.insights.filter((i) => i.premium === false);
    const hasGatedPremium =
      !isStaff && parsed.insights.some((i) => i.premium === true);

    return {
      insights,
      overallConfidence: parsed.overallConfidence,
      generatedAt: latest.generatedAt,
      generatedAtEngine: "insights",
      hasGatedPremium,
      totalCount: parsed.insights.length,
    };
  },
});
