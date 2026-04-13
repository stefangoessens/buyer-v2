import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAuth, requireRole } from "./lib/session";
import {
  buildCompensationPrompt,
  canTransitionCompensationStatus,
  computeCompensationLedgerSnapshot,
  filterLedgerEntriesForViewer,
} from "./lib/compensationLedger";
import {
  compensationStatus,
  dealStatus,
  feeLedgerAdjustmentTarget,
  feeLedgerEntryType,
  feeLedgerLifecycleEvent,
  feeLedgerSource,
  financingType,
  ledgerReviewState,
  ledgerVisibility,
  offerStatus,
} from "./lib/validators";
import { validateLenderCredit } from "./lib/lenderCreditValidate";

const feeLedgerEntryRow = v.object({
  _id: v.id("feeLedgerEntries"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  entryType: feeLedgerEntryType,
  amount: v.number(),
  description: v.string(),
  source: feeLedgerSource,
  lifecycleEvent: v.optional(feeLedgerLifecycleEvent),
  provenance: v.object({
    actorId: v.optional(v.id("users")),
    triggeredBy: v.optional(v.string()),
    sourceDocument: v.optional(v.string()),
    timestamp: v.string(),
  }),
  offerId: v.optional(v.id("offers")),
  contractId: v.optional(v.id("contracts")),
  dealStatusAtChange: v.optional(dealStatus),
  offerStatusAtChange: v.optional(offerStatus),
  compensationStatusAtChange: v.optional(compensationStatus),
  internalReviewState: v.optional(ledgerReviewState),
  visibility: v.optional(ledgerVisibility),
  financingType: v.optional(financingType),
  ipcLimitPercent: v.optional(v.number()),
  adjustmentTarget: v.optional(feeLedgerAdjustmentTarget),
  createdAt: v.string(),
});

const compensationStatusRow = v.object({
  _id: v.id("compensationStatus"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  status: compensationStatus,
  previousStatus: v.optional(compensationStatus),
  transitionReason: v.optional(v.string()),
  transitionActorId: v.optional(v.id("users")),
  lastLifecycleEvent: v.optional(feeLedgerLifecycleEvent),
  buyerPromptKey: v.optional(v.string()),
  offerId: v.optional(v.id("offers")),
  contractId: v.optional(v.id("contracts")),
  internalReviewState: v.optional(ledgerReviewState),
  sourceDocument: v.optional(v.string()),
  lastTransitionAt: v.string(),
  sellerDisclosedAmount: v.optional(v.number()),
  negotiatedAmount: v.optional(v.number()),
  buyerPaidAmount: v.optional(v.number()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const buyerPromptValidator = v.object({
  key: v.string(),
  title: v.string(),
  body: v.string(),
});

const ledgerSummaryValidator = v.object({
  dealRoomId: v.id("dealRooms"),
  expectedBuyerFee: v.number(),
  sellerPaidAmount: v.number(),
  buyerPaidAmount: v.number(),
  projectedClosingCredit: v.number(),
  actualClosingCredit: v.union(v.number(), v.null()),
  remainingFeeBalance: v.number(),
  projectedBuyerCashToClose: v.number(),
  entryCount: v.number(),
});

const buyerLedgerEntryRow = v.object({
  _id: v.id("feeLedgerEntries"),
  entryType: feeLedgerEntryType,
  amount: v.number(),
  description: v.string(),
  source: feeLedgerSource,
  lifecycleEvent: v.optional(feeLedgerLifecycleEvent),
  createdAt: v.string(),
});

const buyerLedgerView = v.object({
  dealRoomId: v.id("dealRooms"),
  status: compensationStatus,
  summary: ledgerSummaryValidator,
  prompt: buyerPromptValidator,
  entries: v.array(buyerLedgerEntryRow),
});

const internalLedgerView = v.object({
  dealRoomId: v.id("dealRooms"),
  status: v.union(compensationStatusRow, v.null()),
  summary: ledgerSummaryValidator,
  prompt: buyerPromptValidator,
  entries: v.array(feeLedgerEntryRow),
});

function toSnapshotEntries(entries: Array<Doc<"feeLedgerEntries">>) {
  return entries.map((entry) => ({
    entryType: entry.entryType,
    amount: entry.amount,
    createdAt: entry.createdAt,
    adjustmentTarget: entry.adjustmentTarget,
  }));
}

function toBuyerViewEntry(entry: Doc<"feeLedgerEntries">) {
  return {
    _id: entry._id,
    entryType: entry.entryType,
    amount: entry.amount,
    description: entry.description,
    source: entry.source,
    lifecycleEvent: entry.lifecycleEvent,
    createdAt: entry.createdAt,
  };
}

function toBuyerSafeLedgerEntry(entry: Doc<"feeLedgerEntries">) {
  return {
    _id: entry._id,
    _creationTime: entry._creationTime,
    dealRoomId: entry.dealRoomId,
    entryType: entry.entryType,
    amount: entry.amount,
    description: entry.description,
    source: entry.source,
    lifecycleEvent: entry.lifecycleEvent,
    provenance: {
      timestamp: entry.provenance.timestamp,
    },
    createdAt: entry.createdAt,
  };
}

function toBuyerSafeCompensationStatus(row: Doc<"compensationStatus">) {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    dealRoomId: row.dealRoomId,
    status: row.status,
    lastLifecycleEvent: row.lastLifecycleEvent,
    buyerPromptKey: row.buyerPromptKey,
    lastTransitionAt: row.lastTransitionAt,
    sellerDisclosedAmount: row.sellerDisclosedAmount,
    negotiatedAmount: row.negotiatedAmount,
    buyerPaidAmount: row.buyerPaidAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadDealRoom(ctx: { db: { get: (id: Id<"dealRooms">) => Promise<Doc<"dealRooms"> | null> } }, dealRoomId: Id<"dealRooms">) {
  return await ctx.db.get(dealRoomId);
}

async function ensureViewerCanReadDealRoom(
  ctx: { db: { get: (id: Id<"dealRooms">) => Promise<Doc<"dealRooms"> | null> } },
  user: Doc<"users">,
  dealRoomId: Id<"dealRooms">,
) {
  const dealRoom = await loadDealRoom(ctx, dealRoomId);
  if (!dealRoom) return null;
  if (user.role === "buyer" && dealRoom.buyerId !== user._id) return null;
  return dealRoom;
}

async function getEntriesForDealRoom(
  ctx: { db: { query: (table: "feeLedgerEntries") => any } },
  dealRoomId: Id<"dealRooms">,
) {
  return (await ctx.db
    .query("feeLedgerEntries")
    .withIndex("by_dealRoomId", (q: any) => q.eq("dealRoomId", dealRoomId))
    .collect()) as Array<Doc<"feeLedgerEntries">>;
}

async function getCompensationStatusRowInternal(
  ctx: { db: { query: (table: "compensationStatus") => any } },
  dealRoomId: Id<"dealRooms">,
) {
  return (await ctx.db
    .query("compensationStatus")
    .withIndex("by_dealRoomId", (q: any) => q.eq("dealRoomId", dealRoomId))
    .unique()) as Doc<"compensationStatus"> | null;
}

async function ensureCompensationStatusRow(
  ctx: { db: { insert: (table: "compensationStatus", value: any) => Promise<Id<"compensationStatus">>; get: (id: Id<"compensationStatus">) => Promise<Doc<"compensationStatus"> | null> } } & { db: { query: (table: "compensationStatus") => any } },
  dealRoomId: Id<"dealRooms">,
  lifecycleEvent: "deal_room_created" | "manual_override" | "showing_coordination_started" = "deal_room_created",
) {
  const existing = await getCompensationStatusRowInternal(ctx, dealRoomId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const id = await ctx.db.insert("compensationStatus", {
    dealRoomId,
    status: "unknown",
    lastLifecycleEvent: lifecycleEvent,
    buyerPromptKey: "compensation_unknown",
    internalReviewState: "not_required",
    lastTransitionAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const inserted = await ctx.db.get(id);
  if (!inserted) throw new Error("Failed to initialize compensation status");
  return inserted;
}

async function resolveFinancingContext(
  ctx: { db: { get: (id: Id<"properties">) => Promise<Doc<"properties"> | null>; query: (table: "buyerProfiles") => any } },
  args: {
    dealRoom: Doc<"dealRooms">;
    financingTypeValue?: Doc<"buyerProfiles">["financingType"];
    ltvRatio?: number;
    purchasePrice?: number;
  },
) {
  const property = await ctx.db.get(args.dealRoom.propertyId);
  const buyerProfile = (await ctx.db
    .query("buyerProfiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", args.dealRoom.buyerId))
    .unique()) as Doc<"buyerProfiles"> | null;

  const financingTypeValue =
    args.financingTypeValue ?? buyerProfile?.financingType ?? undefined;
  const purchasePrice = args.purchasePrice ?? property?.listPrice ?? undefined;
  const derivedLtv =
    args.ltvRatio ??
    (purchasePrice && buyerProfile?.preApprovalAmount
      ? Math.min(1, buyerProfile.preApprovalAmount / purchasePrice)
      : undefined);

  return {
    financingTypeValue,
    purchasePrice,
    ltvRatio: derivedLtv,
  };
}

async function persistValidationIfNeeded(
  ctx: any,
  input: {
    dealRoomId: Id<"dealRooms">;
    offerId?: Id<"offers">;
    actorUserId?: Id<"users">;
    sourceDocument?: string;
    financingTypeValue?: "cash" | "conventional" | "fha" | "va" | "other";
    purchasePrice?: number;
    ltvRatio?: number;
    projectedSellerCredit: number;
    projectedBuyerCredit: number;
    projectedClosingCredit: number;
  },
) {
  if (!input.financingTypeValue || !input.purchasePrice || input.purchasePrice <= 0) {
    return null;
  }

  const result = validateLenderCredit({
    financingType: input.financingTypeValue,
    purchasePrice: input.purchasePrice,
    ltvRatio: input.ltvRatio,
    projectedSellerCredit: input.projectedSellerCredit,
    projectedBuyerCredit: input.projectedBuyerCredit,
    projectedClosingCredit: input.projectedClosingCredit,
  });

  if (result.outcome === "invalid") {
    throw new Error(result.blockingReasonMessage ?? "IPC limit exceeded");
  }

  await ctx.runMutation(internal.lenderCreditValidation.computeAndPersistInternal, {
    dealRoomId: input.dealRoomId,
    offerId: input.offerId,
    financingType: input.financingTypeValue,
    purchasePrice: input.purchasePrice,
    ltvRatio: input.ltvRatio,
    projectedSellerCredit: input.projectedSellerCredit,
    projectedBuyerCredit: input.projectedBuyerCredit,
    projectedClosingCredit: input.projectedClosingCredit,
    actorUserId: input.actorUserId,
    sourceDocument: input.sourceDocument,
  });

  return result;
}

async function appendLedgerEntry(
  ctx: any,
  args: {
    dealRoomId: Id<"dealRooms">;
    entryType: Doc<"feeLedgerEntries">["entryType"];
    amount: number;
    description: string;
    source: Doc<"feeLedgerEntries">["source"];
    lifecycleEvent?: Doc<"feeLedgerEntries">["lifecycleEvent"];
    actorUserId?: Id<"users">;
    offerId?: Id<"offers">;
    contractId?: Id<"contracts">;
    dealStatusAtChange?: Doc<"feeLedgerEntries">["dealStatusAtChange"];
    offerStatusAtChange?: Doc<"feeLedgerEntries">["offerStatusAtChange"];
    compensationStatusAtChange?: Doc<"feeLedgerEntries">["compensationStatusAtChange"];
    internalReviewState?: Doc<"feeLedgerEntries">["internalReviewState"];
    visibility?: Doc<"feeLedgerEntries">["visibility"];
    financingTypeValue?: Doc<"feeLedgerEntries">["financingType"];
    ipcLimitPercent?: number;
    adjustmentTarget?: Doc<"feeLedgerEntries">["adjustmentTarget"];
    triggeredBy?: string;
    sourceDocument?: string;
  },
) {
  const now = new Date().toISOString();
  const id = await ctx.db.insert("feeLedgerEntries", {
    dealRoomId: args.dealRoomId,
    entryType: args.entryType,
    amount: args.amount,
    description: args.description,
    source: args.source,
    lifecycleEvent: args.lifecycleEvent,
    provenance: {
      actorId: args.actorUserId,
      triggeredBy: args.triggeredBy,
      sourceDocument: args.sourceDocument,
      timestamp: now,
    },
    offerId: args.offerId,
    contractId: args.contractId,
    dealStatusAtChange: args.dealStatusAtChange,
    offerStatusAtChange: args.offerStatusAtChange,
    compensationStatusAtChange: args.compensationStatusAtChange,
    internalReviewState: args.internalReviewState ?? "not_required",
    visibility: args.visibility ?? "buyer_visible",
    financingType: args.financingTypeValue,
    ipcLimitPercent: args.ipcLimitPercent,
    adjustmentTarget: args.adjustmentTarget,
    createdAt: now,
  });

  await ctx.db.insert("auditLog", {
    userId: args.actorUserId,
    action: "fee_ledger_entry_created",
    entityType: "feeLedgerEntries",
    entityId: id,
    details: JSON.stringify({
      dealRoomId: args.dealRoomId,
      entryType: args.entryType,
      amount: args.amount,
      source: args.source,
      lifecycleEvent: args.lifecycleEvent ?? null,
      compensationStatusAtChange: args.compensationStatusAtChange ?? null,
    }),
    timestamp: now,
  });

  return id;
}

async function patchCompensationStatusRow(
  ctx: any,
  existing: Doc<"compensationStatus">,
  patch: Partial<Doc<"compensationStatus">>,
  actorUserId?: Id<"users">,
) {
  const now = new Date().toISOString();
  await ctx.db.patch(existing._id, {
    ...patch,
    updatedAt: now,
  });

  if (patch.status && patch.status !== existing.status) {
    await ctx.db.insert("auditLog", {
      userId: actorUserId,
      action: "compensation_status_transitioned",
      entityType: "compensationStatus",
      entityId: existing._id,
      details: JSON.stringify({
        dealRoomId: existing.dealRoomId,
        from: existing.status,
        to: patch.status,
        lifecycleEvent: patch.lastLifecycleEvent ?? existing.lastLifecycleEvent ?? null,
        offerId: patch.offerId ?? existing.offerId ?? null,
        contractId: patch.contractId ?? existing.contractId ?? null,
      }),
      timestamp: now,
    });
  }
}

async function recomputePromptKey(
  ctx: any,
  statusRow: Doc<"compensationStatus">,
) {
  const entries = await getEntriesForDealRoom(ctx, statusRow.dealRoomId);
  const snapshot = computeCompensationLedgerSnapshot(toSnapshotEntries(entries));
  return buildCompensationPrompt({
    status: statusRow.status,
    snapshot,
    lastLifecycleEvent: statusRow.lastLifecycleEvent,
  }).key;
}

async function applyLifecycleEvent(
  ctx: any,
  args: {
    dealRoomId: Id<"dealRooms">;
    lifecycleEvent: Doc<"compensationStatus">["lastLifecycleEvent"];
    actorUserId?: Id<"users">;
    reason?: string;
    sourceDocument?: string;
    offerId?: Id<"offers">;
    contractId?: Id<"contracts">;
    expectedBuyerFee?: number;
    sellerDisclosedAmount?: number;
    negotiatedAmount?: number;
    buyerPaidAmount?: number;
    projectedClosingCredit?: number;
    financingTypeValue?: Doc<"buyerProfiles">["financingType"];
    ltvRatio?: number;
    purchasePrice?: number;
    internalReviewState?: Doc<"compensationStatus">["internalReviewState"];
    dealStatusAtChange?: Doc<"feeLedgerEntries">["dealStatusAtChange"];
    offerStatusAtChange?: Doc<"feeLedgerEntries">["offerStatusAtChange"];
    ipcProjectedSellerCredit?: number;
    ipcProjectedBuyerCredit?: number;
  },
) {
  const dealRoom = await loadDealRoom(ctx, args.dealRoomId);
  if (!dealRoom) throw new Error("Deal room not found");

  const existing = await ensureCompensationStatusRow(
    ctx,
    args.dealRoomId,
    args.lifecycleEvent === "showing_coordination_started"
      ? "showing_coordination_started"
      : "manual_override",
  );

  let nextStatus = existing.status;
  if (args.lifecycleEvent === "listing_agent_confirmed") {
    if (args.sellerDisclosedAmount === undefined) {
      throw new Error("sellerDisclosedAmount is required for listing_agent_confirmed");
    }
    nextStatus = "seller_disclosed_off_mls";
  } else if (args.lifecycleEvent === "offer_terms_submitted") {
    if (args.negotiatedAmount === undefined) {
      throw new Error("negotiatedAmount is required for offer_terms_submitted");
    }
    nextStatus = "negotiated_in_offer";
  } else if (
    args.lifecycleEvent === "contract_executed" &&
    args.buyerPaidAmount !== undefined
  ) {
    nextStatus = "buyer_paid";
  }

  if (nextStatus !== existing.status && !canTransitionCompensationStatus(existing.status, nextStatus)) {
    throw new Error(
      `Invalid transition: ${existing.status} -> ${nextStatus}`,
    );
  }

  const financingContext = await resolveFinancingContext(ctx, {
    dealRoom,
    financingTypeValue: args.financingTypeValue,
    ltvRatio: args.ltvRatio,
    purchasePrice: args.purchasePrice,
  });

  if (args.expectedBuyerFee !== undefined) {
    await appendLedgerEntry(ctx, {
      dealRoomId: args.dealRoomId,
      entryType: "expected_buyer_fee",
      amount: args.expectedBuyerFee,
      description: "Expected buyer-broker fee",
      source:
        args.lifecycleEvent === "listing_agent_confirmed"
          ? "listing_agent"
          : args.lifecycleEvent === "offer_terms_submitted"
            ? "offer_term"
            : args.lifecycleEvent === "contract_executed"
              ? "contract"
              : "manual",
      lifecycleEvent: args.lifecycleEvent,
      actorUserId: args.actorUserId,
      offerId: args.offerId,
      contractId: args.contractId,
      dealStatusAtChange: args.dealStatusAtChange ?? dealRoom.status,
      offerStatusAtChange: args.offerStatusAtChange,
      compensationStatusAtChange: nextStatus,
      internalReviewState: args.internalReviewState,
      sourceDocument: args.sourceDocument,
      financingTypeValue: financingContext.financingTypeValue,
      triggeredBy: "ledger.recordLifecycleEventInternal",
    });
  }

  if (args.sellerDisclosedAmount !== undefined || args.negotiatedAmount !== undefined) {
    const sellerPaidAmount = args.sellerDisclosedAmount ?? args.negotiatedAmount ?? 0;
    await appendLedgerEntry(ctx, {
      dealRoomId: args.dealRoomId,
      entryType: "seller_paid_amount",
      amount: sellerPaidAmount,
      description:
        args.lifecycleEvent === "listing_agent_confirmed"
          ? "Seller-paid amount confirmed by listing side"
          : "Seller-paid amount from negotiated offer terms",
      source:
        args.lifecycleEvent === "listing_agent_confirmed"
          ? "listing_agent"
          : "offer_term",
      lifecycleEvent: args.lifecycleEvent,
      actorUserId: args.actorUserId,
      offerId: args.offerId,
      contractId: args.contractId,
      dealStatusAtChange: args.dealStatusAtChange ?? dealRoom.status,
      offerStatusAtChange: args.offerStatusAtChange,
      compensationStatusAtChange: nextStatus,
      internalReviewState: args.internalReviewState,
      sourceDocument: args.sourceDocument,
      financingTypeValue: financingContext.financingTypeValue,
      triggeredBy: "ledger.recordLifecycleEventInternal",
    });
  }

  if (args.projectedClosingCredit !== undefined) {
    const previewEntries = [
      ...(await getEntriesForDealRoom(ctx, args.dealRoomId)),
      {
        entryType: "projected_closing_credit" as const,
        amount: args.projectedClosingCredit,
        createdAt: new Date().toISOString(),
      },
    ];
    const previewSnapshot = computeCompensationLedgerSnapshot(toSnapshotEntries(previewEntries as Array<any>));
    const validation = await persistValidationIfNeeded(ctx, {
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      actorUserId: args.actorUserId,
      sourceDocument: args.sourceDocument,
      financingTypeValue: financingContext.financingTypeValue,
      purchasePrice: financingContext.purchasePrice,
      ltvRatio: financingContext.ltvRatio,
      projectedSellerCredit: args.ipcProjectedSellerCredit ?? 0,
      projectedBuyerCredit: args.ipcProjectedBuyerCredit ?? 0,
      projectedClosingCredit: previewSnapshot.projectedClosingCredit,
    });

    await appendLedgerEntry(ctx, {
      dealRoomId: args.dealRoomId,
      entryType: "projected_closing_credit",
      amount: args.projectedClosingCredit,
      description: "Projected buyer closing credit",
      source:
        args.lifecycleEvent === "offer_terms_submitted" ? "offer_term" : "manual",
      lifecycleEvent: args.lifecycleEvent,
      actorUserId: args.actorUserId,
      offerId: args.offerId,
      contractId: args.contractId,
      dealStatusAtChange: args.dealStatusAtChange ?? dealRoom.status,
      offerStatusAtChange: args.offerStatusAtChange,
      compensationStatusAtChange: nextStatus,
      internalReviewState: args.internalReviewState,
      sourceDocument: args.sourceDocument,
      financingTypeValue: financingContext.financingTypeValue,
      ipcLimitPercent: validation?.ipcLimitPercent,
      triggeredBy: "ledger.recordLifecycleEventInternal",
    });
  }

  if (args.buyerPaidAmount !== undefined) {
    await appendLedgerEntry(ctx, {
      dealRoomId: args.dealRoomId,
      entryType: "buyer_paid_amount",
      amount: args.buyerPaidAmount,
      description: "Buyer-paid compensation amount",
      source: args.lifecycleEvent === "contract_executed" ? "contract" : "manual",
      lifecycleEvent: args.lifecycleEvent,
      actorUserId: args.actorUserId,
      offerId: args.offerId,
      contractId: args.contractId,
      dealStatusAtChange: args.dealStatusAtChange ?? dealRoom.status,
      offerStatusAtChange: args.offerStatusAtChange,
      compensationStatusAtChange: nextStatus,
      internalReviewState: args.internalReviewState,
      sourceDocument: args.sourceDocument,
      triggeredBy: "ledger.recordLifecycleEventInternal",
    });
  }

  await patchCompensationStatusRow(
    ctx,
    existing,
    {
      status: nextStatus,
      previousStatus: nextStatus !== existing.status ? existing.status : existing.previousStatus,
      transitionReason: args.reason ?? existing.transitionReason,
      transitionActorId: args.actorUserId ?? existing.transitionActorId,
      lastLifecycleEvent: args.lifecycleEvent,
      offerId: args.offerId ?? existing.offerId,
      contractId: args.contractId ?? existing.contractId,
      internalReviewState: args.internalReviewState ?? existing.internalReviewState ?? "not_required",
      sourceDocument: args.sourceDocument ?? existing.sourceDocument,
      lastTransitionAt: new Date().toISOString(),
      sellerDisclosedAmount:
        args.sellerDisclosedAmount ?? existing.sellerDisclosedAmount,
      negotiatedAmount: args.negotiatedAmount ?? existing.negotiatedAmount,
      buyerPaidAmount: args.buyerPaidAmount ?? existing.buyerPaidAmount,
    },
    args.actorUserId,
  );

  const updated = await getCompensationStatusRowInternal(ctx, args.dealRoomId);
  if (!updated) throw new Error("Failed to reload compensation status");
  const buyerPromptKey = await recomputePromptKey(ctx, updated);
  await ctx.db.patch(updated._id, { buyerPromptKey, updatedAt: new Date().toISOString() });

  const finalRow = await getCompensationStatusRowInternal(ctx, args.dealRoomId);
  if (!finalRow) throw new Error("Failed to reload compensation status");
  return finalRow;
}

export const getByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(feeLedgerEntryRow),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ensureViewerCanReadDealRoom(ctx, user, args.dealRoomId);
    if (!dealRoom) return [];

    const entries = filterLedgerEntriesForViewer(
      await getEntriesForDealRoom(ctx, args.dealRoomId),
      user.role,
    );
    if (user.role === "buyer") {
      return entries.map(toBuyerSafeLedgerEntry);
    }
    return entries;
  },
});

export const getLedgerSummary = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: ledgerSummaryValidator,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ensureViewerCanReadDealRoom(ctx, user, args.dealRoomId);
    if (!dealRoom) {
      return {
        dealRoomId: args.dealRoomId,
        expectedBuyerFee: 0,
        sellerPaidAmount: 0,
        buyerPaidAmount: 0,
        projectedClosingCredit: 0,
        actualClosingCredit: null,
        remainingFeeBalance: 0,
        projectedBuyerCashToClose: 0,
        entryCount: 0,
      };
    }

    const entries = filterLedgerEntriesForViewer(
      await getEntriesForDealRoom(ctx, args.dealRoomId),
      user.role,
    );
    const snapshot = computeCompensationLedgerSnapshot(toSnapshotEntries(entries));
    return {
      dealRoomId: args.dealRoomId,
      ...snapshot,
      entryCount: entries.length,
    };
  },
});

export const getCompensationStatus = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(compensationStatusRow, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ensureViewerCanReadDealRoom(ctx, user, args.dealRoomId);
    if (!dealRoom) return null;
    const statusRow = await getCompensationStatusRowInternal(ctx, args.dealRoomId);
    if (!statusRow || user.role !== "buyer") return statusRow;
    return toBuyerSafeCompensationStatus(statusRow);
  },
});

export const getBuyerView = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(buyerLedgerView, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ensureViewerCanReadDealRoom(ctx, user, args.dealRoomId);
    if (!dealRoom) return null;

    const statusRow = await getCompensationStatusRowInternal(ctx, args.dealRoomId);
    const entries = filterLedgerEntriesForViewer(
      await getEntriesForDealRoom(ctx, args.dealRoomId),
      "buyer",
    );
    const snapshot = computeCompensationLedgerSnapshot(toSnapshotEntries(entries));
    const summary = {
      dealRoomId: args.dealRoomId,
      ...snapshot,
      entryCount: entries.length,
    };
    const prompt = buildCompensationPrompt({
      status: statusRow?.status ?? "unknown",
      snapshot,
      lastLifecycleEvent: statusRow?.lastLifecycleEvent,
    });

    return {
      dealRoomId: args.dealRoomId,
      status: statusRow?.status ?? "unknown",
      summary,
      prompt,
      entries: entries.map(toBuyerViewEntry),
    };
  },
});

export const getInternalView = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(internalLedgerView, v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") return null;

    const statusRow = await getCompensationStatusRowInternal(ctx, args.dealRoomId);
    const entries = await getEntriesForDealRoom(ctx, args.dealRoomId);
    const snapshot = computeCompensationLedgerSnapshot(toSnapshotEntries(entries));
    const summary = {
      dealRoomId: args.dealRoomId,
      ...snapshot,
      entryCount: entries.length,
    };
    const prompt = buildCompensationPrompt({
      status: statusRow?.status ?? "unknown",
      snapshot,
      lastLifecycleEvent: statusRow?.lastLifecycleEvent,
    });

    return {
      dealRoomId: args.dealRoomId,
      status: statusRow,
      summary,
      prompt,
      entries,
    };
  },
});

export const getCompensationStatusInternal = internalQuery({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.union(compensationStatusRow, v.null()),
  handler: async (ctx, args) => {
    return await getCompensationStatusRowInternal(ctx, args.dealRoomId);
  },
});

export const createEntry = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    entryType: feeLedgerEntryType,
    amount: v.number(),
    description: v.string(),
    source: feeLedgerSource,
    lifecycleEvent: v.optional(feeLedgerLifecycleEvent),
    offerId: v.optional(v.id("offers")),
    contractId: v.optional(v.id("contracts")),
    financingType: v.optional(financingType),
    ltvRatio: v.optional(v.number()),
    purchasePrice: v.optional(v.number()),
    sourceDocument: v.optional(v.string()),
    dealStatusAtChange: v.optional(dealStatus),
    offerStatusAtChange: v.optional(offerStatus),
    compensationStatusAtChange: v.optional(compensationStatus),
    internalReviewState: v.optional(ledgerReviewState),
    visibility: v.optional(ledgerVisibility),
    adjustmentTarget: v.optional(feeLedgerAdjustmentTarget),
    ipcProjectedSellerCredit: v.optional(v.number()),
    ipcProjectedBuyerCredit: v.optional(v.number()),
  },
  returns: v.id("feeLedgerEntries"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const dealRoom = await loadDealRoom(ctx, args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const financingContext = await resolveFinancingContext(ctx, {
      dealRoom,
      financingTypeValue: args.financingType,
      ltvRatio: args.ltvRatio,
      purchasePrice: args.purchasePrice,
    });

    let ipcLimitPercent: number | undefined;
    const projectedCreditEntryTypes = new Set([
      "buyer_credit",
      "closing_credit_projection",
      "projected_closing_credit",
    ]);

    if (projectedCreditEntryTypes.has(args.entryType)) {
      const previewEntries = [
        ...(await getEntriesForDealRoom(ctx, args.dealRoomId)),
        {
          entryType: args.entryType,
          amount: args.amount,
          createdAt: new Date().toISOString(),
          adjustmentTarget: args.adjustmentTarget,
        },
      ];
      const previewSnapshot = computeCompensationLedgerSnapshot(
        toSnapshotEntries(previewEntries as Array<any>),
      );
      const validation = await persistValidationIfNeeded(ctx, {
        dealRoomId: args.dealRoomId,
        offerId: args.offerId,
        actorUserId: user._id,
        sourceDocument: args.sourceDocument,
        financingTypeValue: financingContext.financingTypeValue,
        purchasePrice: financingContext.purchasePrice,
        ltvRatio: financingContext.ltvRatio,
        projectedSellerCredit: args.ipcProjectedSellerCredit ?? 0,
        projectedBuyerCredit: args.ipcProjectedBuyerCredit ?? 0,
        projectedClosingCredit: previewSnapshot.projectedClosingCredit,
      });
      ipcLimitPercent = validation?.ipcLimitPercent;
    }

    return await appendLedgerEntry(ctx, {
      dealRoomId: args.dealRoomId,
      entryType: args.entryType,
      amount: args.amount,
      description: args.description,
      source: args.source,
      lifecycleEvent: args.lifecycleEvent,
      actorUserId: user._id,
      offerId: args.offerId,
      contractId: args.contractId,
      dealStatusAtChange: args.dealStatusAtChange ?? dealRoom.status,
      offerStatusAtChange: args.offerStatusAtChange,
      compensationStatusAtChange: args.compensationStatusAtChange,
      internalReviewState: args.internalReviewState,
      visibility: args.visibility,
      financingTypeValue: financingContext.financingTypeValue,
      ipcLimitPercent,
      adjustmentTarget: args.adjustmentTarget,
      triggeredBy: "ledger.createEntry",
      sourceDocument: args.sourceDocument,
    });
  },
});

export const transitionCompensationStatus = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    newStatus: compensationStatus,
    reason: v.optional(v.string()),
    sellerDisclosedAmount: v.optional(v.number()),
    negotiatedAmount: v.optional(v.number()),
    buyerPaidAmount: v.optional(v.number()),
    expectedBuyerFee: v.optional(v.number()),
    projectedClosingCredit: v.optional(v.number()),
    offerId: v.optional(v.id("offers")),
    contractId: v.optional(v.id("contracts")),
    sourceDocument: v.optional(v.string()),
    financingType: v.optional(financingType),
    ltvRatio: v.optional(v.number()),
    purchasePrice: v.optional(v.number()),
    internalReviewState: v.optional(ledgerReviewState),
    offerStatusAtChange: v.optional(offerStatus),
    ipcProjectedSellerCredit: v.optional(v.number()),
    ipcProjectedBuyerCredit: v.optional(v.number()),
  },
  returns: compensationStatusRow,
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");

    if (
      args.newStatus === "seller_disclosed_off_mls" &&
      args.sellerDisclosedAmount === undefined
    ) {
      throw new Error("sellerDisclosedAmount is required for seller_disclosed_off_mls");
    }
    if (
      args.newStatus === "negotiated_in_offer" &&
      args.negotiatedAmount === undefined
    ) {
      throw new Error("negotiatedAmount is required for negotiated_in_offer");
    }
    if (args.newStatus === "buyer_paid" && args.buyerPaidAmount === undefined) {
      throw new Error("buyerPaidAmount is required for buyer_paid");
    }

    let lifecycleEvent: Doc<"compensationStatus">["lastLifecycleEvent"] = "manual_override";
    if (args.newStatus === "seller_disclosed_off_mls") {
      lifecycleEvent = "listing_agent_confirmed";
    } else if (args.newStatus === "negotiated_in_offer") {
      lifecycleEvent = "offer_terms_submitted";
    } else if (args.newStatus === "buyer_paid") {
      lifecycleEvent = "contract_executed";
    }

    const row = await applyLifecycleEvent(ctx, {
      dealRoomId: args.dealRoomId,
      lifecycleEvent,
      actorUserId: user._id,
      reason: args.reason,
      sourceDocument: args.sourceDocument,
      offerId: args.offerId,
      contractId: args.contractId,
      expectedBuyerFee: args.expectedBuyerFee,
      sellerDisclosedAmount: args.sellerDisclosedAmount,
      negotiatedAmount: args.negotiatedAmount,
      buyerPaidAmount: args.buyerPaidAmount,
      projectedClosingCredit: args.projectedClosingCredit,
      financingTypeValue: args.financingType,
      ltvRatio: args.ltvRatio,
      purchasePrice: args.purchasePrice,
      internalReviewState: args.internalReviewState,
      offerStatusAtChange: args.offerStatusAtChange,
      ipcProjectedSellerCredit: args.ipcProjectedSellerCredit,
      ipcProjectedBuyerCredit: args.ipcProjectedBuyerCredit,
    });

    if (row.status !== args.newStatus) {
      throw new Error(`Expected status ${args.newStatus} but ledger remained at ${row.status}`);
    }

    return row;
  },
});

export const initializeCompensationStatus = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: compensationStatusRow,
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const row = await ensureCompensationStatusRow(ctx as any, args.dealRoomId);
    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "compensation_status_initialized",
      entityType: "compensationStatus",
      entityId: row._id,
      details: JSON.stringify({ dealRoomId: args.dealRoomId }),
      timestamp: new Date().toISOString(),
    });
    return row;
  },
});

export const recordListingAgentCompensation = mutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    sellerDisclosedAmount: v.number(),
    expectedBuyerFee: v.optional(v.number()),
    projectedClosingCredit: v.optional(v.number()),
    sourceDocument: v.optional(v.string()),
    internalReviewState: v.optional(ledgerReviewState),
    financingType: v.optional(financingType),
    ltvRatio: v.optional(v.number()),
    purchasePrice: v.optional(v.number()),
    ipcProjectedSellerCredit: v.optional(v.number()),
    ipcProjectedBuyerCredit: v.optional(v.number()),
  },
  returns: compensationStatusRow,
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    return await applyLifecycleEvent(ctx, {
      dealRoomId: args.dealRoomId,
      lifecycleEvent: "listing_agent_confirmed",
      actorUserId: user._id,
      sourceDocument: args.sourceDocument,
      sellerDisclosedAmount: args.sellerDisclosedAmount,
      expectedBuyerFee: args.expectedBuyerFee ?? args.sellerDisclosedAmount,
      projectedClosingCredit: args.projectedClosingCredit,
      financingTypeValue: args.financingType,
      ltvRatio: args.ltvRatio,
      purchasePrice: args.purchasePrice,
      internalReviewState: args.internalReviewState,
      ipcProjectedSellerCredit: args.ipcProjectedSellerCredit,
      ipcProjectedBuyerCredit: args.ipcProjectedBuyerCredit,
    });
  },
});

export const recordLifecycleEventInternal = internalMutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    lifecycleEvent: feeLedgerLifecycleEvent,
    actorUserId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
    sourceDocument: v.optional(v.string()),
    offerId: v.optional(v.id("offers")),
    contractId: v.optional(v.id("contracts")),
    expectedBuyerFee: v.optional(v.number()),
    sellerDisclosedAmount: v.optional(v.number()),
    negotiatedAmount: v.optional(v.number()),
    buyerPaidAmount: v.optional(v.number()),
    projectedClosingCredit: v.optional(v.number()),
    financingType: v.optional(financingType),
    ltvRatio: v.optional(v.number()),
    purchasePrice: v.optional(v.number()),
    internalReviewState: v.optional(ledgerReviewState),
    dealStatusAtChange: v.optional(dealStatus),
    offerStatusAtChange: v.optional(offerStatus),
    ipcProjectedSellerCredit: v.optional(v.number()),
    ipcProjectedBuyerCredit: v.optional(v.number()),
  },
  returns: compensationStatusRow,
  handler: async (ctx, args) => {
    return await applyLifecycleEvent(ctx, {
      dealRoomId: args.dealRoomId,
      lifecycleEvent: args.lifecycleEvent,
      actorUserId: args.actorUserId,
      reason: args.reason,
      sourceDocument: args.sourceDocument,
      offerId: args.offerId,
      contractId: args.contractId,
      expectedBuyerFee: args.expectedBuyerFee,
      sellerDisclosedAmount: args.sellerDisclosedAmount,
      negotiatedAmount: args.negotiatedAmount,
      buyerPaidAmount: args.buyerPaidAmount,
      projectedClosingCredit: args.projectedClosingCredit,
      financingTypeValue: args.financingType,
      ltvRatio: args.ltvRatio,
      purchasePrice: args.purchasePrice,
      internalReviewState: args.internalReviewState,
      dealStatusAtChange: args.dealStatusAtChange,
      offerStatusAtChange: args.offerStatusAtChange,
      ipcProjectedSellerCredit: args.ipcProjectedSellerCredit,
      ipcProjectedBuyerCredit: args.ipcProjectedBuyerCredit,
    });
  },
});
