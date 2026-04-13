import {
  query,
  mutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { v } from "convex/values"
import { requireAuth } from "./lib/session"
import {
  agreementAccessScope,
  agreementArtifact,
  agreementStatus,
  agreementType,
  supersessionReason,
} from "./lib/validators"
import {
  assertCanManageAgreements,
  buildAgreementAccessAudit,
  buildAgreementCanceledAudit,
  buildAgreementCanceledPatch,
  buildAgreementCreatedAudit,
  buildAgreementDraft,
  buildAgreementReplacedAudit,
  buildAgreementSentAudit,
  buildAgreementSentPatch,
  buildAgreementSignedAudit,
  buildAgreementSignedPatch,
  buildReplacementDraftInput,
  canReadAgreement,
  getSignedArtifactStorageId,
  resolveCurrentAgreementReadModel,
} from "./lib/agreements"
import { applySupersessionState } from "./agreementSupersession"

const agreementArtifactInputValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.optional(v.string()),
  contentType: v.optional(v.string()),
  checksumSha256: v.optional(v.string()),
})

const agreementRecordValidator = v.object({
  _id: v.id("agreements"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  buyerId: v.id("users"),
  type: agreementType,
  status: agreementStatus,
  documentStorageId: v.optional(v.id("_storage")),
  signedArtifact: v.optional(agreementArtifact),
  effectiveStartAt: v.optional(v.string()),
  effectiveEndAt: v.optional(v.string()),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
  createdByUserId: v.optional(v.id("users")),
  lastUpdatedByUserId: v.optional(v.id("users")),
  sentAt: v.optional(v.string()),
  signedAt: v.optional(v.string()),
  canceledAt: v.optional(v.string()),
  canceledReason: v.optional(v.string()),
  supersededAt: v.optional(v.string()),
  supersessionReason: v.optional(supersessionReason),
  replacedById: v.optional(v.id("agreements")),
})

const governingAgreementReadModelValidator = v.object({
  agreementId: v.id("agreements"),
  buyerId: v.id("users"),
  dealRoomId: v.id("dealRooms"),
  type: agreementType,
  status: agreementStatus,
  accessScope: agreementAccessScope,
  effectiveStartAt: v.optional(v.string()),
  effectiveEndAt: v.optional(v.string()),
  sentAt: v.optional(v.string()),
  signedAt: v.optional(v.string()),
  signedArtifact: v.optional(agreementArtifact),
  replacedById: v.optional(v.id("agreements")),
  supersededAt: v.optional(v.string()),
  canceledAt: v.optional(v.string()),
})

async function loadAgreementRowsForBuyer(
  ctx: QueryCtx,
  buyerId: Id<"users">,
) {
  return await ctx.db
    .query("agreements")
    .withIndex("by_buyerId", (q) => q.eq("buyerId", buyerId))
    .collect()
}

async function recalculateEligibilityForAgreementChange(
  ctx: MutationCtx,
  buyerId: Id<"users">,
  dealRoomId: Id<"dealRooms">,
  actorUserId: Id<"users">,
) {
  await ctx.runMutation(internal.offerEligibility.recalculateEligibilityInternal, {
    buyerId,
    dealRoomId,
    actorUserId,
  })
}

// ═══ Queries ═══

/** Get all agreements for a deal room. */
export const getByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(agreementRecordValidator),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const dealRoom = await ctx.db.get(args.dealRoomId)
    if (!dealRoom) return []
    if (!canReadAgreement(user, dealRoom.buyerId)) return []

    return await ctx.db
      .query("agreements")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect()
  },
})

/** Get the current governing agreement read model for a buyer. */
export const getCurrentGoverning = query({
  args: { buyerId: v.id("users") },
  returns: v.union(governingAgreementReadModelValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    if (!canReadAgreement(user, args.buyerId)) {
      return null
    }

    const agreements = await loadAgreementRowsForBuyer(ctx, args.buyerId)
    return resolveCurrentAgreementReadModel(agreements)
  },
})

/** Internal current-governing read model for other backend flows. */
export const getCurrentGoverningInternal = internalQuery({
  args: { buyerId: v.id("users") },
  returns: v.union(governingAgreementReadModelValidator, v.null()),
  handler: async (ctx, args) => {
    const agreements = await loadAgreementRowsForBuyer(ctx, args.buyerId)
    return resolveCurrentAgreementReadModel(agreements)
  },
})

/** Internal query by ID. */
export const getInternal = internalQuery({
  args: { agreementId: v.id("agreements") },
  returns: v.union(agreementRecordValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agreementId)
  },
})

// ═══ Mutations ═══

/** Create a draft agreement (broker/admin only). */
export const createDraft = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    buyerId: v.id("users"),
    type: agreementType,
    documentStorageId: v.optional(v.id("_storage")),
    effectiveStartAt: v.optional(v.string()),
    effectiveEndAt: v.optional(v.string()),
  },
  returns: v.id("agreements"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    assertCanManageAgreements(user)

    const now = new Date().toISOString()
    const dealRoom = await ctx.db.get(args.dealRoomId)
    if (!dealRoom) throw new Error("Deal room not found")
    if (dealRoom.buyerId !== args.buyerId) {
      throw new Error("Deal room does not belong to this buyer")
    }

    const draft = buildAgreementDraft(user, args, now)
    const id = await ctx.db.insert("agreements", {
      ...draft,
      dealRoomId: args.dealRoomId,
      buyerId: args.buyerId,
      documentStorageId: args.documentStorageId,
      createdByUserId: user._id,
      lastUpdatedByUserId: user._id,
    })

    await ctx.db.insert(
      "auditLog",
      buildAgreementCreatedAudit(user, id, args, now),
    )

    return id
  },
})

/** Send agreement for signing (broker/admin only). */
export const sendForSigning = mutation({
  args: { agreementId: v.id("agreements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    assertCanManageAgreements(user)

    const agreement = await ctx.db.get(args.agreementId)
    if (!agreement) throw new Error("Agreement not found")

    const now = new Date().toISOString()
    await ctx.db.patch(args.agreementId, {
      ...buildAgreementSentPatch(agreement, user, now),
      lastUpdatedByUserId: user._id,
    })

    await ctx.db.insert(
      "auditLog",
      buildAgreementSentAudit(user, agreement, now),
    )

    return null
  },
})

/** Record a signed agreement artifact and effective metadata. */
export const recordSignature = mutation({
  args: {
    agreementId: v.id("agreements"),
    documentStorageId: v.optional(v.id("_storage")),
    signedArtifact: v.optional(agreementArtifactInputValidator),
    effectiveStartAt: v.optional(v.string()),
    effectiveEndAt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    assertCanManageAgreements(user)

    const agreement = await ctx.db.get(args.agreementId)
    if (!agreement) throw new Error("Agreement not found")

    const now = new Date().toISOString()
    await ctx.db.patch(args.agreementId, {
      ...buildAgreementSignedPatch(agreement, user, args, now),
      documentStorageId:
        args.signedArtifact?.storageId ??
        args.documentStorageId ??
        agreement.signedArtifact?.storageId ??
        agreement.documentStorageId,
      lastUpdatedByUserId: user._id,
    })

    await ctx.db.insert(
      "auditLog",
      buildAgreementSignedAudit(user, agreement, args, now),
    )

    await recalculateEligibilityForAgreementChange(
      ctx,
      agreement.buyerId,
      agreement.dealRoomId,
      user._id,
    )

    return null
  },
})

/** Cancel agreement (broker/admin only). */
export const cancelAgreement = mutation({
  args: {
    agreementId: v.id("agreements"),
    reason: v.optional(v.string()),
    effectiveEndAt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    assertCanManageAgreements(user)

    const agreement = await ctx.db.get(args.agreementId)
    if (!agreement) throw new Error("Agreement not found")

    const now = new Date().toISOString()
    await ctx.db.patch(args.agreementId, {
      ...buildAgreementCanceledPatch(agreement, user, args, now),
      lastUpdatedByUserId: user._id,
    })

    await ctx.db.insert(
      "auditLog",
      buildAgreementCanceledAudit(user, agreement, args, now),
    )

    await recalculateEligibilityForAgreementChange(
      ctx,
      agreement.buyerId,
      agreement.dealRoomId,
      user._id,
    )

    return null
  },
})

/** Replace agreement — supersede current and create a replacement draft. */
export const replaceAgreement = mutation({
  args: {
    currentAgreementId: v.id("agreements"),
    newType: agreementType,
    documentStorageId: v.optional(v.id("_storage")),
    effectiveStartAt: v.optional(v.string()),
    effectiveEndAt: v.optional(v.string()),
    reason: v.optional(supersessionReason),
  },
  returns: v.id("agreements"),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    assertCanManageAgreements(user)

    const current = await ctx.db.get(args.currentAgreementId)
    if (!current) throw new Error("Current agreement not found")
    if (current.status !== "signed") {
      throw new Error("Can only replace signed agreements")
    }

    const now = new Date().toISOString()
    const replacementInput = buildReplacementDraftInput(
      current,
      args.newType,
      args.documentStorageId,
    )
    const draft = buildAgreementDraft(
      user,
      {
        ...replacementInput,
        effectiveStartAt: args.effectiveStartAt,
        effectiveEndAt: args.effectiveEndAt,
      },
      now,
    )

    const newId = await ctx.db.insert("agreements", {
      ...draft,
      dealRoomId: current.dealRoomId,
      buyerId: current.buyerId,
      documentStorageId: args.documentStorageId,
      effectiveStartAt: args.effectiveStartAt,
      effectiveEndAt: args.effectiveEndAt,
      createdByUserId: user._id,
      lastUpdatedByUserId: user._id,
    })

    const successor = await ctx.db.get(newId)
    if (!successor) {
      throw new Error("Replacement agreement was not created")
    }

    const reason = args.reason ?? "broker_decision"
    await applySupersessionState(ctx, {
      predecessor: current,
      successor,
      reason,
      actorUserId: user._id,
    })

    await ctx.db.insert(
      "auditLog",
      buildAgreementReplacedAudit(user, current, newId, args.newType, reason, now),
    )

    await recalculateEligibilityForAgreementChange(
      ctx,
      current.buyerId,
      current.dealRoomId,
      user._id,
    )

    return newId
  },
})

/** Issue a signed agreement artifact URL and audit the access attempt. */
export const requestSignedArtifactAccess = mutation({
  args: { agreementId: v.id("agreements") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const agreement = await ctx.db.get(args.agreementId)
    if (!agreement) return null

    const now = new Date().toISOString()
    if (!canReadAgreement(user, agreement.buyerId)) {
      await ctx.db.insert(
        "auditLog",
        buildAgreementAccessAudit(user, agreement, now, "denied"),
      )
      return null
    }

    const artifactStorageId = getSignedArtifactStorageId(agreement)
    if (!artifactStorageId) {
      await ctx.db.insert(
        "auditLog",
        buildAgreementAccessAudit(user, agreement, now, "denied"),
      )
      return null
    }

    await ctx.db.insert(
      "auditLog",
      buildAgreementAccessAudit(user, agreement, now, "granted"),
    )

    return await ctx.storage.getUrl(artifactStorageId)
  },
})
