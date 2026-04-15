"use node";

/**
 * Disclosure parser orchestrator (KIN-1078).
 *
 * Node-runtime Convex action that walks every file in a disclosure
 * packet through OCR → PII redaction → LLM analysis → per-file
 * persistence → packet-level status roll-up.
 *
 * Why Node runtime: the Anthropic SDK inside gateway.ts uses Node-only
 * streaming primitives, and the OCR service client is node-safe.
 *
 * Scheduling: `scheduleDisclosureParser` is exposed as an internal
 * action so `convex/disclosures.ts#commitUpload` can fire it after
 * inserting a new packet row. Mutations required for persistence live
 * in the sibling `disclosureParserMutations.ts` module so they run on
 * the V8 runtime.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  parseDisclosureText,
  DisclosureParseError,
  type DisclosureFinding,
  type DisclosureNotMentioned,
  type DisclosureParserOutput,
} from "../../src/lib/ai/engines/disclosureParser";
import { deepScrubPii } from "../../src/lib/security/pii-guard";

// ═══ Constants ══════════════════════════════════════════════════════════

const DISCLOSURE_ENGINE_VERSION = "disclosureParser-1.0.0";
const OCR_TIMEOUT_MS = 120_000;

// LLM buyer-friendly categories → fileAnalysisFindings.rule enum. The
// rule field is tightly constrained on the schema side; we pick the
// closest legacy rule so the existing review queue indexes still work.
const CATEGORY_TO_RULE: Record<
  string,
  | "roof_age_insurability"
  | "hoa_reserves_adequate"
  | "sirs_inspection_status"
  | "flood_zone_risk"
  | "permit_irregularity"
  | "lien_or_encumbrance"
> = {
  structural: "roof_age_insurability",
  water: "flood_zone_risk",
  hoa: "hoa_reserves_adequate",
  legal: "permit_irregularity",
  insurance: "roof_age_insurability",
  environmental: "flood_zone_risk",
  title: "lien_or_encumbrance",
  not_disclosed: "permit_irregularity",
};

// Buyer-facing severity → fileAnalysisFindings.severity enum. Disclosure
// parser emits low/medium/high; the review queue accepts the full
// info/low/medium/high/critical set.
const SEVERITY_MAP = {
  low: "low",
  medium: "medium",
  high: "high",
} as const;

// ═══ OCR types ══════════════════════════════════════════════════════════

interface OcrPageText {
  page_number: number;
  text: string;
}

interface OcrResult {
  text: string;
  per_page: OcrPageText[];
  detected_lang: string;
  confidence: number;
}

interface OcrFailure {
  error: string;
  kind: "invalid_file" | "unauthorized" | "ocr_failed";
  detail?: string;
}

async function callOcrService(args: {
  fileUrl: string;
  fileId: string;
  storageKey: string;
}): Promise<
  { ok: true; data: OcrResult } | { ok: false; reason: string }
> {
  const url = process.env.OCR_SERVICE_URL;
  const token = process.env.OCR_SERVICE_TOKEN;
  if (!url || !token) {
    return { ok: false, reason: "OCR service not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/ocr/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        file_url: args.fileUrl,
        file_id: args.fileId,
        storage_key: args.storageKey,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let reason = `OCR service returned ${res.status}`;
      try {
        const body = (await res.json()) as OcrFailure;
        if (body?.error) reason = `${body.kind ?? "ocr_failed"}: ${body.error}`;
      } catch {
        // ignore JSON parse failure
      }
      return { ok: false, reason };
    }

    const data = (await res.json()) as OcrResult;
    if (typeof data.text !== "string" || !Array.isArray(data.per_page)) {
      return { ok: false, reason: "OCR service returned malformed response" };
    }
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return { ok: false, reason: `OCR fetch failed: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

// ═══ Orchestrator action ═══════════════════════════════════════════════

/**
 * Schedule a fresh disclosure-parser run for a packet. Called from
 * `convex/disclosures.ts#commitUpload` after a new packet is committed.
 */
export const scheduleDisclosureParser = internalAction({
  args: { packetId: v.id("disclosurePackets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.engines.disclosureParser.runDisclosureParser,
      { packetId: args.packetId },
    );
    return null;
  },
});

/**
 * Top-level engine action. Runs OCR + LLM analysis for every file in a
 * packet, persists findings per file, and rolls the packet-level
 * status up to ready / partial_failure / failed.
 *
 * Error model: per-file failures are captured on the job row and in
 * the packet file entry; the engine always tries every file in the
 * packet before returning. A complete fetch failure (OCR unavailable)
 * is treated as a per-file failure, not an action crash.
 */
export const runDisclosureParser = internalAction({
  args: { packetId: v.id("disclosurePackets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const packetRecord: {
      packet: {
        _id: Id<"disclosurePackets">;
        dealRoomId: Id<"dealRooms">;
        buyerId: Id<"users">;
        propertyId: Id<"properties">;
        version: number;
        status: string;
        files: Array<{
          storageId: Id<"_storage">;
          fileName: string;
          fileHash: string;
          byteSize: number;
          mimeType: string;
          status: string;
          failureReason?: string;
        }>;
      };
      findings: unknown[];
    } | null = await ctx.runQuery(
      internal.disclosures.getDisclosurePacketById,
      { packetId: args.packetId },
    );

    if (!packetRecord) return null;
    const packet = packetRecord.packet;

    // Skip re-runs against superseded packets — the newer version will
    // carry the findings the buyer actually sees.
    if (packet.status === "superseded") return null;

    let totalFindings = 0;
    let succeeded = 0;
    let failed = 0;

    for (const file of packet.files) {
      // Mark file → ocr
      await ctx.runMutation(internal.disclosures.updateFileStatus, {
        packetId: args.packetId,
        storageId: file.storageId,
        status: "ocr",
      });

      // Sign a download URL for the OCR worker.
      const fileUrl = await ctx.storage.getUrl(file.storageId);
      if (!fileUrl) {
        await ctx.runMutation(internal.disclosures.updateFileStatus, {
          packetId: args.packetId,
          storageId: file.storageId,
          status: "failed",
          failureReason: "Storage object missing",
        });
        failed += 1;
        continue;
      }

      // Call OCR worker.
      const ocr = await callOcrService({
        fileUrl,
        fileId: file.fileHash,
        storageKey: file.storageId,
      });
      if (!ocr.ok) {
        await ctx.runMutation(internal.disclosures.updateFileStatus, {
          packetId: args.packetId,
          storageId: file.storageId,
          status: "failed",
          failureReason: ocr.reason,
        });
        failed += 1;
        continue;
      }

      // Flip to parsing BEFORE allocating the job — so the packet row
      // reflects in-flight state if something explodes below.
      await ctx.runMutation(internal.disclosures.updateFileStatus, {
        packetId: args.packetId,
        storageId: file.storageId,
        status: "parsing",
      });

      let jobId: Id<"fileAnalysisJobs">;
      try {
        jobId = await ctx.runMutation(
          internal.engines.disclosureParserMutations.createPacketFileJob,
          {
            packetId: args.packetId,
            storageId: file.storageId,
            fileName: file.fileName,
          },
        );
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Failed to create analysis job";
        await ctx.runMutation(internal.disclosures.updateFileStatus, {
          packetId: args.packetId,
          storageId: file.storageId,
          status: "failed",
          failureReason: reason,
        });
        failed += 1;
        continue;
      }

      // PII-scrub the OCR text BEFORE shipping it to the LLM.
      const redactedFullText = (deepScrubPii({ t: ocr.data.text }) as {
        t: string;
      }).t;
      const redactedPages: Array<{ page: number; text: string }> =
        ocr.data.per_page.map((p) => ({
          page: p.page_number,
          text: (deepScrubPii({ t: p.text }) as { t: string }).t,
        }));

      let parserOutput: DisclosureParserOutput;
      try {
        parserOutput = await parseDisclosureText({
          redactedText: redactedFullText,
          perPageText: redactedPages,
          sourceFileName: file.fileName,
          propertyState: "FL",
        });
      } catch (err) {
        const reason =
          err instanceof DisclosureParseError
            ? `LLM parse failed: ${err.message}`
            : err instanceof Error
              ? err.message
              : "LLM parse failed";
        await ctx.runMutation(
          internal.engines.disclosureParserMutations.failPacketFileJob,
          { jobId, errorMessage: reason },
        );
        await ctx.runMutation(internal.disclosures.updateFileStatus, {
          packetId: args.packetId,
          storageId: file.storageId,
          status: "failed",
          failureReason: reason,
        });
        failed += 1;
        continue;
      }

      // Translate the parser output into the fileAnalysisFindings
      // shape the persist mutation expects.
      const allFindings: Array<DisclosureFinding | DisclosureNotMentioned> = [
        ...parserOutput.findings,
        ...parserOutput.notMentioned,
      ];

      const mappedFindings = allFindings.map((f) => {
        const notMentioned = f.category === "not_disclosed";
        const fullFinding = f as DisclosureFinding;
        const category = f.category;
        const rule = CATEGORY_TO_RULE[category] ?? "permit_irregularity";
        const severityKey: "low" | "medium" | "high" = notMentioned
          ? "medium"
          : fullFinding.severity;
        const severity = SEVERITY_MAP[severityKey];
        const confidence = notMentioned ? 1 : fullFinding.confidence;
        const requiresReview =
          severity === "high" || category === "not_disclosed";
        const pageReference =
          !notMentioned && fullFinding.pageReference
            ? fullFinding.pageReference
            : undefined;
        const evidenceQuote =
          !notMentioned && fullFinding.evidenceQuote
            ? fullFinding.evidenceQuote
            : undefined;
        return {
          rule,
          severity,
          label: f.title,
          summary: f.buyerFriendlyExplanation,
          confidence,
          requiresReview,
          category,
          pageReference,
          evidenceQuote,
          buyerFriendlyExplanation: f.buyerFriendlyExplanation,
          recommendedAction: f.recommendedAction,
          findingKey: f.findingKey,
        };
      });

      const severityRank = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
      let worst: "info" | "low" | "medium" | "high" | "critical" = "info";
      for (const f of mappedFindings) {
        if (severityRank[f.severity] > severityRank[worst]) worst = f.severity;
      }

      const overallConfidence =
        mappedFindings.length === 0
          ? 0.7
          : Math.min(
              1,
              mappedFindings.reduce((s, f) => s + f.confidence, 0) /
                mappedFindings.length,
            );

      try {
        await ctx.runMutation(
          internal.engines.disclosureParserMutations.persistFileAnalysis,
          {
            jobId,
            packetId: args.packetId,
            packetVersion: packet.version,
            sourceFileName: file.fileName,
            payload: JSON.stringify({
              engineVersion: DISCLOSURE_ENGINE_VERSION,
              sourceFileName: file.fileName,
              summary: parserOutput.summary,
              findings: parserOutput.findings,
              notMentioned: parserOutput.notMentioned,
              modelId: parserOutput.modelId,
              tokensUsed: parserOutput.tokensUsed,
              detectedLang: ocr.data.detected_lang,
              ocrConfidence: ocr.data.confidence,
            }),
            overallSeverity: worst,
            overallConfidence,
            modelId: parserOutput.modelId,
            findings: mappedFindings,
          },
        );
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Persist mutation failed";
        await ctx.runMutation(
          internal.engines.disclosureParserMutations.failPacketFileJob,
          { jobId, errorMessage: reason },
        );
        await ctx.runMutation(internal.disclosures.updateFileStatus, {
          packetId: args.packetId,
          storageId: file.storageId,
          status: "failed",
          failureReason: reason,
        });
        failed += 1;
        continue;
      }

      await ctx.runMutation(internal.disclosures.updateFileStatus, {
        packetId: args.packetId,
        storageId: file.storageId,
        status: "done",
      });
      succeeded += 1;
      totalFindings += mappedFindings.length;
    }

    // Packet-level roll-up
    let finalStatus: "ready" | "partial_failure" | "failed";
    if (succeeded === packet.files.length) finalStatus = "ready";
    else if (succeeded === 0) finalStatus = "failed";
    else finalStatus = "partial_failure";

    await ctx.runMutation(internal.disclosures.markPacketStatus, {
      packetId: args.packetId,
      status: finalStatus,
    });

    await ctx.runMutation(
      internal.engines.disclosureParserMutations.recordPacketAudit,
      {
        packetId: args.packetId,
        dealRoomId: packet.dealRoomId,
        finalStatus,
        totalFiles: packet.files.length,
        succeeded,
        failed,
        totalFindings,
      },
    );

    return null;
  },
});
