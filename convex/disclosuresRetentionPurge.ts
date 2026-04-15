/**
 * Disclosure packet retention purge (KIN-1078).
 *
 * Scheduled action that deletes sensitive content from disclosure
 * packets once they're past the `legal_documents` retention period
 * (2555 days / 7 years, per `src/lib/security/retention.ts`).
 *
 * What gets purged:
 *   - Raw file blobs in `_storage` (via ctx.storage.delete)
 *   - The `files` array on each packet row (zeroed out)
 *   - The `contentHash` on each packet row (zeroed out)
 *   - `evidenceQuote` + `buyerFriendlyExplanation` on per-packet findings
 *
 * What we KEEP (for the compliance audit trail):
 *   - The `disclosurePackets` row itself — marked failed with a purge note
 *   - The `fileAnalysisFindings` rows — severity/category kept, only the
 *     free-text leak surfaces are zeroed
 *   - The `auditLog` entries for the packet's lifecycle
 */

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// Mirror of `RETENTION_POLICIES.legal_documents.retentionDays` from
// `src/lib/security/retention.ts`. Convex server files cannot import
// from `src/`, so the number is duplicated here. Update both together.
const LEGAL_DOCUMENTS_RETENTION_DAYS = 2555; // 7 years
const MS_PER_DAY = 86_400_000;
const PAGE_SIZE = 50;

type PacketRow = Doc<"disclosurePackets">;

/**
 * Internal query: list the next batch of packets whose `createdAt` is
 * older than the retention cutoff AND that haven't already been purged
 * (files array still contains storageIds).
 */
export const listExpiredPackets = internalQuery({
  args: {
    cutoffIso: v.string(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("disclosurePackets"),
      storageIds: v.array(v.id("_storage")),
    }),
  ),
  handler: async (ctx, args) => {
    // There's no index on `createdAt` for disclosurePackets — the table is
    // low-cardinality (one row per packet upload) so a full scan bounded
    // by `limit` is acceptable for a nightly cron. If this grows we can
    // add a dedicated `by_createdAt` index later.
    const rows: Array<{
      _id: Id<"disclosurePackets">;
      storageIds: Array<Id<"_storage">>;
    }> = [];

    for await (const p of ctx.db.query("disclosurePackets")) {
      if (rows.length >= args.limit) break;
      if (p.createdAt >= args.cutoffIso) continue;
      if (p.files.length === 0) continue; // already purged
      rows.push({
        _id: p._id,
        storageIds: p.files.map((f) => f.storageId),
      });
    }

    return rows;
  },
});

/**
 * Internal mutation: zero out sensitive fields on a packet and its
 * findings. Storage deletion happens in the action before this runs.
 */
export const redactPacket = internalMutation({
  args: {
    packetId: v.id("disclosurePackets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const packet = await ctx.db.get(args.packetId);
    if (!packet) return null;

    const now = new Date().toISOString();

    await ctx.db.patch(args.packetId, {
      files: [],
      contentHash: "",
      status: "failed" as const,
      updatedAt: now,
    });

    const findings = await ctx.db
      .query("fileAnalysisFindings")
      .withIndex("by_packetId", (q) => q.eq("packetId", args.packetId))
      .collect();

    for (const f of findings) {
      await ctx.db.patch(f._id, {
        evidenceQuote: undefined,
        buyerFriendlyExplanation: undefined,
      });
    }

    await ctx.db.insert("auditLog", {
      action: "disclosure_packet_purged",
      entityType: "disclosurePackets",
      entityId: args.packetId,
      details: JSON.stringify({
        retentionCategory: "legal_documents",
        retentionDays: LEGAL_DOCUMENTS_RETENTION_DAYS,
        purgedAt: now,
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * The scheduled action itself. Called by the cron in `convex/crons.ts`.
 *
 * Walks expired packets in bounded batches, deletes each referenced file
 * from object storage, then calls `redactPacket` to zero sensitive fields.
 * Continues batching until no expired packets remain or the per-run cap
 * is hit.
 */
export const purgeExpiredDisclosures = internalAction({
  args: {},
  returns: v.object({
    purgedCount: v.number(),
    skippedCount: v.number(),
  }),
  handler: async (ctx) => {
    const cutoffMs = Date.now() - LEGAL_DOCUMENTS_RETENTION_DAYS * MS_PER_DAY;
    const cutoffIso = new Date(cutoffMs).toISOString();

    const MAX_BATCHES = 20; // upper-bound a single cron tick at 1000 rows
    let purgedCount = 0;
    let skippedCount = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const expired: Array<{
        _id: Id<"disclosurePackets">;
        storageIds: Array<Id<"_storage">>;
      }> = await ctx.runQuery(
        internal.disclosuresRetentionPurge.listExpiredPackets,
        {
          cutoffIso,
          limit: PAGE_SIZE,
        },
      );

      if (expired.length === 0) break;

      for (const row of expired) {
        try {
          for (const storageId of row.storageIds) {
            await ctx.storage.delete(storageId);
          }
          await ctx.runMutation(
            internal.disclosuresRetentionPurge.redactPacket,
            { packetId: row._id },
          );
          purgedCount += 1;
        } catch (err) {
          // Keep the cron moving — a single borked row should not halt
          // the rest of the batch. The next tick will retry.
          console.error(
            `[disclosures-retention] failed to purge packet ${row._id}:`,
            err,
          );
          skippedCount += 1;
        }
      }
    }

    return { purgedCount, skippedCount };
  },
});
