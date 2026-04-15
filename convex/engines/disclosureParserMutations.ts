/**
 * Disclosure parser mutations (KIN-1078) — V8-runtime side.
 *
 * Convex requires mutations to run in V8, so the disclosure parser
 * action (Node runtime) cannot define its own mutations in the same
 * file. This module holds the internal mutations the parser action
 * calls via `ctx.runMutation`:
 *
 *   - createPacketFileJob:  open a per-file fileAnalysisJobs row in
 *                           `running` state.
 *   - persistFileAnalysis:  fan findings into fileAnalysisFindings,
 *                           patch the job, and write an aiEngineOutputs
 *                           row for copilot resolution.
 *   - failPacketFileJob:    mark the job failed when OCR / LLM throws.
 *   - recordPacketAudit:    audit row for the packet-level roll-up.
 *
 * All mutations are internal — only the parser action + tests should
 * call them.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const DISCLOSURE_ENGINE_VERSION = "disclosureParser-1.0.0";

export const createPacketFileJob = internalMutation({
  args: {
    packetId: v.id("disclosurePackets"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  returns: v.id("fileAnalysisJobs"),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) throw new Error("Packet not found");
    const now = new Date().toISOString();
    const jobId = await ctx.db.insert("fileAnalysisJobs", {
      dealRoomId: packet.dealRoomId,
      propertyId: packet.propertyId,
      fileStorageId: args.storageId,
      fileName: args.fileName,
      docType: "seller_disclosure",
      status: "running",
      errorCount: 0,
      uploadedBy: packet.buyerId,
      createdAt: now,
      updatedAt: now,
    });
    return jobId;
  },
});

export const persistFileAnalysis = internalMutation({
  args: {
    jobId: v.id("fileAnalysisJobs"),
    packetId: v.id("disclosurePackets"),
    packetVersion: v.number(),
    sourceFileName: v.string(),
    payload: v.string(),
    overallSeverity: v.union(
      v.literal("info"),
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical"),
    ),
    overallConfidence: v.number(),
    modelId: v.string(),
    findings: v.array(
      v.object({
        rule: v.union(
          v.literal("roof_age_insurability"),
          v.literal("hoa_reserves_adequate"),
          v.literal("sirs_inspection_status"),
          v.literal("flood_zone_risk"),
          v.literal("permit_irregularity"),
          v.literal("lien_or_encumbrance"),
        ),
        severity: v.union(
          v.literal("info"),
          v.literal("low"),
          v.literal("medium"),
          v.literal("high"),
          v.literal("critical"),
        ),
        label: v.string(),
        summary: v.string(),
        confidence: v.number(),
        requiresReview: v.boolean(),
        category: v.union(
          v.literal("structural"),
          v.literal("water"),
          v.literal("hoa"),
          v.literal("legal"),
          v.literal("insurance"),
          v.literal("environmental"),
          v.literal("title"),
          v.literal("not_disclosed"),
        ),
        pageReference: v.optional(v.string()),
        evidenceQuote: v.optional(v.string()),
        buyerFriendlyExplanation: v.string(),
        recommendedAction: v.string(),
        findingKey: v.string(),
      }),
    ),
  },
  returns: v.id("aiEngineOutputs"),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    const requiresBrokerReview = args.findings.some((f) => f.requiresReview);
    const nextStatus: "review_required" | "completed" = requiresBrokerReview
      ? "review_required"
      : "completed";
    const now = new Date().toISOString();

    await ctx.db.patch(args.jobId, {
      status: nextStatus,
      payload: args.payload,
      overallSeverity: args.overallSeverity,
      overallConfidence: args.overallConfidence,
      requiresBrokerReview,
      engineVersion: DISCLOSURE_ENGINE_VERSION,
      errorMessage: undefined,
      updatedAt: now,
      completedAt: now,
    });

    // Upsert each finding keyed by (packetId, findingKey) so re-parses
    // of the same packet don't duplicate rows.
    const existingForPacket = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_packetId", (q) => q.eq("packetId", args.packetId))
      .collect();

    for (const finding of args.findings) {
      const match = existingForPacket.find(
        (f) => f.findingKey === finding.findingKey,
      );

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
        sourceFileName: args.sourceFileName,
        buyerFriendlyExplanation: finding.buyerFriendlyExplanation,
        recommendedAction: finding.recommendedAction,
        packetVersion: args.packetVersion,
        packetId: args.packetId,
        findingKey: finding.findingKey,
      };

      if (match) {
        await ctx.db.patch(match._id, base);
      } else {
        await ctx.db.insert("fileAnalysisFindings", {
          ...base,
          createdAt: now,
        });
      }
    }

    const outputId = await ctx.db.insert("aiEngineOutputs", {
      propertyId: job.propertyId,
      engineType: "doc_parser",
      confidence: args.overallConfidence,
      citations: [args.sourceFileName],
      reviewState: args.overallConfidence >= 0.8 ? "approved" : "pending",
      output: args.payload,
      modelId: args.modelId,
      generatedAt: now,
    });

    return outputId;
  },
});

export const failPacketFileJob = internalMutation({
  args: {
    jobId: v.id("fileAnalysisJobs"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const now = new Date().toISOString();
    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      errorCount: job.errorCount + 1,
      updatedAt: now,
    });
    return null;
  },
});

export const recordPacketAudit = internalMutation({
  args: {
    packetId: v.id("disclosurePackets"),
    dealRoomId: v.id("dealRooms"),
    finalStatus: v.union(
      v.literal("ready"),
      v.literal("partial_failure"),
      v.literal("failed"),
    ),
    totalFiles: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    totalFindings: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.insert("auditLog", {
      action: "disclosure_packet_analyzed",
      entityType: "disclosurePackets",
      entityId: args.packetId,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        finalStatus: args.finalStatus,
        totalFiles: args.totalFiles,
        succeeded: args.succeeded,
        failed: args.failed,
        totalFindings: args.totalFindings,
      }),
      timestamp: now,
    });
    return null;
  },
});
