/**
 * Risk summary — Convex module (KIN-850).
 *
 * Derives risk summaries from canonical property facts + file analysis
 * findings + manual broker entries. Exposes buyer-safe and internal
 * variants through role-filtered queries.
 *
 * Pure composer logic lives in `src/lib/risk/riskSummary.ts` — this
 * module mirrors the essential types and delegates composition to
 * inline helpers that match the pure layer bit-for-bit.
 *
 * Storage model: risk summaries are DERIVED on read, not persisted.
 * This avoids staleness — the moment a file finding is resolved or a
 * property fact changes, the next query produces a fresh summary.
 * A future optimization could cache by (propertyId, inputHash).
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ═══ Shared validators ═══

const severityValidator = v.union(
  v.literal("info"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const categoryValidator = v.union(
  v.literal("insurance"),
  v.literal("structural"),
  v.literal("title"),
  v.literal("hoa"),
  v.literal("flood"),
  v.literal("compliance"),
  v.literal("financial"),
  v.literal("other"),
);

// ═══ Auth helper ═══

async function resolveAccess(
  ctx: QueryCtx,
  dealRoomId: Id<"dealRooms">,
): Promise<{ role: "buyer" | "broker" | "admin"; dealRoom: Doc<"dealRooms"> } | null> {
  const user = await requireAuth(ctx);
  const dealRoom = await ctx.db.get(dealRoomId);
  if (!dealRoom) return null;
  if (dealRoom.buyerId === user._id) return { role: "buyer", dealRoom };
  if (user.role === "broker") return { role: "broker", dealRoom };
  if (user.role === "admin") return { role: "admin", dealRoom };
  return null;
}

// ═══ Inline composer (mirrors src/lib/risk/riskSummary.ts) ═══

type Severity = "info" | "low" | "medium" | "high" | "critical";
type Category =
  | "insurance"
  | "structural"
  | "title"
  | "hoa"
  | "flood"
  | "compliance"
  | "financial"
  | "other";
type ReviewState = "final" | "pending" | "review_required" | "resolved";

interface ComposedRisk {
  id: string;
  category: Category;
  severity: Severity;
  source: "property_facts" | "file_analysis" | "manual_broker" | "manual_agent";
  reviewState: ReviewState;
  title: string;
  buyerSummary: string;
  internalDetail: string;
  confidence: number;
  sourceRef: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const FINDING_RULE_TO_CATEGORY: Record<string, Category> = {
  roof_age_insurability: "insurance",
  hoa_reserves_adequate: "hoa",
  sirs_inspection_status: "compliance",
  flood_zone_risk: "flood",
  permit_irregularity: "compliance",
  lien_or_encumbrance: "title",
};

function classifyFloodZone(zone: string): {
  severity: Severity;
  reviewState: ReviewState;
  buyerSummary: string;
} {
  const z = zone.toUpperCase().trim();
  const highRisk = ["AE", "VE", "A", "V", "AO", "AH"];
  const lowRisk = ["X", "X500", "B"];
  if (highRisk.some((p) => z.startsWith(p) && !lowRisk.includes(z))) {
    return {
      severity: "high",
      reviewState: "review_required",
      buyerSummary: `Property is in FEMA flood zone ${z}, which requires flood insurance for federally-backed mortgages.`,
    };
  }
  if (lowRisk.includes(z)) {
    return {
      severity: "low",
      reviewState: "final",
      buyerSummary: `Property is in FEMA flood zone ${z} — moderate to minimal flood risk.`,
    };
  }
  return {
    severity: "medium",
    reviewState: "review_required",
    buyerSummary: `Property is in FEMA flood zone ${z}. Confirm insurance requirements with your lender.`,
  };
}

function classifyRoofAge(age: number): {
  severity: Severity;
  reviewState: ReviewState;
  title: string;
  buyerSummary: string;
} {
  if (age >= 20) {
    return {
      severity: "critical",
      reviewState: "review_required",
      title: `Roof age ${age} years — likely uninsurable`,
      buyerSummary: `Roof is ${age} years old. Most Florida insurers decline coverage at 20+ years without replacement.`,
    };
  }
  if (age >= 15) {
    return {
      severity: "high",
      reviewState: "review_required",
      title: `Roof age ${age} years — insurance may be limited`,
      buyerSummary: `Roof is ${age} years old. At 15+ years, many Florida carriers require wind mitigation or decline coverage.`,
    };
  }
  if (age >= 10) {
    return {
      severity: "medium",
      reviewState: "final",
      title: `Roof age ${age} years — monitor`,
      buyerSummary: `Roof is ${age} years old. Still insurable but nearing the Florida insurer threshold.`,
    };
  }
  return {
    severity: "info",
    reviewState: "final",
    title: `Roof age ${age} years`,
    buyerSummary: `Roof is ${age} years old — within typical Florida insurability window.`,
  };
}

// ═══ Queries ═══

/**
 * Derive and return the risk summary for a deal room. Role-filtered:
 * buyers get a BuyerRiskView (no internal detail, no source ref);
 * brokers/admins get the full summary.
 */
export const getForDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const access = await resolveAccess(ctx, args.dealRoomId);
    if (!access) return null;

    const property = await ctx.db.get(access.dealRoom.propertyId);
    if (!property) return null;

    // Load manual risks for this deal room
    const manual = await ctx.db
      .query("manualRisks")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    // NOTE: file-findings integration is deferred — once the
    // fileAnalysisFindings table (KIN-821) lands on main, wire it in
    // here via ctx.db.query("fileAnalysisFindings")
    //   .withIndex("by_dealRoomId", q => q.eq("dealRoomId", args.dealRoomId))
    // The composer in src/lib/risk/riskSummary.ts already supports
    // file-findings; only this query handler needs to feed them in.

    const currentYear = new Date().getUTCFullYear();
    const risks: ComposedRisk[] = [];

    // ─── Property facts → risks
    const propertyId = property._id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = property as any;

    if (typeof p.roofYear === "number" && p.roofYear > 0) {
      const age = currentYear - p.roofYear;
      if (age >= 0 && age < 100) {
        const classified = classifyRoofAge(age);
        risks.push({
          id: `property_roof_age_${propertyId}`,
          category: "insurance",
          severity: classified.severity,
          source: "property_facts",
          reviewState: classified.reviewState,
          title: classified.title,
          buyerSummary: classified.buyerSummary,
          internalDetail: `Derived from property record roofYear=${p.roofYear}`,
          confidence: 0.85,
          sourceRef: `property:${propertyId}:roofYear`,
        });
      }
    }

    if (typeof p.floodZone === "string" && p.floodZone.length > 0) {
      const classified = classifyFloodZone(p.floodZone);
      risks.push({
        id: `property_flood_zone_${propertyId}`,
        category: "flood",
        severity: classified.severity,
        source: "property_facts",
        reviewState: classified.reviewState,
        title: `Flood zone ${p.floodZone}`,
        buyerSummary: classified.buyerSummary,
        internalDetail: `Property record flood zone: ${p.floodZone}`,
        confidence: 0.9,
        sourceRef: `property:${propertyId}:floodZone`,
      });
    }

    if (
      typeof p.yearBuilt === "number" &&
      p.yearBuilt < 1994 &&
      p.impactWindows !== true &&
      p.stormShutters !== true
    ) {
      risks.push({
        id: `property_wind_mitigation_${propertyId}`,
        category: "structural",
        severity: "medium",
        source: "property_facts",
        reviewState: "final",
        title: "Pre-1994 construction without wind mitigation",
        buyerSummary: `Home built in ${p.yearBuilt} lacks impact windows and storm shutters. Florida insurers charge higher premiums for pre-code homes without mitigation features.`,
        internalDetail: `yearBuilt=${p.yearBuilt}, impactWindows=${p.impactWindows}, stormShutters=${p.stormShutters}`,
        confidence: 0.8,
        sourceRef: `property:${propertyId}:wind_mitigation`,
      });
    }

    // ─── Manual risks → risks
    for (const m of manual) {
      risks.push({
        id: `manual_${m._id}`,
        category: m.category,
        severity: m.severity,
        source: m.source,
        reviewState: "final",
        title: m.title,
        buyerSummary: m.buyerSummary,
        internalDetail: m.internalDetail,
        confidence: m.confidence,
        sourceRef: `manualRisks:${m._id}`,
      });
    }

    // ─── Aggregate
    const totals = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
    let worstSeverity: Severity = "info";
    let reviewRequiredCount = 0;
    for (const risk of risks) {
      totals[risk.severity]++;
      if (SEVERITY_RANK[risk.severity] > SEVERITY_RANK[worstSeverity]) {
        worstSeverity = risk.severity;
      }
      if (risk.reviewState === "review_required") {
        reviewRequiredCount++;
      }
    }
    const overallConfidence =
      risks.length === 0
        ? 1.0
        : Number(Math.min(...risks.map((r) => r.confidence)).toFixed(2));

    const summary = {
      risks,
      totals,
      worstSeverity,
      reviewRequiredCount,
      overallConfidence,
      composerVersion: "1.0.0",
    };

    // ─── Role filtering
    if (access.role === "buyer") {
      return {
        risks: risks.map((r) => ({
          id: r.id,
          category: r.category,
          severity: r.severity,
          reviewState: r.reviewState,
          title: r.title,
          summary: r.buyerSummary,
          confidence: r.confidence,
        })),
        totals: summary.totals,
        worstSeverity: summary.worstSeverity,
        reviewRequiredCount: summary.reviewRequiredCount,
        overallConfidence: summary.overallConfidence,
        composerVersion: summary.composerVersion,
      };
    }

    return summary;
  },
});

/**
 * Upsert a manual risk entry (broker/admin). Manual risks are stored
 * separately in the manualRisks table and composed into the summary
 * alongside property-facts and file-findings risks.
 *
 * Source semantics:
 *   - `source` arg is optional. When omitted it defaults to "manual_broker".
 *     Callers can pass "manual_agent" to record a risk that was flagged
 *     by a showing agent via an internal tool.
 *
 * Update semantics:
 *   - Partial updates preserve unspecified fields. Passing `undefined`
 *     for `internalDetail` does NOT blank existing broker notes —
 *     only an explicit empty string overwrites them.
 */
export const upsertManualRisk = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    riskId: v.optional(v.id("manualRisks")),
    category: categoryValidator,
    severity: severityValidator,
    title: v.string(),
    buyerSummary: v.string(),
    internalDetail: v.optional(v.string()),
    confidence: v.number(),
    source: v.optional(
      v.union(v.literal("manual_broker"), v.literal("manual_agent")),
    ),
  },
  returns: v.id("manualRisks"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can add manual risks");
    }

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const now = new Date().toISOString();

    if (args.riskId) {
      const existing = await ctx.db.get(args.riskId);
      if (!existing) throw new Error("Manual risk not found");
      if (existing.dealRoomId !== args.dealRoomId) {
        throw new Error("Manual risk does not belong to the specified deal room");
      }

      // Build a patch that only includes internalDetail when the caller
      // explicitly passed it. `undefined` means "don't touch this field";
      // an explicit empty string means "blank the existing note".
      const patch: Record<string, unknown> = {
        category: args.category,
        severity: args.severity,
        title: args.title,
        buyerSummary: args.buyerSummary,
        confidence: args.confidence,
        updatedAt: now,
      };
      if (args.internalDetail !== undefined) {
        patch.internalDetail = args.internalDetail;
      }
      if (args.source !== undefined) {
        patch.source = args.source;
      }
      await ctx.db.patch(args.riskId, patch);

      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "manual_risk_updated",
        entityType: "manualRisks",
        entityId: args.riskId,
        timestamp: now,
      });
      return args.riskId;
    }

    const id = await ctx.db.insert("manualRisks", {
      dealRoomId: args.dealRoomId,
      propertyId: dealRoom.propertyId,
      category: args.category,
      severity: args.severity,
      // Default to broker when not specified. Callers can explicitly
      // set "manual_agent" for agent-flagged risks.
      source: args.source ?? "manual_broker",
      title: args.title,
      buyerSummary: args.buyerSummary,
      internalDetail: args.internalDetail ?? "",
      confidence: args.confidence,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "manual_risk_added",
      entityType: "manualRisks",
      entityId: id,
      details: JSON.stringify({
        category: args.category,
        severity: args.severity,
      }),
      timestamp: now,
    });

    return id;
  },
});

/** Delete a manual risk entry. Broker/admin only. */
export const deleteManualRisk = mutation({
  args: { riskId: v.id("manualRisks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can delete manual risks");
    }
    const risk = await ctx.db.get(args.riskId);
    if (!risk) throw new Error("Manual risk not found");
    await ctx.db.delete(args.riskId);
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "manual_risk_deleted",
      entityType: "manualRisks",
      entityId: args.riskId,
      timestamp: new Date().toISOString(),
    });
    return null;
  },
});
