/**
 * File analysis job pipeline — Convex module (KIN-821).
 *
 * Orchestrates the upload → classify → extract → rule-eval → review
 * lifecycle for buyer/seller documents (seller disclosures, HOA docs,
 * inspection reports, title commitments, surveys). The actual analysis
 * engine is pure in `src/lib/ai/engines/docParser.ts`; this module
 * handles persistence, auth, findings fan-out, and review workflow.
 *
 * Role-based visibility:
 *   - Buyer: their own jobs + buyer-visible finding fields (no internal
 *     notes, no review metadata beyond "review required")
 *   - Broker/admin: everything
 *
 * High-severity findings CANNOT be auto-resolved. A broker must
 * explicitly review and resolve them via `resolveJob`.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ═══ Shared validators ═══

const docTypeValidator = v.union(
  v.literal("unknown"),
  v.literal("seller_disclosure"),
  v.literal("hoa_document"),
  v.literal("inspection_report"),
  v.literal("title_commitment"),
  v.literal("survey"),
  v.literal("other"),
);

const severityValidator = v.union(
  v.literal("info"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const ruleValidator = v.union(
  v.literal("roof_age_insurability"),
  v.literal("hoa_reserves_adequate"),
  v.literal("sirs_inspection_status"),
  v.literal("flood_zone_risk"),
  v.literal("permit_irregularity"),
  v.literal("lien_or_encumbrance"),
);

// ═══ Access helpers ═══

async function canReadDealRoom(
  ctx: QueryCtx,
  dealRoomId: Id<"dealRooms">,
): Promise<"buyer" | "broker" | "admin" | null> {
  const user = await requireAuth(ctx);
  const dealRoom = await ctx.db.get(dealRoomId);
  if (!dealRoom) return null;

  if (dealRoom.buyerId === user._id) return "buyer";
  if (user.role === "broker") return "broker";
  if (user.role === "admin") return "admin";
  return null;
}

/** Strip internal-only fields from a job for buyer-facing responses. */
function stripJobForBuyer(job: Doc<"fileAnalysisJobs">): Record<string, unknown> {
  const {
    reviewedBy: _r,
    reviewNotes: _rn,
    errorCount: _ec,
    errorMessage: _em,
    ...buyerVisible
  } = job;
  return buyerVisible;
}

/** Strip internal-only fields from a finding for buyer-facing responses. */
function stripFindingForBuyer(
  finding: Doc<"fileAnalysisFindings">,
): Record<string, unknown> {
  const {
    resolutionNotes: _notes,
    resolvedBy: _by,
    ...buyerVisible
  } = finding;
  return buyerVisible;
}

// ═══ Queries ═══

/** List all jobs for a deal room. Access-gated. */
export const listByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const access = await canReadDealRoom(ctx, args.dealRoomId);
    if (!access) return [];

    const jobs = await ctx.db
      .query("fileAnalysisJobs")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const sorted = jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return access === "buyer" ? sorted.map(stripJobForBuyer) : sorted;
  },
});

/** Get a single job with its findings, access-filtered. */
export const getWithFindings = query({
  args: { jobId: v.id("fileAnalysisJobs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const access = await canReadDealRoom(ctx, job.dealRoomId);
    if (!access) return null;

    const findings = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    if (access === "buyer") {
      return {
        job: stripJobForBuyer(job),
        findings: findings.map(stripFindingForBuyer),
      };
    }
    return { job, findings };
  },
});

/** Ops review queue — findings that require broker review, by severity. */
export const listReviewQueue = query({
  args: { severity: v.optional(severityValidator) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return [];

    const flagged = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_requiresReview_and_severity", (q) =>
        q.eq("requiresReview", true),
      )
      .collect();

    const unresolved = flagged.filter((f) => f.resolvedAt === undefined);
    const filtered = args.severity
      ? unresolved.filter((f) => f.severity === args.severity)
      : unresolved;

    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

// ═══ Mutations ═══

/**
 * Enqueue a new analysis job. Buyer or broker can submit; the job starts
 * in `queued` state and is picked up by a background action that runs
 * the engine and calls `recordAnalysisResult`.
 */
export const enqueueJob = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
  },
  returns: v.id("fileAnalysisJobs"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");
    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to enqueue analysis jobs for this deal room");
    }

    const now = new Date().toISOString();
    const id = await ctx.db.insert("fileAnalysisJobs", {
      dealRoomId: args.dealRoomId,
      propertyId: dealRoom.propertyId,
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      docType: "unknown",
      status: "queued",
      errorCount: 0,
      uploadedBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "file_analysis_job_enqueued",
      entityType: "fileAnalysisJobs",
      entityId: id,
      details: JSON.stringify({ fileName: args.fileName }),
      timestamp: now,
    });

    return id;
  },
});

/**
 * Mark a job as running — called by the background worker before it
 * invokes the analysis engine. Internal only.
 */
export const markRunning = internalMutation({
  args: { jobId: v.id("fileAnalysisJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "queued" && job.status !== "failed") {
      throw new Error(`Cannot mark running from status "${job.status}"`);
    }
    await ctx.db.patch(args.jobId, {
      status: "running",
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

/**
 * Record the analysis result from the engine. Inserts findings fan-out
 * and transitions the job to `completed` or `review_required`. Internal —
 * called by the worker.
 *
 * Idempotency + safety:
 *   - REJECTS calls unless the job is in `running` state. Prevents a
 *     replayed/internal duplicate call from overwriting a
 *     completed/review_required/resolved job and reopening already-
 *     reviewed work.
 *   - The requiresBrokerReview flag is IGNORED — computed from the
 *     findings payload directly (any finding.requiresReview === true).
 *     This prevents a mismatched caller from marking a job "completed"
 *     when findings still need review.
 */
export const recordAnalysisResult = internalMutation({
  args: {
    jobId: v.id("fileAnalysisJobs"),
    docType: docTypeValidator,
    payload: v.string(),
    overallSeverity: severityValidator,
    overallConfidence: v.number(),
    engineVersion: v.string(),
    findings: v.array(
      v.object({
        rule: ruleValidator,
        severity: severityValidator,
        label: v.string(),
        summary: v.string(),
        confidence: v.number(),
        requiresReview: v.boolean(),
        // KIN-1078 — optional disclosure-packet-aware fields. Pre-existing
        // docParser callers omit these; disclosureParser populates them.
        // KIN-1081 extends the union with the four inspection categories
        // (`safety`, `major_repair`, `monitor`, `cosmetic`).
        category: v.optional(
          v.union(
            v.literal("structural"),
            v.literal("water"),
            v.literal("hoa"),
            v.literal("legal"),
            v.literal("insurance"),
            v.literal("environmental"),
            v.literal("title"),
            v.literal("not_disclosed"),
            v.literal("safety"),
            v.literal("major_repair"),
            v.literal("monitor"),
            v.literal("cosmetic"),
          ),
        ),
        pageReference: v.optional(v.string()),
        evidenceQuote: v.optional(v.string()),
        sourceFileName: v.optional(v.string()),
        buyerFriendlyExplanation: v.optional(v.string()),
        recommendedAction: v.optional(v.string()),
        packetVersion: v.optional(v.number()),
        packetId: v.optional(v.id("disclosurePackets")),
        findingKey: v.optional(v.string()),
        // KIN-1081 — inspection-only fields. The inspection parser
        // populates them; disclosure parsers and legacy callers leave
        // them undefined. `acknowledgedAt`/`acknowledgedByUserId` are
        // intentionally NOT accepted here — those flow through the
        // separate `acknowledgeLifeSafetyFinding` mutation.
        buyerSeverity: v.optional(
          v.union(
            v.literal("life_safety"),
            v.literal("major_repair"),
            v.literal("monitor"),
            v.literal("cosmetic"),
          ),
        ),
        system: v.optional(
          v.union(
            v.literal("roof"),
            v.literal("hvac"),
            v.literal("electrical"),
            v.literal("plumbing"),
            v.literal("structural"),
            v.literal("exterior"),
            v.literal("interior"),
            v.literal("grounds"),
            v.literal("appliances"),
            v.literal("pest"),
          ),
        ),
        estimatedCostLowUsd: v.optional(v.number()),
        estimatedCostHighUsd: v.optional(v.number()),
        costEstimateConfidence: v.optional(v.number()),
        costEstimateBasis: v.optional(
          v.union(
            v.literal("llm_only"),
            v.literal("llm_plus_rule"),
            v.literal("broker_override"),
          ),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    // Only accept result writes for jobs currently in `running` state.
    // This guards against replayed worker calls after the job has
    // already transitioned to completed/review_required/resolved.
    if (job.status !== "running") {
      throw new Error(
        `Cannot record analysis result on job in status "${job.status}" — only running jobs accept results`,
      );
    }

    // Derive requiresBrokerReview from the findings array, NOT from a
    // caller-supplied flag. If any finding needs review, the job must be
    // routed to review_required so resolveJob can act on it.
    const requiresBrokerReview = args.findings.some((f) => f.requiresReview);
    const nextStatus = requiresBrokerReview ? "review_required" : "completed";

    const now = new Date().toISOString();

    await ctx.db.patch(args.jobId, {
      docType: args.docType,
      status: nextStatus,
      payload: args.payload,
      overallSeverity: args.overallSeverity,
      overallConfidence: args.overallConfidence,
      requiresBrokerReview,
      engineVersion: args.engineVersion,
      errorMessage: undefined,
      updatedAt: now,
      completedAt: now,
    });

    // Fan out findings so the review queue can index them directly.
    //
    // Upsert-by-findingKey: if the caller supplies a findingKey AND a
    // packetId, any existing finding matching that (packetId, findingKey)
    // is patched in place rather than duplicated. This keeps disclosure
    // re-parses idempotent when the same rule hits the same doc again.
    for (const finding of args.findings) {
      const base = {
        jobId: args.jobId,
        dealRoomId: job.dealRoomId,
        rule: finding.rule,
        severity: finding.severity,
        label: finding.label,
        summary: finding.summary,
        confidence: finding.confidence,
        requiresReview: finding.requiresReview,
        category: finding.category,
        pageReference: finding.pageReference,
        evidenceQuote: finding.evidenceQuote,
        sourceFileName: finding.sourceFileName,
        buyerFriendlyExplanation: finding.buyerFriendlyExplanation,
        recommendedAction: finding.recommendedAction,
        packetVersion: finding.packetVersion,
        packetId: finding.packetId,
        findingKey: finding.findingKey,
        // KIN-1081 — inspection-only fields; undefined for disclosure rows.
        buyerSeverity: finding.buyerSeverity,
        system: finding.system,
        estimatedCostLowUsd: finding.estimatedCostLowUsd,
        estimatedCostHighUsd: finding.estimatedCostHighUsd,
        costEstimateConfidence: finding.costEstimateConfidence,
        costEstimateBasis: finding.costEstimateBasis,
      };

      let existingId: Id<"fileAnalysisFindings"> | null = null;
      if (finding.packetId && finding.findingKey) {
        const existingForPacket = await ctx.db
          .query("fileAnalysisFindings")
          .withIndex("by_packetId", (q) => q.eq("packetId", finding.packetId))
          .collect();
        const match = existingForPacket.find(
          (f) => f.findingKey === finding.findingKey,
        );
        if (match) existingId = match._id;
      }

      if (existingId) {
        await ctx.db.patch(existingId, base);
      } else {
        await ctx.db.insert("fileAnalysisFindings", {
          ...base,
          createdAt: now,
        });
      }
    }

    await ctx.db.insert("auditLog", {
      action: `file_analysis_${nextStatus}`,
      entityType: "fileAnalysisJobs",
      entityId: args.jobId,
      details: JSON.stringify({
        docType: args.docType,
        severity: args.overallSeverity,
        findingCount: args.findings.length,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Record a failure in analysis. Bumps errorCount, stores message, keeps
 * the job queryable for retry. Internal.
 *
 * Same guard as recordAnalysisResult: only accepts failure callbacks
 * for jobs currently in `running` state. Prevents a replayed/duplicate
 * worker failure callback from reopening a completed/review_required/
 * resolved job — which would otherwise corrupt already-reviewed work.
 */
export const recordFailure = internalMutation({
  args: {
    jobId: v.id("fileAnalysisJobs"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    if (job.status !== "running") {
      throw new Error(
        `Cannot record failure on job in status "${job.status}" — only running jobs accept failure callbacks`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      errorCount: job.errorCount + 1,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: "file_analysis_failed",
      entityType: "fileAnalysisJobs",
      entityId: args.jobId,
      details: JSON.stringify({
        errorMessage: args.errorMessage,
        errorCount: job.errorCount + 1,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Retry a failed job — resets status to queued so the worker picks it
 * up again. Broker/admin only.
 */
export const retryJob = mutation({
  args: { jobId: v.id("fileAnalysisJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can retry failed jobs");
    }
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "failed") {
      throw new Error(`Cannot retry job in status "${job.status}"`);
    }
    const now = new Date().toISOString();
    await ctx.db.patch(args.jobId, {
      status: "queued",
      errorMessage: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "file_analysis_retry",
      entityType: "fileAnalysisJobs",
      entityId: args.jobId,
      timestamp: now,
    });
    return null;
  },
});

/**
 * Resolve a review-required job. Broker/admin only. Sets status to
 * "resolved" and allows optional resolution notes. Cannot be called on
 * jobs that aren't in review_required state — this enforces the rule
 * that high-severity findings must go through explicit review.
 */
export const resolveJob = mutation({
  args: {
    jobId: v.id("fileAnalysisJobs"),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can resolve review jobs");
    }
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "review_required") {
      throw new Error(
        `Cannot resolve job in status "${job.status}" — only review_required jobs are eligible`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.jobId, {
      status: "resolved",
      reviewedBy: user._id,
      reviewNotes: args.notes,
      resolvedAt: now,
      updatedAt: now,
    });

    // Mark all findings for this job as resolved.
    const findings = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
    for (const finding of findings) {
      if (finding.resolvedAt === undefined) {
        await ctx.db.patch(finding._id, {
          resolvedAt: now,
          resolvedBy: user._id,
          resolutionNotes: args.notes,
        });
      }
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "file_analysis_resolved",
      entityType: "fileAnalysisJobs",
      entityId: args.jobId,
      details: args.notes ? JSON.stringify({ notes: args.notes }) : undefined,
      timestamp: now,
    });

    return null;
  },
});

// ═══ KIN-1081: inspection finding surfaces ═══

/**
 * Buyer acknowledgment for a life-safety inspection finding. The
 * inspection UI requires every life_safety finding to be explicitly
 * acknowledged by the buyer before the negotiation summary can be
 * published. Only the packet's owning buyer can acknowledge their own
 * findings.
 */
export const acknowledgeLifeSafetyFinding = mutation({
  args: { findingId: v.id("fileAnalysisFindings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const finding = await ctx.db.get(args.findingId);
    if (!finding) throw new Error("Finding not found");

    if (!finding.packetId) {
      throw new Error("Finding is not attached to a packet");
    }
    const packet = await ctx.db.get(finding.packetId);
    if (!packet) throw new Error("Packet not found");
    if (packet.buyerId !== user._id) {
      throw new Error("Only the packet's buyer can acknowledge this finding");
    }
    if (finding.buyerSeverity !== "life_safety") {
      throw new Error("Only life_safety findings can be acknowledged");
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.findingId, {
      acknowledgedAt: now,
      acknowledgedByUserId: user._id,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "inspection_life_safety_acknowledged",
      entityType: "fileAnalysisFindings",
      entityId: args.findingId,
      timestamp: now,
    });

    return null;
  },
});

/**
 * Fetch all findings for an inspection packet. Used by the inspection
 * tab + negotiation summary surfaces. Access is gated through the
 * deal room (buyer + broker + admin); rejects packets whose workflow
 * is not "inspection" so disclosure callers don't accidentally route
 * through this query.
 */
export const getInspectionFindingsByPacket = query({
  args: { packetId: v.id("disclosurePackets") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) return [];
    if (packet.workflow !== "inspection") return [];

    const access = await canReadDealRoom(ctx, packet.dealRoomId);
    if (!access) return [];

    const findings = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_packetId", (q) => q.eq("packetId", args.packetId))
      .collect();

    const sorted = [...findings].sort((a, b) => {
      const severityOrder: Record<string, number> = {
        life_safety: 0,
        major_repair: 1,
        monitor: 2,
        cosmetic: 3,
      };
      const aSeverity =
        a.buyerSeverity !== undefined ? severityOrder[a.buyerSeverity] : 99;
      const bSeverity =
        b.buyerSeverity !== undefined ? severityOrder[b.buyerSeverity] : 99;
      if (aSeverity !== bSeverity) return aSeverity - bSeverity;
      const aSystem = a.system ?? "";
      const bSystem = b.system ?? "";
      return aSystem.localeCompare(bSystem);
    });

    return access === "buyer" ? sorted.map(stripFindingForBuyer) : sorted;
  },
});
