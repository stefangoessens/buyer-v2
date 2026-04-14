import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUser } from "./lib/session";
import { resolveCurrentGoverningFromRows } from "./agreementSupersession";
import type { Doc, Id } from "./_generated/dataModel";

type AgreementDoc = Doc<"agreements">;

type AgreementWithSupersession = AgreementDoc & {
  isHead: boolean;
  isTail: boolean;
  chainDepth: number;
  successorId: Id<"agreements"> | null;
};

function annotateChainState(agreements: AgreementDoc[]): AgreementWithSupersession[] {
  const successorIds = new Set<Id<"agreements">>();
  for (const a of agreements) {
    if (a.replacedById) successorIds.add(a.replacedById);
  }
  const byId = new Map(agreements.map((a) => [a._id, a]));

  const headIdFor = new Map<Id<"agreements">, Id<"agreements">>();
  const depthFor = new Map<Id<"agreements">, number>();

  const heads = agreements.filter((a) => !successorIds.has(a._id));
  for (const head of heads) {
    let cursor: AgreementDoc | undefined = head;
    let depth = 0;
    const seen = new Set<Id<"agreements">>();
    while (cursor && !seen.has(cursor._id)) {
      seen.add(cursor._id);
      headIdFor.set(cursor._id, head._id);
      depth += 1;
      if (!cursor.replacedById) break;
      cursor = byId.get(cursor.replacedById);
    }
    depthFor.set(head._id, depth);
  }

  return agreements.map((a) => {
    const headId = headIdFor.get(a._id) ?? a._id;
    const isHead = headId === a._id;
    const isTail = !a.replacedById;
    const chainDepth = depthFor.get(headId) ?? 1;
    return {
      ...a,
      isHead,
      isTail,
      chainDepth,
      successorId: a.replacedById ?? null,
    };
  });
}

export const listGrouped = query({
  args: {
    dealRoomFilter: v.optional(v.id("dealRooms")),
    statusFilter: v.optional(v.string()),
    typeFilter: v.optional(v.string()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const dealRooms = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .collect();

    const groups = await Promise.all(
      dealRooms.map(async (dr) => {
        if (args.dealRoomFilter && args.dealRoomFilter !== dr._id) return null;

        let agreements = await ctx.db
          .query("agreements")
          .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", dr._id))
          .collect();

        if (args.statusFilter) {
          agreements = agreements.filter((a) => a.status === args.statusFilter);
        }
        if (args.typeFilter) {
          agreements = agreements.filter((a) => a.type === args.typeFilter);
        }

        if (agreements.length === 0) return null;

        const annotated = annotateChainState(agreements);
        const governing = resolveCurrentGoverningFromRows(agreements);

        const property = await ctx.db.get(dr.propertyId);

        return {
          dealRoomId: dr._id,
          property: property
            ? {
                _id: property._id,
                address: property.address,
                listPrice: property.listPrice,
              }
            : null,
          governing,
          allAgreements: annotated,
          createdAt: dr.createdAt,
        };
      }),
    );

    return groups
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  },
});
