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
});

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
 * Auth: buyer owner OR broker/admin.
 */
export const getLatestPacket = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(
    v.null(),
    v.object({
      packet: packetRowValidator,
      findings: v.array(findingRowValidator),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePacketAccess(ctx, args.dealRoomId);

    const latest = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_dealRoomId_and_version", (q) =>
        q.eq("dealRoomId", args.dealRoomId),
      )
      .order("desc")
      .first();

    if (!latest || latest.status === "superseded") {
      // If the newest row by version is `superseded`, by construction there
      // is no active packet — a fresh upload will create the next version.
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
 * Auth: buyer owner OR broker/admin.
 */
export const listPacketHistory = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(packetRowValidator),
  handler: async (ctx, args) => {
    await requirePacketAccess(ctx, args.dealRoomId);

    const packets = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_dealRoomId_and_version", (q) =>
        q.eq("dealRoomId", args.dealRoomId),
      )
      .order("desc")
      .collect();

    return packets;
  },
});

/**
 * Broker/admin review queue. Returns packets that currently have at least
 * one high/critical severity finding OR a low-confidence finding, ordered
 * by worst-severity first, then most recent.
 *
 * Implementation: fetch flagged findings via the review-index, group by
 * packetId, then hydrate the packet rows.
 */
export const listBrokerReviewQueue = query({
  args: { limit: v.optional(v.number()) },
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

    const uploadUrl = await ctx.storage.generateUploadUrl();
    // `storageKey` is a stable echo of the filename + version intent so
    // the client can correlate uploads to the commit call. The real
    // storage id is returned by Convex's upload response itself.
    const storageKey = `${args.dealRoomId}/v${args.packetVersion}/${args.fileName}`;

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

    const contentHash = await sha256Hex(
      args.files
        .map((f) => f.fileHash)
        .sort()
        .join("|"),
    );

    // De-dupe: any prior packet for THIS dealRoom with the same contentHash
    // short-circuits a re-analysis. We scope by dealRoom rather than global
    // hash matches so two unrelated buyers uploading identical blank forms
    // still each get their own packet.
    const dupeCandidates = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
      .collect();
    const duplicate = dupeCandidates.find(
      (p) => p.dealRoomId === args.dealRoomId,
    );
    if (duplicate) {
      return {
        packetId: duplicate._id,
        contentHash,
        wasDuplicate: true,
      };
    }

    // Version monotonicity check: newest existing packet (any status) wins.
    // The buyer-supplied version must be exactly `latest + 1`, or `1` if no
    // prior packet exists. Anything else is a client bug — reject.
    const latest = await ctx.db
      .query("disclosurePackets")
      .withIndex("by_dealRoomId_and_version", (q) =>
        q.eq("dealRoomId", args.dealRoomId),
      )
      .order("desc")
      .first();
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
    });

    // Supersede the previous latest packet (if any) AFTER the new row is
    // created so `supersededBy` can point at it.
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
      action: "disclosure_packet_created",
      entityType: "disclosurePackets",
      entityId: packetId,
      details: JSON.stringify({
        dealRoomId: args.dealRoomId,
        version: args.packetVersion,
        fileCount: args.files.length,
        totalBytes,
        contentHash,
      }),
      timestamp: now,
    });

    // Kick off the AI disclosure parser. Only fires for fresh packets —
    // duplicate commits short-circuited above with the existing packetId,
    // which already carries persisted analysis.
    await ctx.scheduler.runAfter(
      0,
      internal.engines.disclosureParser.runDisclosureParser,
      { packetId },
    );

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
