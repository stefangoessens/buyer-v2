/**
 * Inspection parser mutations (KIN-1081) — V8-runtime side.
 *
 * Convex requires mutations to run in V8, so the inspection parser
 * action (Node runtime) cannot define its own mutations in the same
 * file. This module holds the internal mutations the inspection
 * parser action calls via `ctx.runMutation`. Mirrors the split in
 * `disclosureParserMutations.ts`.
 *
 * Mutations:
 *   - createInspectionFileJob:    open a per-file fileAnalysisJobs row
 *                                  in `running` state.
 *   - failInspectionFileJob:      mark job failed when OCR / LLM throws.
 *   - fanOutInspectionFindings:   upsert per-file findings into
 *                                  fileAnalysisFindings, keyed on
 *                                  (packetId, findingKey).
 *   - writeInspectionFacts:       write normalized facts into fileFacts.
 *   - updatePacketInspectionMetadata: patch the packet's per-file row
 *                                  with parsed reportType + inspector data.
 *   - writeInspectionEngineOutput: insert an aiEngineOutputs row for
 *                                  the parser's structured output.
 *   - writeNegotiationSummary:    persist buyer + internal summaries
 *                                  on the packet row, set review state.
 *   - recordInspectionAudit:      audit row for the packet roll-up.
 *
 * All mutations are internal — only the parser action + tests should
 * call them.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const INSPECTION_ENGINE_VERSION = "inspectionParser-1.0.0";

// ─── Validators ─────────────────────────────────────────────────────────────

const buyerSeverityValidator = v.union(
  v.literal("life_safety"),
  v.literal("major_repair"),
  v.literal("monitor"),
  v.literal("cosmetic"),
);

const inspectionSystemValidator = v.union(
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
);

const costBasisValidator = v.union(
  v.literal("llm_only"),
  v.literal("llm_plus_rule"),
);

const reportTypeValidator = v.union(
  v.literal("general_inspection"),
  v.literal("four_point"),
  v.literal("wind_mitigation"),
  v.literal("wdo"),
  v.literal("pool"),
  v.literal("seawall"),
  v.literal("dock"),
  v.literal("sprinkler"),
  v.literal("septic"),
  v.literal("other"),
);

const reportTypeSourceValidator = v.union(
  v.literal("parser"),
  v.literal("broker_override"),
);

const licenseStatusValidator = v.union(
  v.literal("parsed"),
  v.literal("missing"),
  v.literal("malformed"),
);

const valueKindValidator = v.union(
  v.literal("numeric"),
  v.literal("text"),
  v.literal("boolean"),
  v.literal("enum"),
);

// Inspection findings re-use the legacy `rule` enum because the
// fileAnalysisFindings table validator still requires one of these.
// `permit_irregularity` is the closest umbrella for "broker should
// review this inspection finding".
const INSPECTION_RULE = "permit_irregularity" as const;

// Map buyer severity → fileAnalysisFindings.severity enum so the
// existing review queue / risk summary code paths see inspection
// findings.
function severityFor(
  buyerSeverity: "life_safety" | "major_repair" | "monitor" | "cosmetic",
): "info" | "low" | "medium" | "high" | "critical" {
  switch (buyerSeverity) {
    case "life_safety":
      return "critical";
    case "major_repair":
      return "high";
    case "monitor":
      return "medium";
    case "cosmetic":
      return "low";
  }
}

// Map buyer severity → fileAnalysisFindings.category union (extended
// in KIN-1081 to include the four inspection categories).
function categoryFor(
  buyerSeverity: "life_safety" | "major_repair" | "monitor" | "cosmetic",
): "safety" | "major_repair" | "monitor" | "cosmetic" {
  if (buyerSeverity === "life_safety") return "safety";
  return buyerSeverity;
}

// ═══ Job lifecycle ══════════════════════════════════════════════════════════

export const createInspectionFileJob = internalMutation({
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
    return await ctx.db.insert("fileAnalysisJobs", {
      dealRoomId: packet.dealRoomId,
      propertyId: packet.propertyId,
      fileStorageId: args.storageId,
      fileName: args.fileName,
      docType: "inspection_report",
      status: "running",
      errorCount: 0,
      uploadedBy: packet.buyerId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const failInspectionFileJob = internalMutation({
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

// ═══ Findings fan-out ═══════════════════════════════════════════════════════

export const fanOutInspectionFindings = internalMutation({
  args: {
    jobId: v.id("fileAnalysisJobs"),
    packetId: v.id("disclosurePackets"),
    packetVersion: v.number(),
    sourceFileName: v.string(),
    findings: v.array(
      v.object({
        findingKey: v.string(),
        system: inspectionSystemValidator,
        title: v.string(),
        buyerSeverity: buyerSeverityValidator,
        buyerFriendlyExplanation: v.string(),
        recommendedAction: v.string(),
        pageReference: v.union(v.string(), v.null()),
        evidenceQuote: v.union(v.string(), v.null()),
        confidence: v.number(),
        estimatedCostLowUsd: v.optional(v.number()),
        estimatedCostHighUsd: v.optional(v.number()),
        costEstimateConfidence: v.optional(v.number()),
        costEstimateBasis: v.optional(costBasisValidator),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    const now = new Date().toISOString();

    // Pre-load packet findings ONCE so we can dedupe by findingKey
    // without a per-finding query.
    const existingForPacket = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_packetId", (q) => q.eq("packetId", args.packetId))
      .collect();

    for (const finding of args.findings) {
      const requiresReview =
        finding.buyerSeverity === "life_safety" ||
        finding.buyerSeverity === "major_repair";

      const base = {
        jobId: args.jobId,
        dealRoomId: job.dealRoomId,
        rule: INSPECTION_RULE,
        severity: severityFor(finding.buyerSeverity),
        label: finding.title,
        summary: finding.buyerFriendlyExplanation,
        confidence: finding.confidence,
        requiresReview,
        category: categoryFor(finding.buyerSeverity),
        pageReference: finding.pageReference ?? undefined,
        evidenceQuote: finding.evidenceQuote ?? undefined,
        sourceFileName: args.sourceFileName,
        buyerFriendlyExplanation: finding.buyerFriendlyExplanation,
        recommendedAction: finding.recommendedAction,
        packetVersion: args.packetVersion,
        packetId: args.packetId,
        findingKey: finding.findingKey,
        // Inspection-only fields
        buyerSeverity: finding.buyerSeverity,
        system: finding.system,
        estimatedCostLowUsd: finding.estimatedCostLowUsd,
        estimatedCostHighUsd: finding.estimatedCostHighUsd,
        costEstimateConfidence: finding.costEstimateConfidence,
        costEstimateBasis: finding.costEstimateBasis,
      };

      const match = existingForPacket.find(
        (f) => f.findingKey === finding.findingKey,
      );

      if (match) {
        await ctx.db.patch(match._id, base);
      } else {
        await ctx.db.insert("fileAnalysisFindings", {
          ...base,
          createdAt: now,
        });
      }
    }

    return null;
  },
});

// ═══ Facts ══════════════════════════════════════════════════════════════════

export const writeInspectionFacts = internalMutation({
  args: {
    propertyId: v.id("properties"),
    dealRoomId: v.id("dealRooms"),
    storageId: v.id("_storage"),
    facts: v.array(
      v.object({
        factSlug: v.string(),
        valueKind: valueKindValidator,
        valueNumeric: v.optional(v.number()),
        valueNumericUnit: v.optional(v.string()),
        valueText: v.optional(v.string()),
        valueBoolean: v.optional(v.boolean()),
        valueEnum: v.optional(v.string()),
        valueEnumAllowed: v.optional(v.array(v.string())),
        confidence: v.optional(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    for (const fact of args.facts) {
      // Idempotency: if a prior fact for the same (storageId, factSlug)
      // exists, mark it superseded and write the new row. Keeps history
      // intact for broker review without polluting the live read set.
      const prior = await ctx.db
        .query("fileFacts")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
        .collect();
      for (const p of prior) {
        if (p.factSlug === fact.factSlug && p.reviewStatus !== "superseded") {
          await ctx.db.patch(p._id, {
            reviewStatus: "superseded",
            updatedAt: now,
          });
        }
      }

      await ctx.db.insert("fileFacts", {
        factSlug: fact.factSlug,
        storageId: args.storageId,
        propertyId: args.propertyId,
        dealRoomId: args.dealRoomId,
        valueKind: fact.valueKind,
        valueNumeric: fact.valueNumeric,
        valueNumericUnit: fact.valueNumericUnit,
        valueText: fact.valueText,
        valueBoolean: fact.valueBoolean,
        valueEnum: fact.valueEnum,
        valueEnumAllowed: fact.valueEnumAllowed,
        confidence: fact.confidence,
        reviewStatus: "needsReview",
        internalOnly: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

// ═══ Packet metadata ════════════════════════════════════════════════════════

export const updatePacketInspectionMetadata = internalMutation({
  args: {
    packetId: v.id("disclosurePackets"),
    storageId: v.id("_storage"),
    reportType: v.optional(reportTypeValidator),
    reportTypeConfidence: v.optional(v.number()),
    reportTypeSource: v.optional(reportTypeSourceValidator),
    inspectorName: v.optional(v.string()),
    inspectorLicenseNumber: v.optional(v.string()),
    inspectorLicenseVerificationStatus: v.optional(licenseStatusValidator),
    inspectionDate: v.optional(v.string()),
    inspectionAddressFromReport: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) throw new Error("Packet not found");

    const nextFiles = packet.files.map((f) => {
      if (f.storageId !== args.storageId) return f;
      return {
        ...f,
        reportType: args.reportType ?? f.reportType,
        reportTypeConfidence: args.reportTypeConfidence ?? f.reportTypeConfidence,
        reportTypeSource: args.reportTypeSource ?? f.reportTypeSource,
        inspectorName: args.inspectorName ?? f.inspectorName,
        inspectorLicenseNumber:
          args.inspectorLicenseNumber ?? f.inspectorLicenseNumber,
        inspectorLicenseVerificationStatus:
          args.inspectorLicenseVerificationStatus ??
          f.inspectorLicenseVerificationStatus,
        inspectionDate: args.inspectionDate ?? f.inspectionDate,
        inspectionAddressFromReport:
          args.inspectionAddressFromReport ?? f.inspectionAddressFromReport,
      };
    });

    await ctx.db.patch(args.packetId, {
      files: nextFiles,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// ═══ Engine output row ══════════════════════════════════════════════════════

export const writeInspectionEngineOutput = internalMutation({
  args: {
    propertyId: v.id("properties"),
    packetId: v.id("disclosurePackets"),
    output: v.string(),
    confidence: v.number(),
    modelId: v.string(),
    citations: v.array(v.string()),
  },
  returns: v.id("aiEngineOutputs"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("aiEngineOutputs", {
      propertyId: args.propertyId,
      engineType: "doc_parser",
      confidence: args.confidence,
      citations: args.citations,
      reviewState: args.confidence >= 0.8 ? "approved" : "pending",
      output: args.output,
      modelId: args.modelId,
      generatedAt: now,
    });
  },
});

// ═══ Negotiation summary ════════════════════════════════════════════════════

export const writeNegotiationSummary = internalMutation({
  args: {
    packetId: v.id("disclosurePackets"),
    negotiationSummaryBuyer: v.string(),
    negotiationSummaryInternal: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) throw new Error("Packet not found");
    const now = new Date().toISOString();
    await ctx.db.patch(args.packetId, {
      negotiationSummaryBuyer: args.negotiationSummaryBuyer,
      negotiationSummaryInternal: args.negotiationSummaryInternal,
      negotiationSummaryReviewState: "pending",
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      action: "inspection_negotiation_summary_written",
      entityType: "disclosurePackets",
      entityId: args.packetId,
      details: JSON.stringify({
        dealRoomId: packet.dealRoomId,
        buyerLength: args.negotiationSummaryBuyer.length,
        internalLength: args.negotiationSummaryInternal.length,
      }),
      timestamp: now,
    });
    return null;
  },
});

// ═══ Audit ══════════════════════════════════════════════════════════════════

export const recordInspectionAudit = internalMutation({
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
      action: "inspection_packet_analyzed",
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

