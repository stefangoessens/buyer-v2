/**
 * Disclosure packets API (KIN-1078).
 *
 * Seller-disclosure upload + AI red-flag analysis for /property/[id]/disclosures.
 * This module is the data-plane contract that the OCR worker,
 * disclosure-parser engine, and the buyer/broker UIs all depend on.
 *
 * Scope for this file:
 *   - Buyer upload path (generateUploadUrl + commitUpload)
 *   - Version-aware reads (getLatestPacket / listPacketHistory /
 *     getDisclosurePacketById)
 *   - Broker review queue (listBrokerReviewQueue)
 *   - Per-file and per-packet status transitions used by the engine path
 *
 * Packet-version contract:
 *   - Versions start at 1 and are monotonic per dealRoom
 *   - Uploading a new packet supersedes the prior latest one
 *     (status → "superseded", supersededAt + supersededBy set)
 *   - Identical re-uploads (same contentHash) are de-duped — the existing
 *     packetId is returned and NO new analysis is enqueued
 *
 * What this module does NOT do:
 *   - Enqueue engine actions (the disclosure-parser module owns that)
 *   - OCR (the python worker owns that)
 *   - Render buyer/broker UI (web-disclosures owns that)
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/session";
// KIN-1079 — Request Disclosures mail rail abstraction.
import { selectDriver, type MailMessage } from "./mailRail";

// ═══ Constants ═══════════════════════════════════════════════════════════

const PER_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const PACKET_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

// ═══ Shared validators ══════════════════════════════════════════════════

const packetFileInputValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  fileHash: v.string(),
  byteSize: v.number(),
  mimeType: v.string(),
});

const packetFileStatusValidator = v.union(
  v.literal("pending"),
  v.literal("ocr"),
  v.literal("parsing"),
  v.literal("done"),
  v.literal("failed"),
);

const packetStatusValidator = v.union(
  v.literal("uploading"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("partial_failure"),
  v.literal("failed"),
  v.literal("superseded"),
);

const packetFileRowValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  fileHash: v.string(),
  byteSize: v.number(),
  mimeType: v.string(),
  status: packetFileStatusValidator,
  failureReason: v.optional(v.string()),
});

const workflowValidator = v.union(
  v.literal("disclosure"),
  v.literal("inspection"),
);

const packetRowValidator = v.object({
  _id: v.id("disclosurePackets"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  buyerId: v.id("users"),
  propertyId: v.id("properties"),
  version: v.number(),
  status: packetStatusValidator,
  contentHash: v.string(),
  files: v.array(packetFileRowValidator),
  createdAt: v.string(),
  updatedAt: v.string(),
  supersededAt: v.optional(v.string()),
  supersededBy: v.optional(v.id("disclosurePackets")),
  workflow: v.optional(workflowValidator),
});

// KIN-1081: rows shipped by KIN-1078 have `workflow === undefined`. Treat
// missing workflow as "disclosure" everywhere we filter or compare.
function packetWorkflow(
  packet: Doc<"disclosurePackets">,
): "disclosure" | "inspection" {
  return packet.workflow === "inspection" ? "inspection" : "disclosure";
}

const findingRowValidator = v.object({
  _id: v.id("fileAnalysisFindings"),
  _creationTime: v.number(),
  jobId: v.id("fileAnalysisJobs"),
  dealRoomId: v.id("dealRooms"),
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
  resolvedAt: v.optional(v.string()),
  resolvedBy: v.optional(v.id("users")),
  resolutionNotes: v.optional(v.string()),
  createdAt: v.string(),
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
      // KIN-1081: the shared `category` union also carries the inspection
      // categories now. They never appear on disclosure packets at runtime
      // (disclosure parsers only emit the disclosure values), but the
      // validator must accept the wider type the schema row carries.
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
});

// ═══ Access helpers ═════════════════════════════════════════════════════

type AccessRole = "buyer" | "broker" | "admin";

async function requirePacketAccess(
  ctx: QueryCtx,
  dealRoomId: Id<"dealRooms">,
): Promise<{ user: Doc<"users">; role: AccessRole }> {
  const user = await requireAuth(ctx);
  const dealRoom = await ctx.db.get(dealRoomId);
  if (!dealRoom) throw new Error("Deal room not found");

  if (dealRoom.buyerId === user._id) return { user, role: "buyer" };
  if (user.role === "broker") return { user, role: "broker" };
  if (user.role === "admin") return { user, role: "admin" };

  throw new Error("Not authorized to access this deal room's disclosures");
}

async function requireBrokerOrAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireAuth(ctx);
  if (user.role !== "broker" && user.role !== "admin") {
    throw new Error("Broker or admin role required");
  }
  return user;
}

// Hex SHA-256 of a UTF-8 string. Convex V8 runtime exposes Web Crypto.
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ═══ Queries ════════════════════════════════════════════════════════════

/**
 * Get the latest non-superseded packet for a deal room, along with its
 * current findings. Returns null if no packet exists yet.
 *
 * KIN-1081: scoped to a single workflow ("disclosure" default, or
 * "inspection"). Disclosure and inspection packets share this table but
 * have independent version sequences and supersede chains.
 *
 * Auth: buyer owner OR broker/admin.
 */
export const getLatestPacket = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    workflow: v.optional(workflowValidator),
  },
  returns: v.union(
    v.null(),
    v.object({
      packet: packetRowValidator,
      findings: v.array(findingRowValidator),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePacketAccess(ctx, args.dealRoomId);
    const workflow = args.workflow ?? "disclosure";

    // Walk by_dealRoomId_and_version desc and pick the first row matching
    // workflow. Independent version sequences mean we can't use a single
    // .first() — a fresh inspection upload could be version 1 while the
    // newest disclosure is version 5.
    const candidates = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_dealRoomId_and_version", (q) =>
        q.eq("dealRoomId", args.dealRoomId),
      )
      .order("desc")
      .collect();

    const latest = candidates.find((p) => packetWorkflow(p) === workflow);

    if (!latest || latest.status === "superseded") {
      // If the newest row in this workflow is `superseded`, by construction
      // there is no active packet — a fresh upload will create the next
      // version.
      return null;
    }

    const findings = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_packetId", (q) => q.eq("packetId", latest._id))
      .collect();

    return { packet: latest, findings };
  },
});

/**
 * List all packets (including superseded) for a deal room, newest first.
 * Used by the history drawer on the disclosures page.
 *
 * KIN-1081: filtered by workflow ("disclosure" default, or "inspection").
 *
 * Auth: buyer owner OR broker/admin.
 */
export const listPacketHistory = query({
  args: {
    dealRoomId: v.id("dealRooms"),
    workflow: v.optional(workflowValidator),
  },
  returns: v.array(packetRowValidator),
  handler: async (ctx, args) => {
    await requirePacketAccess(ctx, args.dealRoomId);
    const workflow = args.workflow ?? "disclosure";

    const packets = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_dealRoomId_and_version", (q) =>
        q.eq("dealRoomId", args.dealRoomId),
      )
      .order("desc")
      .collect();

    return packets.filter((p) => packetWorkflow(p) === workflow);
  },
});

/**
 * Broker/admin review queue. Returns packets that currently have at least
 * one high/critical severity finding OR a low-confidence finding, ordered
 * by worst-severity first, then most recent.
 *
 * KIN-1081: scoped by workflow. Default `"any"` returns both disclosure
 * and inspection packets in one queue. Pass `"disclosure"` or
 * `"inspection"` to filter.
 *
 * Implementation: fetch flagged findings via the review-index, group by
 * packetId, then hydrate the packet rows.
 */
export const listBrokerReviewQueue = query({
  args: {
    limit: v.optional(v.number()),
    workflow: v.optional(
      v.union(
        v.literal("disclosure"),
        v.literal("inspection"),
        v.literal("any"),
      ),
    ),
  },
  returns: v.array(
    v.object({
      packet: packetRowValidator,
      worstSeverity: v.union(
        v.literal("info"),
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("critical"),
      ),
      flaggedFindingCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireBrokerOrAdmin(ctx);
    const workflowFilter = args.workflow ?? "any";

    const flagged = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_requiresReview_and_severity", (q) =>
        q.eq("requiresReview", true),
      )
      .collect();

    type PacketAgg = {
      packetId: Id<"disclosurePackets">;
      worst: number;
      count: number;
      worstLabel: "info" | "low" | "medium" | "high" | "critical";
    };
    const SEVERITY_RANK: Record<string, number> = {
      info: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    const byPacket = new Map<string, PacketAgg>();
    for (const f of flagged) {
      if (!f.packetId) continue;
      if (f.resolvedAt !== undefined) continue;
      const rank = SEVERITY_RANK[f.severity] ?? 0;
      const existing = byPacket.get(f.packetId);
      if (existing) {
        existing.count += 1;
        if (rank > existing.worst) {
          existing.worst = rank;
          existing.worstLabel = f.severity;
        }
      } else {
        byPacket.set(f.packetId, {
          packetId: f.packetId,
          worst: rank,
          count: 1,
          worstLabel: f.severity,
        });
      }
    }

    const rows: Array<{
      packet: Doc<"disclosurePackets">;
      worstSeverity: PacketAgg["worstLabel"];
      flaggedFindingCount: number;
      updatedAt: string;
    }> = [];

    for (const agg of byPacket.values()) {
      const packet = await ctx.db.get(agg.packetId);
      if (!packet) continue;
      if (
        workflowFilter !== "any" &&
        packetWorkflow(packet) !== workflowFilter
      ) {
        continue;
      }
      rows.push({
        packet,
        worstSeverity: agg.worstLabel,
        flaggedFindingCount: agg.count,
        updatedAt: packet.updatedAt,
      });
    }

    rows.sort((a, b) => {
      const rankDiff =
        (SEVERITY_RANK[b.worstSeverity] ?? 0) -
        (SEVERITY_RANK[a.worstSeverity] ?? 0);
      if (rankDiff !== 0) return rankDiff;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    const limit = args.limit ?? 50;
    return rows.slice(0, limit).map((r) => ({
      packet: r.packet,
      worstSeverity: r.worstSeverity,
      flaggedFindingCount: r.flaggedFindingCount,
    }));
  },
});

/**
 * Internal: fetch a packet by id with its files and findings. Used by the
 * disclosure-parser engine and the packet-aware copilot grounding path.
 */
export const getDisclosurePacketById = internalQuery({
  args: { packetId: v.id("disclosurePackets") },
  returns: v.union(
    v.null(),
    v.object({
      packet: packetRowValidator,
      findings: v.array(findingRowValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) return null;
    const findings = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_packetId", (q) => q.eq("packetId", args.packetId))
      .collect();
    return { packet, findings };
  },
});

// ═══ Upload mutations ═══════════════════════════════════════════════════

/**
 * Step 1 of the upload: mint a short-lived signed upload URL.
 *
 * NOTE: Convex signed upload URLs cannot carry custom params, so the
 * packet-version binding happens at `commitUpload` time, not here.
 * Callers must still pass packetVersion so we can do the buyer-auth
 * check against the deal room up front.
 */
export const generateUploadUrl = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    packetVersion: v.number(),
    fileName: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
    // KIN-1081: workflow discriminator. Optional, defaults to "disclosure".
    // File-size + mime-type rules are identical for both workflows; this
    // arg only flows through for symmetry with commitUpload.
    workflow: v.optional(workflowValidator),
  },
  returns: v.object({
    uploadUrl: v.string(),
    storageKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const { role } = await requirePacketAccess(ctx, args.dealRoomId);
    // Only the buyer (owner) can initiate an upload — broker/admin can
    // read packets but must not be shoving documents into a buyer's deal
    // room themselves. Broker-initiated uploads are out of scope for
    // KIN-1078 per the card.
    if (role !== "buyer") {
      throw new Error(
        "Only the deal room owner can upload disclosure packets",
      );
    }

    if (args.byteSize <= 0 || args.byteSize > PER_FILE_MAX_BYTES) {
      throw new Error("File exceeds 20 MB limit");
    }
    if (!ALLOWED_MIME_TYPES.has(args.mimeType)) {
      throw new Error(
        `Unsupported file type: ${args.mimeType}. Allowed: PDF, JPEG, PNG`,
      );
    }
    if (args.packetVersion < 1) {
      throw new Error("Invalid packet version");
    }
    if (args.fileName.trim().length === 0) {
      throw new Error("File name is required");
    }

    const workflow = args.workflow ?? "disclosure";
    const uploadUrl = await ctx.storage.generateUploadUrl();
    // `storageKey` is a stable echo of the filename + version intent so
    // the client can correlate uploads to the commit call. The real
    // storage id is returned by Convex's upload response itself.
    const storageKey = `${args.dealRoomId}/${workflow}/v${args.packetVersion}/${args.fileName}`;

    return { uploadUrl, storageKey };
  },
});

/**
 * Step 2 of the upload: atomically create the packet row from committed
 * file handles. Enforces version monotonicity, total-size limits, and
 * content-hash de-duplication.
 *
 * Returns `{ wasDuplicate: true }` on a content-hash collision — the
 * client should treat the returned packetId as the already-analyzed
 * packet and skip re-enqueueing parsing.
 */
export const commitUpload = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    packetVersion: v.number(),
    files: v.array(packetFileInputValidator),
    // KIN-1081: workflow discriminator. Optional, defaults to "disclosure".
    // Inspection vs. disclosure packets share this table but have
    // INDEPENDENT version sequences, dedupe scopes, and supersede chains.
    workflow: v.optional(workflowValidator),
  },
  returns: v.object({
    packetId: v.id("disclosurePackets"),
    contentHash: v.string(),
    wasDuplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { user, role } = await requirePacketAccess(ctx, args.dealRoomId);
    if (role !== "buyer") {
      throw new Error(
        "Only the deal room owner can commit a disclosure packet",
      );
    }
    if (args.files.length === 0) {
      throw new Error("Packet must contain at least one file");
    }

    let totalBytes = 0;
    for (const f of args.files) {
      if (f.byteSize <= 0 || f.byteSize > PER_FILE_MAX_BYTES) {
        throw new Error("File exceeds 20 MB limit");
      }
      if (!ALLOWED_MIME_TYPES.has(f.mimeType)) {
        throw new Error(
          `Unsupported file type: ${f.mimeType}. Allowed: PDF, JPEG, PNG`,
        );
      }
      if (f.fileName.trim().length === 0) {
        throw new Error("File name is required");
      }
      if (f.fileHash.trim().length === 0) {
        throw new Error("File hash is required");
      }
      totalBytes += f.byteSize;
    }
    if (totalBytes > PACKET_MAX_BYTES) {
      throw new Error("Packet exceeds 100 MB limit");
    }

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const workflow = args.workflow ?? "disclosure";

    const contentHash = await sha256Hex(
      args.files
        .map((f) => f.fileHash)
        .sort()
        .join("|"),
    );

    // De-dupe: any prior packet for THIS dealRoom + workflow with the same
    // contentHash short-circuits a re-analysis. Scoped by dealRoom AND
    // workflow — a disclosure packet with hash X and an inspection packet
    // with hash X are NOT duplicates of each other.
    const dupeCandidates = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
      .collect();
    const duplicate = dupeCandidates.find(
      (p) =>
        p.dealRoomId === args.dealRoomId && packetWorkflow(p) === workflow,
    );
    if (duplicate) {
      return {
        packetId: duplicate._id,
        contentHash,
        wasDuplicate: true,
      };
    }

    // Version monotonicity check: scoped by workflow. Newest existing
    // packet for the same (dealRoom, workflow) wins. The buyer-supplied
    // version must be exactly `latest + 1`, or `1` if no prior packet
    // exists in this workflow. A fresh inspection upload starts at
    // version 1 even if disclosure is already at version 5.
    const sameDealRoomPackets = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_dealRoomId_and_version", (q) =>
        q.eq("dealRoomId", args.dealRoomId),
      )
      .order("desc")
      .collect();
    const latest = sameDealRoomPackets.find(
      (p) => packetWorkflow(p) === workflow,
    );
    const expectedVersion = latest ? latest.version + 1 : 1;
    if (args.packetVersion !== expectedVersion) {
      throw new Error("Invalid packet version");
    }

    const now = new Date().toISOString();

    const packetId = await ctx.db.insert("disclosurePackets", {
      dealRoomId: args.dealRoomId,
      buyerId: user._id,
      propertyId: dealRoom.propertyId,
      version: args.packetVersion,
      // Insert in `processing` directly — the upload has already landed in
      // storage by the time commitUpload is called, so `uploading` would
      // only leak state. Kept as a literal in the schema for clients that
      // still write it during multi-phase uploads.
      status: "processing",
      contentHash,
      files: args.files.map((f) => ({
        storageId: f.storageId,
        fileName: f.fileName,
        fileHash: f.fileHash,
        byteSize: f.byteSize,
        mimeType: f.mimeType,
        status: "pending" as const,
      })),
      createdAt: now,
      updatedAt: now,
      workflow,
    });

    // Supersede the previous latest packet (if any) AFTER the new row is
    // created so `supersededBy` can point at it. Scoped by workflow — a
    // new inspection packet does NOT supersede the latest disclosure
    // packet, only the prior latest inspection.
    if (latest && latest.status !== "superseded") {
      await ctx.db.patch(latest._id, {
        status: "superseded",
        supersededAt: now,
        supersededBy: packetId,
        updatedAt: now,
      });
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action:
        workflow === "inspection"
          ? "inspection_packet_created"
          : "disclosure_packet_created",
      entityType: "disclosurePackets",
      entityId: packetId,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        version: args.packetVersion,
        fileCount: args.files.length,
        totalBytes,
        contentHash,
        workflow,
      }),
      timestamp: now,
    });

    // Kick off the AI parser. Only fires for fresh packets — duplicate
    // commits short-circuited above with the existing packetId, which
    // already carries persisted analysis. Inspection packets dispatch to
    // `inspectionParser.runInspectionParser`, which is shipped by the
    // inspection-engine teammate (KIN-1081 Agent #3). The typed
    // `internal.engines.inspectionParser.*` reference does not yet exist
    // in the codegen graph, so we use a string FunctionReference escape
    // hatch — Convex resolves it at runtime once the module ships.
    if (workflow === "inspection") {
      await ctx.scheduler.runAfter(
        0,
        "engines/inspectionParser:runInspectionParser" as unknown as Parameters<
          typeof ctx.scheduler.runAfter
        >[1],
        { packetId },
      );
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.engines.disclosureParser.runDisclosureParser,
        { packetId },
      );
    }

    return { packetId, contentHash, wasDuplicate: false };
  },
});

// ═══ Internal status helpers (engine + worker path) ═════════════════════

/**
 * Flip the status of a single file inside a packet. Called by the OCR
 * worker path or the disclosure-parser engine as each file moves through
 * pending → ocr → parsing → done (or → failed).
 */
export const updateFileStatus = internalMutation({
  args: {
    packetId: v.id("disclosurePackets"),
    storageId: v.id("_storage"),
    status: packetFileStatusValidator,
    failureReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) throw new Error("Packet not found");

    let mutated = false;
    const nextFiles = packet.files.map((f) => {
      if (f.storageId !== args.storageId) return f;
      mutated = true;
      return {
        ...f,
        status: args.status,
        failureReason:
          args.status === "failed" ? args.failureReason : undefined,
      };
    });
    if (!mutated) {
      throw new Error("File not found in packet");
    }

    await ctx.db.patch(args.packetId, {
      files: nextFiles,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

/**
 * Transition the packet-level status. Called by the engine path after
 * analysis completes (→ ready / partial_failure / failed).
 */
export const markPacketStatus = internalMutation({
  args: {
    packetId: v.id("disclosurePackets"),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("partial_failure"),
      v.literal("failed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) throw new Error("Packet not found");
    if (packet.status === "superseded") {
      // Ignore late writes against a packet that was replaced mid-analysis.
      // The newer packet carries the findings the buyer actually sees.
      return null;
    }
    await ctx.db.patch(args.packetId, {
      status: args.status,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// KIN-1079 — Request Disclosures rail
// ═══════════════════════════════════════════════════════════════════════════
//
// Buyer-facing "Request Disclosures" CTA. When the buyer clicks send, we
// compose a broker-authored email (plus their optional personal note),
// persist the composed body verbatim for audit, and ship it through the
// mailRail driver to the listing agent on file.
//
// v1 runs against the `noop` driver — nothing leaves the server; we only
// log + write the audit trail. The Resend wiring lives behind KIN-1092.
// Sender identity is hard-coded to a placeholder brokerage alias so we
// never leak a buyer's personal email into the outbound From header
// before a compliance review lands.

const disclosureRequestStatusValidator = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("opened"),
  v.literal("replied"),
  v.literal("follow_up_needed"),
  v.literal("cancelled"),
);

const disclosureRequestProviderValidator = v.union(
  v.literal("noop"),
  v.literal("resend"),
);

const disclosureRequestRowValidator = v.object({
  _id: v.id("disclosureRequests"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  buyerId: v.id("users"),
  propertyId: v.id("properties"),
  listingAgentEmail: v.string(),
  listingAgentName: v.optional(v.string()),
  subject: v.string(),
  bodyText: v.string(),
  personalNote: v.optional(v.string()),
  status: disclosureRequestStatusValidator,
  providerMessageId: v.optional(v.string()),
  provider: disclosureRequestProviderValidator,
  sentAt: v.optional(v.string()),
  openedAt: v.optional(v.string()),
  repliedAt: v.optional(v.string()),
  lastFollowUpAt: v.optional(v.string()),
  followUpCount: v.number(),
  nextFollowUpDueAt: v.optional(v.string()),
  replyPacketId: v.optional(v.id("disclosurePackets")),
  replyBodySnippetText: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const FOLLOW_UP_WINDOW_MS = 48 * 60 * 60 * 1000;
const REPLY_SNIPPET_MAX_CHARS = 500;

// v1 sender identity. The `from` header is a brokerage alias so the buyer's
// personal email is never leaked outbound before compliance review. The
// `replyTo` is a placeholder alias for the same reason — once KIN-1092
// wires real Resend + compliance review lands, this is replaced with a
// per-deal-room alias that threads back into the buyer's inbox.
const BROKER_FROM_ADDRESS = "broker@buyer-v2.app";
const BROKER_FROM_NAME = "buyer-v2 Brokerage";
const BROKER_REPLY_TO = "reply@buyer-v2.app";

/**
 * Compose the full email body from the broker-authored template plus the
 * buyer's optional personal note. The resulting string is persisted
 * verbatim so the audit trail contains exactly what was "sent".
 */
function composeDisclosureRequestBody(params: {
  listingAgentName?: string;
  buyerDisplayName: string;
  propertyAddress: string;
  personalNote?: string;
}): { subject: string; bodyText: string } {
  const greetingName = params.listingAgentName?.trim().length
    ? params.listingAgentName.trim()
    : "there";
  const subject = `Disclosure request — ${params.propertyAddress}`;
  const lines: Array<string> = [
    `Hi ${greetingName},`,
    "",
    `I'm reaching out on behalf of ${params.buyerDisplayName}, who is preparing to make an offer on ${params.propertyAddress}. Before we finalize terms, we're asking for the seller's disclosures package — typically this includes the Seller's Property Disclosure, any HOA / condo docs, recent inspection reports, permit history, and any known material defects.`,
    "",
    "You can reply directly to this email with attachments (PDF preferred). If a formal request letter or signed acknowledgment is needed on our side, let me know and I'll send it over the same day.",
    "",
    "Thanks for your help — we'll keep the turnaround tight on our end.",
  ];

  const personal = params.personalNote?.trim();
  if (personal && personal.length > 0) {
    lines.push("", "A personal note from the buyer:", personal);
  }

  lines.push(
    "",
    "Best,",
    "buyer-v2 Brokerage",
    "(Sent on behalf of the buyer — please reply all.)",
  );

  return { subject, bodyText: lines.join("\n") };
}

/**
 * Resolve the listing-agent row linked to a property via the
 * `propertyAgentLinks.by_propertyId_and_role` index. Throws if no listing
 * agent is on file, or if the linked row has no email (we cannot send
 * without a destination).
 */
async function resolveListingAgentForProperty(
  ctx: QueryCtx,
  propertyId: Id<"properties">,
): Promise<{
  agent: Doc<"listingAgents">;
  email: string;
}> {
  const link = await ctx.db
    .query("propertyAgentLinks")
    .withIndex("by_propertyId_and_role", (q) =>
      q.eq("propertyId", propertyId).eq("role", "listing"),
    )
    .first();
  if (!link) {
    throw new Error("No listing agent on file for this property");
  }
  const agent = await ctx.db.get(link.agentId);
  if (!agent) {
    throw new Error("No listing agent on file for this property");
  }
  const email = agent.email?.trim();
  if (!email || email.length === 0) {
    throw new Error("No listing agent on file for this property");
  }
  return { agent, email };
}

/**
 * Send a disclosure-request email to the listing agent on file.
 *
 * Flow:
 *   1. Verify the caller owns the deal room (buyer-only).
 *   2. Feature-flag gate: `KIN_1079_REQUEST_DISCLOSURES_ENABLED`.
 *   3. Resolve the listing agent + the property address off the deal room.
 *   4. Compose the email body (broker template + optional personal note)
 *      and persist it verbatim.
 *   5. Hand off to the mailRail driver (noop in v1).
 *   6. Insert `disclosureRequests` row with status `sent`, set the 48h
 *      follow-up due-at, and write an audit row.
 *
 * Auth: buyer only (owner of the deal room).
 */
export const requestFromListingAgent = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    personalNote: v.optional(v.string()),
  },
  returns: v.object({ requestId: v.id("disclosureRequests") }),
  handler: async (ctx, args) => {
    if (process.env.KIN_1079_REQUEST_DISCLOSURES_ENABLED !== "true") {
      throw new Error("Request Disclosures rail disabled");
    }

    const { user, role } = await requirePacketAccess(ctx, args.dealRoomId);
    if (role !== "buyer") {
      throw new Error("Only the deal room owner can request disclosures");
    }

    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const property = await ctx.db.get(dealRoom.propertyId);
    if (!property) throw new Error("Property not found");

    const { agent, email: listingAgentEmail } =
      await resolveListingAgentForProperty(ctx, dealRoom.propertyId);

    // `property.address` is a structured object (street/unit/city/...).
    // Prefer the canonical `formatted` string if set; otherwise fall back
    // to a hand-composed `street, city ST zip` form so the email subject
    // and body are never missing the address.
    const addr = property.address;
    const formattedAddress =
      addr.formatted?.trim().length
        ? addr.formatted.trim()
        : `${addr.street}${addr.unit ? ` ${addr.unit}` : ""}, ${addr.city} ${addr.state} ${addr.zip}`;
    const propertyAddress = formattedAddress.length > 0
      ? formattedAddress
      : "the subject property";

    const { subject, bodyText } = composeDisclosureRequestBody({
      listingAgentName: agent.name,
      buyerDisplayName: user.name,
      propertyAddress,
      personalNote: args.personalNote,
    });

    const driver = selectDriver();
    const mailMessage: MailMessage = {
      to: listingAgentEmail,
      toName: agent.name,
      from: BROKER_FROM_ADDRESS,
      fromName: BROKER_FROM_NAME,
      subject,
      bodyText,
      replyTo: BROKER_REPLY_TO,
      metadata: {
        dealRoomId: args.dealRoomId,
        buyerId: user._id,
        propertyId: dealRoom.propertyId,
        feature: "kin-1079-request-disclosures",
      },
    };

    const { providerMessageId } = await driver.send(mailMessage);

    const now = new Date().toISOString();
    const nextFollowUpDueAt = new Date(
      Date.now() + FOLLOW_UP_WINDOW_MS,
    ).toISOString();

    const requestId = await ctx.db.insert("disclosureRequests", {
      dealRoomId: args.dealRoomId,
      buyerId: user._id,
      propertyId: dealRoom.propertyId,
      listingAgentEmail,
      listingAgentName: agent.name,
      subject,
      bodyText,
      personalNote: args.personalNote,
      status: "sent",
      providerMessageId,
      provider: driver.name,
      sentAt: now,
      followUpCount: 0,
      nextFollowUpDueAt,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "disclosure_request_sent",
      entityType: "disclosureRequests",
      entityId: requestId,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        propertyId: dealRoom.propertyId,
        listingAgentEmail,
        provider: driver.name,
        providerMessageId,
        subject,
        nextFollowUpDueAt,
      }),
      timestamp: now,
    });

    return { requestId };
  },
});

/**
 * Return the most recent non-cancelled disclosure request for a deal room
 * (or null if none exist). Drives the CTA card status on the deal room UI.
 *
 * Auth: buyer owner OR broker/admin.
 */
export const getLatestDisclosureRequest = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(v.null(), disclosureRequestRowValidator),
  handler: async (ctx, args) => {
    await requirePacketAccess(ctx, args.dealRoomId);

    const rows = await ctx.db
      .query("disclosureRequests")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .order("desc")
      .collect();

    for (const row of rows) {
      if (row.status !== "cancelled") return row;
    }
    return null;
  },
});

/**
 * Full history of disclosure requests for a deal room, newest first.
 * Powers the status-timeline view in the UI.
 *
 * Auth: buyer owner OR broker/admin.
 */
export const listDisclosureRequestsForDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(disclosureRequestRowValidator),
  handler: async (ctx, args) => {
    await requirePacketAccess(ctx, args.dealRoomId);

    return await ctx.db
      .query("disclosureRequests")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .order("desc")
      .collect();
  },
});

/**
 * Soft-cancel a disclosure request. Only the deal room owner (buyer) can
 * cancel, and only while the row is still in `draft`, `sent`, or
 * `follow_up_needed` — replies and prior cancellations are terminal.
 */
export const cancelDisclosureRequest = mutation({
  args: { requestId: v.id("disclosureRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Disclosure request not found");

    const { role } = await requirePacketAccess(ctx, request.dealRoomId);
    if (role !== "buyer") {
      throw new Error("Only the deal room owner can cancel a disclosure request");
    }

    if (
      request.status !== "draft" &&
      request.status !== "sent" &&
      request.status !== "follow_up_needed"
    ) {
      throw new Error(
        `Cannot cancel a disclosure request in status "${request.status}"`,
      );
    }

    await ctx.db.patch(args.requestId, {
      status: "cancelled",
      nextFollowUpDueAt: undefined,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

/**
 * Webhook seam for future provider open-tracking (Resend). Marks the
 * request as `opened` idempotently — subsequent calls are no-ops so the
 * handler is safe to retry. Only advances status forward from `sent`.
 */
export const markDisclosureRequestOpened = internalMutation({
  args: { requestId: v.id("disclosureRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    if (request.openedAt !== undefined) return null;
    if (request.status !== "sent") return null;

    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "opened",
      openedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Ingest a reply to a disclosure request. v1 never runs through this path
 * (the noop driver produces no replies); KIN-1092 Resend wiring will call
 * it with the reply body + from-address. Attachments are out of scope for
 * v1 — a future revision will pass storage ids alongside.
 *
 * Sets status → `replied`, nulls the follow-up clock, stores the first
 * ~500 chars of the reply body for audit.
 */
export const ingestDisclosureRequestReply = internalMutation({
  args: {
    requestId: v.id("disclosureRequests"),
    fromAddress: v.string(),
    subject: v.string(),
    bodyTextSnippet: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Disclosure request not found");
    if (request.status === "cancelled") {
      throw new Error("Cannot ingest a reply for a cancelled request");
    }

    const snippet = args.bodyTextSnippet.slice(0, REPLY_SNIPPET_MAX_CHARS);
    const now = new Date().toISOString();

    await ctx.db.patch(args.requestId, {
      status: "replied",
      repliedAt: now,
      nextFollowUpDueAt: undefined,
      replyBodySnippetText: snippet,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Hourly sweep (registered in `convex/crons.ts`). Finds every `sent`
 * request whose `nextFollowUpDueAt` is in the past, flips status to
 * `follow_up_needed`, increments `followUpCount`, and clears the clock.
 *
 * The UI reads `follow_up_needed` to surface a nudge; actual outbound
 * follow-up mail is a separate (future) mutation gated on broker review.
 */
export const runDisclosureRequestFollowUpSweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();

    // Scan the `status="sent"` prefix of the
    // (status, nextFollowUpDueAt) index and filter overdue rows in
    // memory. The index keeps the prefix cheap, and ISO-8601 strings
    // compare lexicographically the same way they sort chronologically,
    // so `row.nextFollowUpDueAt <= nowIso` is the correct overdue test.
    const sentRows = await ctx.db
      .query("disclosureRequests")
      .withIndex("by_status_and_nextFollowUpDueAt", (q) =>
        q.eq("status", "sent"),
      )
      .collect();

    for (const row of sentRows) {
      if (row.nextFollowUpDueAt === undefined) continue;
      if (row.nextFollowUpDueAt > nowIso) continue;
      await ctx.db.patch(row._id, {
        status: "follow_up_needed",
        followUpCount: row.followUpCount + 1,
        lastFollowUpAt: nowIso,
        nextFollowUpDueAt: undefined,
        updatedAt: nowIso,
      });
    }
    return null;
  },
});
