import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/session";

/** Check if the authenticated buyer is eligible to make offers */
export const checkEligibility = query({
  args: {},
  returns: v.object({
    eligible: v.boolean(),
    currentAgreementType: v.union(
      v.literal("tour_pass"),
      v.literal("full_representation"),
      v.literal("none")
    ),
    requiredAction: v.union(
      v.literal("none"),
      v.literal("upgrade_to_full_rep"),
      v.literal("sign_agreement")
    ),
    reason: v.string(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        eligible: false,
        currentAgreementType: "none" as const,
        requiredAction: "sign_agreement" as const,
        reason: "Not authenticated",
      };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_authSubject", (q) =>
        q.eq("authSubject", identity.subject)
      )
      .unique();
    if (!user) {
      return {
        eligible: false,
        currentAgreementType: "none" as const,
        requiredAction: "sign_agreement" as const,
        reason: "User not found",
      };
    }

    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .collect();

    // Check for signed full_representation
    const signedFullRep = agreements.find(
      (a) => a.type === "full_representation" && a.status === "signed"
    );
    if (signedFullRep) {
      return {
        eligible: true,
        currentAgreementType: "full_representation" as const,
        requiredAction: "none" as const,
        reason: "Full representation agreement is signed.",
      };
    }

    const signedTourPass = agreements.find(
      (a) => a.type === "tour_pass" && a.status === "signed"
    );
    if (signedTourPass) {
      return {
        eligible: false,
        currentAgreementType: "tour_pass" as const,
        requiredAction: "upgrade_to_full_rep" as const,
        reason:
          "Tour Pass signed. Upgrade to Full Representation required for offers.",
      };
    }

    return {
      eligible: false,
      currentAgreementType: "none" as const,
      requiredAction: "sign_agreement" as const,
      reason: "No signed agreement found.",
    };
  },
});

/** Initiate upgrade from Tour Pass to Full Representation (broker/admin) */
export const initiateUpgrade = mutation({
  args: {
    buyerId: v.id("users"),
    dealRoomId: v.id("dealRooms"),
    documentStorageId: v.optional(v.id("_storage")),
  },
  returns: v.union(v.id("agreements"), v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers and admins can initiate upgrades");
    }

    // Find the current signed tour_pass
    const agreements = await ctx.db
      .query("agreements")
      .withIndex("by_buyerId_and_type", (q) =>
        q.eq("buyerId", args.buyerId).eq("type", "tour_pass")
      )
      .collect();
    const currentTourPass = agreements.find((a) => a.status === "signed");

    if (!currentTourPass) {
      throw new Error("No signed Tour Pass found to upgrade");
    }

    // Mark current as replaced
    await ctx.db.patch(currentTourPass._id, {
      status: "replaced",
      canceledAt: new Date().toISOString(),
    });

    // Create new full_representation draft
    const newId = await ctx.db.insert("agreements", {
      dealRoomId: args.dealRoomId,
      buyerId: args.buyerId,
      type: "full_representation",
      status: "draft",
      documentStorageId: args.documentStorageId,
    });

    // Link replacement
    await ctx.db.patch(currentTourPass._id, { replacedById: newId });

    // Audit
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "agreement_upgrade_initiated",
      entityType: "agreements",
      entityId: currentTourPass._id,
      details: JSON.stringify({
        from: "tour_pass",
        to: "full_representation",
        newAgreementId: newId,
      }),
      timestamp: new Date().toISOString(),
    });

    return newId;
  },
});
