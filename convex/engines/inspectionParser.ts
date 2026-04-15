"use node";

/**
 * Inspection parser orchestrator (KIN-1081).
 *
 * Node-runtime Convex action that walks every file in an inspection
 * packet through OCR → PII redaction → LLM analysis → cost
 * calibration → per-file persistence → packet-level negotiation
 * summary → packet status roll-up.
 *
 * Why Node runtime: the Anthropic SDK inside gateway.ts uses Node-only
 * streaming primitives, and the OCR service client is node-safe. All
 * mutations live in `inspectionParserMutations.ts` (V8 runtime) and are
 * called via `ctx.runMutation`.
 *
 * Scheduling: `convex/disclosures.ts#commitUpload` schedules
 * `runInspectionParser` via a string FunctionReference escape hatch
 * (since the function reference didn't exist at the time disclosures.ts
 * was written). Once Convex codegen regenerates `_generated/api.d.ts`
 * with this module, the lead can flip the string to the typed reference
 * with a one-line edit. The string path keeps working in the meantime.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  parseInspectionText,
  summarizeNegotiation,
  InspectionParseError,
  type InspectionFinding,
  type InspectionParserOutput,
  type InspectionReportType,
} from "../../src/lib/ai/engines/inspectionParser";
import { calibrateCost } from "../../src/lib/ai/engines/inspectionCostCalibration";
import { deepScrubPii } from "../../src/lib/security/pii-guard";

// ═══ Constants ══════════════════════════════════════════════════════════════

const INSPECTION_ENGINE_VERSION = "inspectionParser-1.0.0";
const OCR_TIMEOUT_MS = 120_000;

// Systems whose findings benefit from a permit cross-check. Touching
// roof/electrical/plumbing/structural typically requires a permit; if a
// major finding shows up in one of these systems with NO permits on
// file, that's a tie-breaker signal worth surfacing to the broker.
const PERMIT_CROSSCHECK_SYSTEMS = new Set([
  "roof",
  "electrical",
  "plumbing",
  "structural",
]);

// ═══ OCR client (mirrors disclosureParser) ══════════════════════════════════

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
}): Promise<{ ok: true; data: OcrResult } | { ok: false; reason: string }> {
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

// ═══ Fact translation ═══════════════════════════════════════════════════════

interface FactRow {
  factSlug: string;
  valueKind: "numeric" | "text" | "boolean" | "enum";
  valueNumeric?: number;
  valueNumericUnit?: string;
  valueText?: string;
  valueBoolean?: boolean;
  valueEnum?: string;
  valueEnumAllowed?: string[];
  confidence?: number;
}

const PANEL_TYPES = ["FPE", "Zinsco", "Square D", "Siemens", "Eaton", "GE", "other"];
const PLUMBING_MATERIALS = [
  "polybutylene",
  "copper",
  "PEX",
  "galvanized",
  "CPVC",
  "other",
];

function translateFactsToRows(facts: InspectionParserOutput["facts"]): FactRow[] {
  const rows: FactRow[] = [];
  if (typeof facts.roofAgeYears === "number") {
    rows.push({
      factSlug: "inspection.roof_age_years",
      valueKind: "numeric",
      valueNumeric: facts.roofAgeYears,
      valueNumericUnit: "years",
      confidence: 0.7,
    });
  }
  if (typeof facts.hvacAgeYears === "number") {
    rows.push({
      factSlug: "inspection.hvac_age_years",
      valueKind: "numeric",
      valueNumeric: facts.hvacAgeYears,
      valueNumericUnit: "years",
      confidence: 0.7,
    });
  }
  if (typeof facts.waterHeaterAgeYears === "number") {
    rows.push({
      factSlug: "inspection.water_heater_age_years",
      valueKind: "numeric",
      valueNumeric: facts.waterHeaterAgeYears,
      valueNumericUnit: "years",
      confidence: 0.7,
    });
  }
  if (facts.electricalPanelType) {
    const enumValue = PANEL_TYPES.includes(facts.electricalPanelType)
      ? facts.electricalPanelType
      : "other";
    rows.push({
      factSlug: "inspection.electrical_panel_type",
      valueKind: "enum",
      valueEnum: enumValue,
      valueEnumAllowed: PANEL_TYPES,
      confidence: 0.7,
    });
  }
  if (facts.plumbingMaterial) {
    const enumValue = PLUMBING_MATERIALS.includes(facts.plumbingMaterial)
      ? facts.plumbingMaterial
      : "other";
    rows.push({
      factSlug: "inspection.plumbing_material",
      valueKind: "enum",
      valueEnum: enumValue,
      valueEnumAllowed: PLUMBING_MATERIALS,
      confidence: 0.7,
    });
  }
  if (typeof facts.structuralConcernFlag === "boolean") {
    rows.push({
      factSlug: "inspection.structural_concern_flag",
      valueKind: "boolean",
      valueBoolean: facts.structuralConcernFlag,
      confidence: 0.7,
    });
  }
  if (typeof facts.wdoDamageFlag === "boolean") {
    rows.push({
      factSlug: "inspection.wdo_damage_flag",
      valueKind: "boolean",
      valueBoolean: facts.wdoDamageFlag,
      confidence: 0.7,
    });
  }
  if (typeof facts.fourPointRecommended === "boolean") {
    rows.push({
      factSlug: "inspection.four_point_recommended",
      valueKind: "boolean",
      valueBoolean: facts.fourPointRecommended,
      confidence: 0.7,
    });
  }
  if (typeof facts.windMitigationRecommended === "boolean") {
    rows.push({
      factSlug: "inspection.wind_mitigation_recommended",
      valueKind: "boolean",
      valueBoolean: facts.windMitigationRecommended,
      confidence: 0.7,
    });
  }
  return rows;
}

// ═══ Permit cross-check ═════════════════════════════════════════════════════

/**
 * Annotate a finding with a permit gap note when:
 *   - The finding's system is permit-relevant (roof/elec/plumb/struct)
 *   - The buyer severity is life_safety or major_repair
 *   - The propertyPermits aggregate has zero open permits + low total
 * The annotation is a soft signal — append a note to recommendedAction
 * so brokers see it on review. Confidence is lightly boosted.
 */
function applyPermitCrossCheck(
  finding: InspectionFinding,
  permitAggregate: {
    permitsCount: number;
    openPermitsCount: number;
  } | null,
): InspectionFinding {
  if (!permitAggregate) return finding;
  if (!PERMIT_CROSSCHECK_SYSTEMS.has(finding.system)) return finding;
  if (finding.buyerSeverity !== "life_safety" && finding.buyerSeverity !== "major_repair") {
    return finding;
  }
  if (permitAggregate.permitsCount > 0) return finding;

  const note = " (No permits on file for this property — broker should verify the work was permitted.)";
  if (finding.recommendedAction.includes("No permits on file")) return finding;
  return {
    ...finding,
    recommendedAction:
      finding.recommendedAction.length + note.length <= 200
        ? finding.recommendedAction + note
        : finding.recommendedAction,
    confidence: Math.min(1, finding.confidence + 0.05),
  };
}

// ═══ Orchestrator action ════════════════════════════════════════════════════

/**
 * Top-level inspection engine action. Runs OCR + LLM analysis for every
 * file in an inspection packet, persists findings + facts per file,
 * composes a packet-level negotiation summary, and rolls the packet
 * status up to ready / partial_failure / failed.
 *
 * Error model: per-file failures are captured on the file row and the
 * job row; the engine always tries every file before returning. A
 * complete OCR outage degrades to per-file failure, not action crash.
 *
 * Idempotency: re-runs against the same packet upsert findings via
 * (packetId, findingKey) and supersede prior facts via storageId.
 */
export const runInspectionParser = internalAction({
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
        workflow?: "disclosure" | "inspection";
        files: Array<{
          storageId: Id<"_storage">;
          fileName: string;
          fileHash: string;
          byteSize: number;
          mimeType: string;
          status: string;
          failureReason?: string;
          reportType?: InspectionReportType;
          reportTypeSource?: "parser" | "broker_override";
        }>;
      };
      findings: unknown[];
    } | null = await ctx.runQuery(
      internal.disclosures.getDisclosurePacketById,
      { packetId: args.packetId },
    );

    if (!packetRecord) return null;
    const packet = packetRecord.packet;

    // Wrong workflow guard — disclosure packets must not flow through
    // here. The scheduler hook in disclosures.ts already routes by
    // workflow, but a re-run from a different code path could land here.
    if (packet.workflow !== "inspection") return null;

    // Late-run guard — a superseded packet's findings never reach the
    // buyer surface, so don't waste tokens on them.
    if (packet.status === "superseded") return null;

    // Permit aggregate is property-wide, fetched once for cross-check.
    let permitAggregate: { permitsCount: number; openPermitsCount: number } | null =
      null;
    try {
      const result: {
        permitsCount: number;
        openPermitsCount: number;
      } | null = await ctx.runQuery(api.permits.getForProperty, {
        propertyId: packet.propertyId,
      });
      permitAggregate = result;
    } catch {
      // Permit fetch failure shouldn't kill the engine — fall back to
      // null so cross-check is a no-op for this run.
      permitAggregate = null;
    }

    let totalFindings = 0;
    let succeeded = 0;
    let failed = 0;
    const allFindings: InspectionFinding[] = [];
    const detectedReportTypes: InspectionReportType[] = [];

    for (const file of packet.files) {
      // Mark file → ocr
      await ctx.runMutation(internal.disclosures.updateFileStatus, {
        packetId: args.packetId,
        storageId: file.storageId,
        status: "ocr",
      });

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

      // Flip → parsing before allocating the job so packet state
      // reflects in-flight even if something below explodes.
      await ctx.runMutation(internal.disclosures.updateFileStatus, {
        packetId: args.packetId,
        storageId: file.storageId,
        status: "parsing",
      });

      let jobId: Id<"fileAnalysisJobs">;
      try {
        jobId = await ctx.runMutation(
          internal.engines.inspectionParserMutations.createInspectionFileJob,
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

      // PII-scrub OCR text BEFORE shipping it to Anthropic.
      const redactedFullText = (deepScrubPii({ t: ocr.data.text }) as {
        t: string;
      }).t;
      const redactedPages: Array<{ page: number; text: string }> =
        ocr.data.per_page.map((p) => ({
          page: p.page_number,
          text: (deepScrubPii({ t: p.text }) as { t: string }).t,
        }));

      let parserOutput: InspectionParserOutput;
      try {
        parserOutput = await parseInspectionText({
          redactedText: redactedFullText,
          perPageText: redactedPages,
          sourceFileName: file.fileName,
          // Honour broker override when present; otherwise let the
          // parser detect the report type.
          reportTypeHint:
            file.reportTypeSource === "broker_override"
              ? file.reportType
              : undefined,
        });
      } catch (err) {
        const reason =
          err instanceof InspectionParseError
            ? `LLM parse failed: ${err.message}`
            : err instanceof Error
              ? err.message
              : "LLM parse failed";
        await ctx.runMutation(
          internal.engines.inspectionParserMutations.failInspectionFileJob,
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

      // Cost calibration + permit cross-check on every finding.
      const calibratedFindings: InspectionFinding[] = parserOutput.findings.map(
        (f) => {
          const cost = calibrateCost({
            finding: {
              findingKey: f.findingKey,
              system: f.system,
              title: f.title,
              buyerSeverity: f.buyerSeverity,
              buyerFriendlyExplanation: f.buyerFriendlyExplanation,
              recommendedAction: f.recommendedAction,
              pageReference: f.pageReference,
              evidenceQuote: f.evidenceQuote,
              confidence: f.confidence,
              llmSuggestedCost: f.llmSuggestedCost,
            },
            llmSuggestedCost: f.llmSuggestedCost,
          });
          const withCost: InspectionFinding = {
            ...f,
            estimatedCostLowUsd: cost.estimatedCostLowUsd,
            estimatedCostHighUsd: cost.estimatedCostHighUsd,
            costEstimateConfidence: cost.costEstimateConfidence,
            costEstimateBasis: cost.costEstimateBasis,
            costTier: cost.costTier,
          };
          return applyPermitCrossCheck(withCost, permitAggregate);
        },
      );

      // Persist findings in a single mutation call — one transaction
      // per file keeps the dedupe logic correct without chattiness.
      try {
        await ctx.runMutation(
          internal.engines.inspectionParserMutations.fanOutInspectionFindings,
          {
            jobId,
            packetId: args.packetId,
            packetVersion: packet.version,
            sourceFileName: file.fileName,
            findings: calibratedFindings.map((f) => ({
              findingKey: f.findingKey,
              system: f.system,
              title: f.title,
              buyerSeverity: f.buyerSeverity,
              buyerFriendlyExplanation: f.buyerFriendlyExplanation,
              recommendedAction: f.recommendedAction,
              pageReference: f.pageReference,
              evidenceQuote: f.evidenceQuote,
              confidence: f.confidence,
              estimatedCostLowUsd: f.estimatedCostLowUsd,
              estimatedCostHighUsd: f.estimatedCostHighUsd,
              costEstimateConfidence: f.costEstimateConfidence,
              costEstimateBasis: f.costEstimateBasis,
            })),
          },
        );
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Persist mutation failed";
        await ctx.runMutation(
          internal.engines.inspectionParserMutations.failInspectionFileJob,
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

      // Persist normalized facts.
      const factRows = translateFactsToRows(parserOutput.facts);
      if (factRows.length > 0) {
        try {
          await ctx.runMutation(
            internal.engines.inspectionParserMutations.writeInspectionFacts,
            {
              propertyId: packet.propertyId,
              dealRoomId: packet.dealRoomId,
              storageId: file.storageId,
              facts: factRows,
            },
          );
        } catch {
          // Fact persistence failure is non-fatal — the findings are
          // the load-bearing surface. Swallow + carry on.
        }
      }

      // Patch the packet's per-file metadata with detected report type
      // + inspector. Broker override stays untouched.
      try {
        await ctx.runMutation(
          internal.engines.inspectionParserMutations.updatePacketInspectionMetadata,
          {
            packetId: args.packetId,
            storageId: file.storageId,
            reportType:
              file.reportTypeSource === "broker_override"
                ? undefined
                : parserOutput.detectedReportType,
            reportTypeConfidence: parserOutput.reportTypeConfidence,
            reportTypeSource:
              file.reportTypeSource === "broker_override"
                ? undefined
                : "parser",
            inspectorName: parserOutput.inspector.name ?? undefined,
            inspectorLicenseNumber:
              parserOutput.inspector.licenseNumber ?? undefined,
            inspectorLicenseVerificationStatus:
              parserOutput.inspector.licenseVerificationStatus,
            inspectionDate: parserOutput.inspector.inspectionDate ?? undefined,
            inspectionAddressFromReport:
              parserOutput.inspector.propertyAddressFromReport ?? undefined,
          },
        );
      } catch {
        // Metadata patch failure is non-fatal.
      }

      // Write engine output row for this file.
      try {
        const overallConfidence =
          calibratedFindings.length === 0
            ? 0.7
            : Math.min(
                1,
                calibratedFindings.reduce((s, f) => s + f.confidence, 0) /
                  calibratedFindings.length,
              );
        await ctx.runMutation(
          internal.engines.inspectionParserMutations.writeInspectionEngineOutput,
          {
            propertyId: packet.propertyId,
            packetId: args.packetId,
            output: JSON.stringify({
              engineVersion: INSPECTION_ENGINE_VERSION,
              sourceFileName: file.fileName,
              detectedReportType: parserOutput.detectedReportType,
              reportTypeConfidence: parserOutput.reportTypeConfidence,
              inspector: parserOutput.inspector,
              findings: calibratedFindings,
              facts: parserOutput.facts,
              modelId: parserOutput.modelId,
              tokensUsed: parserOutput.tokensUsed,
              detectedLang: ocr.data.detected_lang,
              ocrConfidence: ocr.data.confidence,
            }),
            confidence: overallConfidence,
            modelId: parserOutput.modelId,
            citations: [file.fileName],
          },
        );
      } catch {
        // Engine output row failure is non-fatal — findings still land.
      }

      await ctx.runMutation(internal.disclosures.updateFileStatus, {
        packetId: args.packetId,
        storageId: file.storageId,
        status: "done",
      });
      succeeded += 1;
      totalFindings += calibratedFindings.length;
      allFindings.push(...calibratedFindings);
      detectedReportTypes.push(parserOutput.detectedReportType);
    }

    // Compose negotiation summary across ALL files in the packet.
    if (allFindings.length > 0 || succeeded > 0) {
      try {
        const summary = await summarizeNegotiation({
          findings: allFindings,
          detectedReportTypes,
        });
        await ctx.runMutation(
          internal.engines.inspectionParserMutations.writeNegotiationSummary,
          {
            packetId: args.packetId,
            negotiationSummaryBuyer: summary.buyerSummary,
            negotiationSummaryInternal: summary.internalSummary,
          },
        );
      } catch {
        // Summary failure is non-fatal — broker can re-trigger or
        // compose manually. The findings have already been persisted.
      }
    }

    // Roll up packet status.
    let finalStatus: "ready" | "partial_failure" | "failed";
    if (succeeded === packet.files.length) finalStatus = "ready";
    else if (succeeded === 0) finalStatus = "failed";
    else finalStatus = "partial_failure";

    await ctx.runMutation(internal.disclosures.markPacketStatus, {
      packetId: args.packetId,
      status: finalStatus,
    });

    await ctx.runMutation(
      internal.engines.inspectionParserMutations.recordInspectionAudit,
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
