import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
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
  synthesizedInsights?: ApiInsight[];
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
        // Citations may arrive as plain strings (legacy insights engine)
        // OR as `{source, ref}` objects (crawl synthesizer). Normalize
        // both shapes to display strings so traceability is preserved
        // for synthesized rows — codex flagged this dropping silently.
        citations: Array.isArray(i.citations)
          ? (i.citations as unknown[])
              .map((c): string | null => {
                if (typeof c === "string") return c;
                if (c && typeof c === "object") {
                  const obj = c as Record<string, unknown>;
                  const src = typeof obj.source === "string" ? obj.source : null;
                  const ref = typeof obj.ref === "string" ? obj.ref : null;
                  if (src && ref) return `${src}: ${ref}`;
                  if (ref) return ref;
                  if (src) return src;
                }
                return null;
              })
              .filter((c): c is string => c !== null)
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
 * Fetch + parse the latest crawl_synthesizer output for a property.
 * The synthesizer reuses the insights JSON shape, so we route its
 * output through parseInsightsRecord. Returns an empty array when
 * no synthesizer row exists or parsing fails — it's additive and
 * non-critical to the primary insights render.
 */
async function fetchSynthesizedInsights(
  ctx: QueryCtx,
  propertyId: Id<"properties">,
  includePremium: boolean,
): Promise<ApiInsight[]> {
  const latestSynth = await ctx.db
    .query("aiEngineOutputs")
    .withIndex("by_propertyId_and_engineType", (q) =>
      q.eq("propertyId", propertyId).eq("engineType", "crawl_synthesizer"),
    )
    .order("desc")
    .first();
  if (!latestSynth) return [];
  if (latestSynth.reviewState === "rejected") return [];
  const parsed = parseInsightsRecord({
    output: latestSynth.output,
    generatedAt: latestSynth.generatedAt,
  });
  if (!parsed) return [];
  return includePremium
    ? parsed.insights
    : parsed.insights.filter((i) => i.premium === false);
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

    const synthesizedInsights = await fetchSynthesizedInsights(
      ctx,
      args.propertyId,
      false,
    );

    return {
      insights: publicOnly,
      overallConfidence: parsed.overallConfidence,
      generatedAt: latest.generatedAt,
      generatedAtEngine: "insights",
      hasGatedPremium: premiumOnly.length > 0,
      totalCount: parsed.insights.length,
      lockedTeasers,
      synthesizedInsights,
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

    const synthesizedInsights = await fetchSynthesizedInsights(
      ctx,
      dealRoom.propertyId,
      true,
    );

    return {
      insights: parsed.insights,
      overallConfidence: parsed.overallConfidence,
      generatedAt: latest.generatedAt,
      generatedAtEngine: "insights",
      hasGatedPremium: false,
      totalCount: parsed.insights.length,
      synthesizedInsights,
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

    const synthesizedInsights = await fetchSynthesizedInsights(
      ctx,
      args.propertyId,
      isStaff,
    );

    return {
      insights,
      overallConfidence: parsed.overallConfidence,
      generatedAt: latest.generatedAt,
      generatedAtEngine: "insights",
      hasGatedPremium,
      totalCount: parsed.insights.length,
      synthesizedInsights,
    };
  },
});
