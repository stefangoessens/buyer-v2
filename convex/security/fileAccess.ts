import { query, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { getSessionContext } from "../lib/session";
import type { Id } from "../_generated/dataModel";

/**
 * Check if a user can access a file associated with a deal room.
 * Access rules:
 * - Buyer: own deal rooms only
 * - Broker/Admin: all deal rooms
 */
export const checkFileAccess = internalQuery({
  args: {
    userId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
  },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { allowed: false, reason: "User not found" };
    }

    // Admin and broker can access all files
    if (user.role === "admin" || user.role === "broker") {
      return { allowed: true, reason: "Role-based access" };
    }

    // Buyer can only access their own deal rooms
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) {
      return { allowed: false, reason: "Deal room not found" };
    }

    if (dealRoom.buyerId === args.userId) {
      return { allowed: true, reason: "Owner access" };
    }

    return { allowed: false, reason: "Not authorized for this deal room" };
  },
});

/**
 * Get a signed file URL after access check.
 * Public query — validates the calling user's access before returning URL.
 */
export const getSecureFileUrl = query({
  args: {
    fileId: v.id("_storage"),
    dealRoomId: v.id("dealRooms"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const session = await getSessionContext(ctx);
    if (session.kind !== "authenticated") return null;
    const user = session.user;

    // Check deal room access
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    const hasAccess =
      user.role === "admin" ||
      user.role === "broker" ||
      dealRoom.buyerId === user._id;

    if (!hasAccess) return null;

    // Verify the file is actually referenced by a record in this deal room
    // Check agreements and contracts for this deal room
    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const referencedFileIds = new Set<string>();
    for (const a of agreements) {
      if (a.documentStorageId) referencedFileIds.add(a.documentStorageId);
    }
    for (const c of contracts) {
      if (c.documentStorageId) referencedFileIds.add(c.documentStorageId);
    }

    if (!referencedFileIds.has(args.fileId)) {
      // Fall through to disclosure packets — a file referenced by a
      // disclosurePackets row (disclosure OR inspection workflow, since
      // KIN-1081 they share this table) in the same deal room is valid.
      const disclosureAllowed = await canAccessDisclosureFile(
        ctx,
        user._id,
        args.fileId,
      );
      const inspectionAllowed = disclosureAllowed
        ? true
        : await canAccessInspectionFile(ctx, user._id, args.fileId);
      if (!disclosureAllowed && !inspectionAllowed) return null;
    }

    return await ctx.storage.getUrl(args.fileId);
  },
});

/**
 * Check whether a user can read a specific `_storage` file by walking the
 * `disclosurePackets` table for the dealRooms they own (or all, for
 * broker/admin). This is the auth invariant for downloads of disclosure
 * attachments — NEVER trust just the dealRoomId, because a file in
 * dealRoom A must not be readable via a signed URL parameterized with
 * dealRoom B.
 *
 * For buyers: scan the packets they own and check whether any of their
 * packet `files[].storageId` includes the requested storage id.
 *
 * For broker/admin: any disclosure packet referencing this file is fair
 * game (they can read every dealRoom's packets).
 *
 * KIN-1081: the `disclosurePackets` table now also holds inspection-
 * workflow rows. A `workflow` filter scopes lookups to a specific
 * sub-stream when callers care which workflow the file belongs to. Use
 * `"any"` to allow either — that matches pre-KIN-1081 behavior.
 */
async function packetFileAccess(
  ctx: QueryCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
  workflowFilter: "disclosure" | "inspection" | "any",
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;

  const isPrivileged = user.role === "broker" || user.role === "admin";

  const matchesWorkflow = (
    packetWorkflow: "disclosure" | "inspection" | undefined,
  ): boolean => {
    if (workflowFilter === "any") return true;
    const effective = packetWorkflow === "inspection" ? "inspection" : "disclosure";
    return effective === workflowFilter;
  };

  if (isPrivileged) {
    // Full-table scan is acceptable here because broker/admin downloads
    // are low-frequency and the packet table is one row per upload.
    for await (const p of ctx.db.query("disclosurePackets")) {
      if (!matchesWorkflow(p.workflow)) continue;
      if (p.files.some((f) => f.storageId === storageId)) return true;
    }
    return false;
  }

  // Buyer: restrict the scan to their own packets via the by_buyerId index.
  const myPackets = await ctx.db
    .query("disclosurePackets")
    .withIndex("by_buyerId", (q) => q.eq("buyerId", userId))
    .collect();

  for (const p of myPackets) {
    if (!matchesWorkflow(p.workflow)) continue;
    if (p.files.some((f) => f.storageId === storageId)) return true;
  }
  return false;
}

export async function canAccessDisclosureFile(
  ctx: QueryCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
): Promise<boolean> {
  return packetFileAccess(ctx, userId, storageId, "disclosure");
}

/**
 * KIN-1081: counterpart to `canAccessDisclosureFile` for inspection-
 * workflow packets. Inspection packets share the `disclosurePackets`
 * table but carry `workflow === "inspection"` and need their own access
 * gate so callers reading inspection storage ids don't accidentally
 * authorize against unrelated disclosure files.
 */
export async function canAccessInspectionFile(
  ctx: QueryCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
): Promise<boolean> {
  return packetFileAccess(ctx, userId, storageId, "inspection");
}
