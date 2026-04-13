import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireAuth, sessionUserValidator } from "./lib/session";
import {
  contractAdapterRunStatus,
  contractFormKey,
  contractHandoffStatus,
  contractSignatureEventType,
} from "./lib/validators";
import {
  FLORIDA_FAR_BAR_TEMPLATE_KEY,
  FLORIDA_FAR_BAR_TEMPLATE_VERSION,
  mapApprovedOfferToFloridaContract,
  type ApprovedOfferContractSource,
  type FloridaContractFieldMap,
} from "@buyer-v2/shared/contracts";
import {
  createSabalSignatureEnvelope,
  normalizeSabalWebhookPayload,
  readContractProviderConfig,
  storeSignedPdfFromWebhook,
  submitToFormSimplicity,
  verifySabalWebhookSignature,
  type NormalizedSabalWebhookEvent,
} from "./lib/contractProviders";

const adapterWarningValidator = v.object({
  code: v.string(),
  message: v.string(),
});

const adapterMissingFieldValidator = v.object({
  field: v.string(),
  label: v.string(),
  reason: v.string(),
});

const fieldMapValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);

const handoffResultValidator = v.object({
  runId: v.id("contractAdapterRuns"),
  contractId: v.union(v.id("contracts"), v.null()),
  handoffStatus: contractHandoffStatus,
  missingFields: v.array(adapterMissingFieldValidator),
  warnings: v.array(adapterWarningValidator),
  providerTransactionId: v.optional(v.string()),
  signatureEnvelopeId: v.optional(v.string()),
});

const webhookEventValidator = v.object({
  contractId: v.optional(v.string()),
  envelopeId: v.optional(v.string()),
  providerEventId: v.optional(v.string()),
  event: contractSignatureEventType,
  signerEmail: v.optional(v.string()),
  signedPdfUrl: v.optional(v.string()),
  signedPdfBase64: v.optional(v.string()),
  metadata: v.optional(v.record(v.string(), v.any())),
});

type ContractContext = {
  dealRoom: Doc<"dealRooms">;
  offer: Doc<"offers">;
  property: Doc<"properties">;
  buyer: Doc<"users">;
  buyerProfile: Doc<"buyerProfiles"> | null;
};

type ContractHandoffResult = {
  runId: Id<"contractAdapterRuns">;
  contractId: Id<"contracts"> | null;
  handoffStatus: "validation_blocked" | "signature_sent";
  missingFields: Array<{
    field: string;
    label: string;
    reason: string;
  }>;
  warnings: Array<{
    code: string;
    message: string;
  }>;
  providerTransactionId?: string;
  signatureEnvelopeId?: string;
};

type SignatureWebhookResult = {
  status: string;
  contractId?: Id<"contracts">;
};

function toFieldMapRecord(
  fieldMap: FloridaContractFieldMap,
): Record<string, string | number | boolean> {
  const record: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fieldMap)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      record[key] = value;
    }
  }
  return record;
}

function buildAdapterSource(
  context: ContractContext,
  actor: Pick<Doc<"users">, "_id" | "name" | "email" | "phone">,
  nowIso: string,
): ApprovedOfferContractSource {
  return {
    dealRoomId: context.dealRoom._id,
    offerId: context.offer._id,
    propertyId: context.property._id,
    offerStatus:
      context.offer.status === "accepted" ? "accepted" : "approved",
    approvedAt:
      context.offer.brokerApprovedAt ??
      context.offer.submittedAt ??
      nowIso,
    purchasePrice: context.offer.offerPrice,
    earnestMoney: context.offer.earnestMoney,
    closingDate: context.offer.closingDate,
    contingencies: context.offer.contingencies ?? [],
    buyerCredits: context.offer.buyerCredits,
    sellerCredits: context.offer.sellerCredits,
    financingType: context.buyerProfile?.financingType,
    property: {
      street: context.property.address.street,
      unit: context.property.address.unit,
      city: context.property.address.city,
      state: context.property.address.state,
      zip: context.property.address.zip,
      county: context.property.address.county,
      folioNumber: context.property.folioNumber,
      legalDescription: context.property.description,
      subdivision: context.property.subdivision,
      yearBuilt: context.property.yearBuilt,
      listPrice: context.property.listPrice,
      hoaFee: context.property.hoaFee,
      propertyType: context.property.propertyType,
      listingAgentName: context.property.listingAgentName,
      listingBrokerage: context.property.listingBrokerage,
    },
    buyer: {
      fullName: context.buyer.name,
      email: context.buyer.email,
      phone: context.buyer.phone,
    },
    buyerBroker: {
      fullName: actor.name,
      email: actor.email,
      phone: actor.phone,
    },
  };
}

async function loadContractContext(
  ctx: any,
  dealRoomId: Id<"dealRooms">,
  offerId: Id<"offers">,
): Promise<ContractContext | null> {
  const dealRoom = await ctx.db.get(dealRoomId);
  const offer = await ctx.db.get(offerId);
  if (!dealRoom || !offer) return null;
  if (offer.dealRoomId !== dealRoomId) {
    throw new Error("Offer does not belong to the specified deal room");
  }
  if (offer.status !== "approved" && offer.status !== "accepted") {
    throw new Error("Offer must be approved or accepted to create a contract");
  }

  const property = await ctx.db.get(dealRoom.propertyId);
  if (!property) {
    throw new Error("Property not found for deal room");
  }

  const buyer = await ctx.db.get(dealRoom.buyerId);
  if (!buyer) {
    throw new Error("Buyer not found for deal room");
  }

  const buyerProfile = await ctx.db
    .query("buyerProfiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", dealRoom.buyerId))
    .unique();

  return {
    dealRoom,
    offer,
    property,
    buyer,
    buyerProfile,
  };
}

export const getCurrentActor = query({
  args: {},
  returns: v.union(sessionUserValidator, v.null()),
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const getByDealRoom = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return [];

    if (
      dealRoom.buyerId !== user._id &&
      user.role !== "broker" &&
      user.role !== "admin"
    ) {
      return [];
    }

    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    return contracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

export const getContractContextInternal = internalQuery({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.id("offers"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await loadContractContext(ctx, args.dealRoomId, args.offerId);
  },
});

export const getContractByEnvelopeIdInternal = internalQuery({
  args: { envelopeId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contracts")
      .withIndex("by_signatureEnvelopeId", (q) =>
        q.eq("signatureEnvelopeId", args.envelopeId),
      )
      .unique();
  },
});

export const getContractByIdInternal = internalQuery({
  args: { contractId: v.id("contracts") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contractId);
  },
});

export const createAdapterRunInternal = internalMutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.id("offers"),
    provider: v.literal("form_simplicity"),
    signatureProvider: v.literal("sabal_sign"),
    templateKey: v.string(),
    templateVersion: v.string(),
    selectedForms: v.array(contractFormKey),
    status: contractAdapterRunStatus,
    handoffStatus: contractHandoffStatus,
    fieldMap: fieldMapValidator,
    missingFields: v.array(adapterMissingFieldValidator),
    warnings: v.array(adapterWarningValidator),
    createdBy: v.id("users"),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.id("contractAdapterRuns"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      provider: args.provider,
      signatureProvider: args.signatureProvider,
      templateKey: args.templateKey,
      templateVersion: args.templateVersion,
      selectedForms: args.selectedForms,
      status: args.status,
      handoffStatus: args.handoffStatus,
      fieldMap: args.fieldMap,
      missingFields: args.missingFields,
      warnings: args.warnings,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    if (args.errorCode) row.errorCode = args.errorCode;
    if (args.errorMessage) row.errorMessage = args.errorMessage;
    if (args.status === "validation_blocked" || args.status === "failed") {
      row.completedAt = now;
    }
    return await ctx.db.insert("contractAdapterRuns", row as any);
  },
});

export const createContractRecordInternal = internalMutation({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.id("offers"),
    adapterRunId: v.id("contractAdapterRuns"),
    selectedForms: v.array(contractFormKey),
    actorUserId: v.id("users"),
  },
  returns: v.id("contracts"),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const contractId = await ctx.db.insert("contracts", {
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      adapterRunId: args.adapterRunId,
      provider: "form_simplicity",
      signatureProvider: "sabal_sign",
      templateKey: FLORIDA_FAR_BAR_TEMPLATE_KEY,
      templateVersion: FLORIDA_FAR_BAR_TEMPLATE_VERSION,
      selectedForms: args.selectedForms,
      handoffStatus: "ready",
      status: "pending_signatures",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.adapterRunId, {
      contractId,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      userId: args.actorUserId,
      action: "contract_workflow_started",
      entityType: "contracts",
      entityId: contractId,
      details: JSON.stringify({
        offerId: args.offerId,
        adapterRunId: args.adapterRunId,
      }),
      timestamp: now,
    });

    return contractId;
  },
});

export const updateHandoffStateInternal = internalMutation({
  args: {
    runId: v.id("contractAdapterRuns"),
    contractId: v.optional(v.id("contracts")),
    status: contractAdapterRunStatus,
    handoffStatus: contractHandoffStatus,
    providerTransactionId: v.optional(v.string()),
    signatureEnvelopeId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    contractStatus: v.optional(
      v.union(
        v.literal("pending_signatures"),
        v.literal("fully_executed"),
        v.literal("amended"),
        v.literal("terminated"),
      ),
    ),
    generatedAt: v.optional(v.string()),
    signedAt: v.optional(v.string()),
    signatureDeclinedAt: v.optional(v.string()),
    lastSignatureEventAt: v.optional(v.string()),
    documentStorageId: v.optional(v.id("_storage")),
    actorUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const runPatch: Record<string, unknown> = {
      status: args.status,
      handoffStatus: args.handoffStatus,
      updatedAt: now,
    };
    if (args.providerTransactionId) {
      runPatch.providerTransactionId = args.providerTransactionId;
    }
    if (args.signatureEnvelopeId) {
      runPatch.signatureEnvelopeId = args.signatureEnvelopeId;
    }
    if (args.errorCode) runPatch.errorCode = args.errorCode;
    if (args.errorMessage) runPatch.errorMessage = args.errorMessage;
    if (
      args.status === "signed" ||
      args.status === "declined" ||
      args.status === "failed"
    ) {
      runPatch.completedAt = now;
    }
    await ctx.db.patch(args.runId, runPatch);

    if (args.contractId) {
      const contractPatch: Record<string, unknown> = {
        handoffStatus: args.handoffStatus,
        updatedAt: now,
      };
      if (args.providerTransactionId) {
        contractPatch.providerTransactionId = args.providerTransactionId;
      }
      if (args.signatureEnvelopeId) {
        contractPatch.signatureEnvelopeId = args.signatureEnvelopeId;
      }
      if (args.generatedAt) contractPatch.generatedAt = args.generatedAt;
      if (args.signedAt) contractPatch.signedAt = args.signedAt;
      if (args.signatureDeclinedAt) {
        contractPatch.signatureDeclinedAt = args.signatureDeclinedAt;
      }
      if (args.lastSignatureEventAt) {
        contractPatch.lastSignatureEventAt = args.lastSignatureEventAt;
      }
      if (args.documentStorageId) {
        contractPatch.documentStorageId = args.documentStorageId;
      }
      if (args.contractStatus) contractPatch.status = args.contractStatus;
      await ctx.db.patch(args.contractId, contractPatch);

      await ctx.db.insert("auditLog", {
        userId: args.actorUserId,
        action: `contract_handoff_${args.handoffStatus}`,
        entityType: "contracts",
        entityId: args.contractId,
        details: JSON.stringify({
          runId: args.runId,
          providerTransactionId: args.providerTransactionId,
          signatureEnvelopeId: args.signatureEnvelopeId,
          errorCode: args.errorCode,
          errorMessage: args.errorMessage,
        }),
        timestamp: now,
      });
    }

    return null;
  },
});

export const recordSignatureEvent = internalMutation({
  args: {
    contractId: v.id("contracts"),
    event: contractSignatureEventType,
    signerEmail: v.optional(v.string()),
    envelopeId: v.optional(v.string()),
    providerEventId: v.optional(v.string()),
    documentStorageId: v.optional(v.id("_storage")),
    payloadJson: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const contract = await ctx.db.get(args.contractId);
    if (!contract) return null;

    const now = new Date().toISOString();
    const signatureEventRow: Record<string, unknown> = {
      contractId: contract._id,
      dealRoomId: contract.dealRoomId,
      offerId: contract.offerId,
      provider: "sabal_sign",
      event: args.event,
      receivedAt: now,
    };
    if (args.envelopeId) signatureEventRow.envelopeId = args.envelopeId;
    if (args.providerEventId) {
      signatureEventRow.providerEventId = args.providerEventId;
    }
    if (args.signerEmail) signatureEventRow.signerEmail = args.signerEmail;
    if (args.documentStorageId) {
      signatureEventRow.documentStorageId = args.documentStorageId;
    }
    if (args.payloadJson) signatureEventRow.payloadJson = args.payloadJson;
    await ctx.db.insert("contractSignatureEvents", signatureEventRow as any);

    const runId = contract.adapterRunId ?? undefined;
    let runPatch: Partial<Doc<"contractAdapterRuns">> = {};
    let contractPatch: Partial<Doc<"contracts">> = {
      lastSignatureEventAt: now,
    };

    if (args.event === "sent") {
      runPatch = { status: "signature_sent", handoffStatus: "signature_sent" };
      contractPatch = { ...contractPatch, handoffStatus: "signature_sent" };
    } else if (args.event === "signed") {
      runPatch = {
        status: "signed",
        handoffStatus: "signed",
        completedAt: now,
      };
      contractPatch = {
        ...contractPatch,
        handoffStatus: "signed",
        status: "fully_executed",
        signedAt: now,
        documentStorageId: args.documentStorageId ?? contract.documentStorageId,
      };
    } else if (args.event === "declined") {
      runPatch = {
        status: "declined",
        handoffStatus: "declined",
        completedAt: now,
      };
      contractPatch = {
        ...contractPatch,
        handoffStatus: "declined",
        signatureDeclinedAt: now,
      };
    }

    if (runId && Object.keys(runPatch).length > 0) {
      await ctx.db.patch(runId, {
        ...runPatch,
        updatedAt: now,
      });
    }

    await ctx.db.patch(contract._id, {
      ...contractPatch,
      updatedAt: now,
    });

    await ctx.db.insert("auditLog", {
      action: `contract_signature_${args.event}`,
      entityType: "contracts",
      entityId: contract._id,
      details: JSON.stringify({
        envelopeId: args.envelopeId,
        signerEmail: args.signerEmail,
        providerEventId: args.providerEventId,
        documentStorageId: args.documentStorageId,
      }),
      timestamp: now,
    });

    return null;
  },
});

export const createFromOffer = action({
  args: {
    dealRoomId: v.id("dealRooms"),
    offerId: v.id("offers"),
  },
  returns: handoffResultValidator,
  handler: async (ctx, args): Promise<ContractHandoffResult> => {
    const actor = await ctx.runQuery(api.contracts.getCurrentActor, {});
    if (!actor || (actor.role !== "broker" && actor.role !== "admin")) {
      throw new Error("Only brokers/admins can create contracts");
    }

    const context = (await ctx.runQuery(
      internal.contracts.getContractContextInternal,
      args,
    )) as ContractContext | null;
    if (!context) {
      throw new Error("Offer context not found");
    }

    const now = new Date().toISOString();
    const adapter = mapApprovedOfferToFloridaContract(
      buildAdapterSource(context, actor, now),
      now,
    );

    const selectedForms = adapter.forms.map((form) => form.formKey);
    const runId: Id<"contractAdapterRuns"> = await ctx.runMutation(internal.contracts.createAdapterRunInternal, {
      dealRoomId: args.dealRoomId,
      offerId: args.offerId,
      provider: "form_simplicity",
      signatureProvider: "sabal_sign",
      templateKey: adapter.templateKey,
      templateVersion: adapter.templateVersion,
      selectedForms,
      status: adapter.status === "ready" ? "mapped" : "validation_blocked",
      handoffStatus:
        adapter.status === "ready" ? "ready" : "validation_blocked",
      fieldMap: toFieldMapRecord(adapter.fieldMap),
      missingFields: adapter.missingFields,
      warnings: adapter.warnings,
      createdBy: actor._id,
    });

    if (adapter.status === "missing_fields") {
      return {
        runId,
        contractId: null,
        handoffStatus: "validation_blocked" as const,
        missingFields: adapter.missingFields,
        warnings: adapter.warnings,
      };
    }

    const providerConfig = readContractProviderConfig();
    if (!providerConfig.ok) {
      await ctx.runMutation(internal.contracts.updateHandoffStateInternal, {
        runId,
        status: "failed",
        handoffStatus: "failed",
        errorCode: "missing_provider_config",
        errorMessage: `Missing provider config: ${providerConfig.missing.join(", ")}`,
        actorUserId: actor._id,
      });
      throw new Error(
        `Missing contract provider configuration: ${providerConfig.missing.join(", ")}`,
      );
    }

    const contractId = await ctx.runMutation(
      internal.contracts.createContractRecordInternal,
      {
        dealRoomId: args.dealRoomId,
        offerId: args.offerId,
        adapterRunId: runId,
        selectedForms,
        actorUserId: actor._id,
      },
    );

    try {
      const formResult = await submitToFormSimplicity(adapter, providerConfig.config);
      await ctx.runMutation(internal.contracts.updateHandoffStateInternal, {
        runId,
        contractId,
        status: "form_submitted",
        handoffStatus: "form_submitted",
        providerTransactionId: formResult.transactionId,
        generatedAt: now,
        actorUserId: actor._id,
      });

      const signatureResult = await createSabalSignatureEnvelope(
        contractId,
        adapter.sabalSign,
        formResult.transactionId,
        adapter.templateVersion,
        providerConfig.config,
      );

      await ctx.runMutation(internal.contracts.updateHandoffStateInternal, {
        runId,
        contractId,
        status: "signature_sent",
        handoffStatus: "signature_sent",
        providerTransactionId: formResult.transactionId,
        signatureEnvelopeId: signatureResult.envelopeId,
        generatedAt: now,
        actorUserId: actor._id,
      });

      return {
        runId,
        contractId,
        handoffStatus: "signature_sent" as const,
        missingFields: [],
        warnings: adapter.warnings,
        providerTransactionId: formResult.transactionId,
        signatureEnvelopeId: signatureResult.envelopeId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown contract handoff error";
      await ctx.runMutation(internal.contracts.updateHandoffStateInternal, {
        runId,
        contractId,
        status: "failed",
        handoffStatus: "failed",
        errorCode: "provider_handoff_failed",
        errorMessage: message,
        actorUserId: actor._id,
      });
      throw error;
    }
  },
});

export const processSignatureWebhook = internalAction({
  args: {
    event: webhookEventValidator,
    payloadJson: v.optional(v.string()),
  },
  returns: v.object({
    status: v.string(),
    contractId: v.optional(v.id("contracts")),
  }),
  handler: async (ctx, args): Promise<SignatureWebhookResult> => {
    const event = args.event as NormalizedSabalWebhookEvent;
    let targetContract: Doc<"contracts"> | null = null;
    if (event.contractId) {
      try {
        const maybeById = await ctx.runQuery(
          internal.contracts.getContractByIdInternal,
          {
            contractId: event.contractId as Id<"contracts">,
          },
        );
        if (maybeById) {
          targetContract = maybeById as Doc<"contracts">;
        }
      } catch {
        // Ignore malformed external contract ids and fall back to envelope lookup.
      }
    }

    if (!targetContract && event.envelopeId) {
      const byEnvelope: Doc<"contracts"> | null = await ctx.runQuery(
        internal.contracts.getContractByEnvelopeIdInternal,
        {
          envelopeId: event.envelopeId,
        },
      );
      targetContract = byEnvelope;
    }

    if (!targetContract) {
      return { status: "ignored" };
    }

    const documentStorageId =
      event.event === "signed"
        ? await storeSignedPdfFromWebhook(ctx, event)
        : undefined;

    await ctx.runMutation(internal.contracts.recordSignatureEvent, {
      contractId: targetContract._id,
      event: event.event,
      signerEmail: event.signerEmail,
      envelopeId: event.envelopeId,
      providerEventId: event.providerEventId,
      documentStorageId,
      payloadJson: args.payloadJson,
    });

    return {
      status: "recorded",
      contractId: targetContract._id,
    };
  },
});

export const updateStatus = mutation({
  args: {
    contractId: v.id("contracts"),
    status: v.union(
      v.literal("fully_executed"),
      v.literal("amended"),
      v.literal("terminated"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      throw new Error("Only brokers/admins can update contract status");
    }

    const contract = await ctx.db.get(args.contractId);
    if (!contract) throw new Error("Contract not found");

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };
    if (args.status === "fully_executed") {
      patch.signedAt = now;
    } else if (contract.signedAt) {
      patch.signedAt = contract.signedAt;
    }
    await ctx.db.patch(args.contractId, patch);

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: `contract_${args.status}`,
      entityType: "contracts",
      entityId: args.contractId,
      timestamp: now,
    });

    return null;
  },
});

export function readSabalWebhook(
  payload: unknown,
): NormalizedSabalWebhookEvent | null {
  return normalizeSabalWebhookPayload(payload);
}

export function isValidSabalWebhook(
  headers: Headers,
  secret: string,
): boolean {
  return verifySabalWebhookSignature(headers, secret);
}
