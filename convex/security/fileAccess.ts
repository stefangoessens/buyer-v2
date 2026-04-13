import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getSessionContext } from "../lib/session";

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

    if (!referencedFileIds.has(args.fileId)) return null;

    return await ctx.storage.getUrl(args.fileId);
  },
});
