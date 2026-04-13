import { describe, expect, it } from "vitest"

import {
  buildAgreementAccessAudit,
  buildAgreementCanceledAudit,
  buildAgreementCanceledPatch,
  buildAgreementCreatedAudit,
  buildAgreementDraft,
  buildAgreementReplacedAudit,
  buildAgreementSentPatch,
  buildAgreementSignedAudit,
  buildAgreementSignedPatch,
  buildReplacementDraftInput,
  canReadAgreement,
  getSignedArtifactStorageId,
  resolveCurrentAgreementReadModel,
  type AgreementActor,
  type AgreementRecordLike,
} from "../../../convex/lib/agreements"

const NOW = "2026-04-12T12:00:00.000Z"
const EFFECTIVE_START = "2026-04-15T00:00:00.000Z"
const EFFECTIVE_END = "2027-04-15T00:00:00.000Z"
const SIGNED_EFFECTIVE_START = "2026-04-14T00:00:00.000Z"
const SIGNED_EFFECTIVE_END = "2027-04-14T00:00:00.000Z"

function actor(
  overrides: Partial<AgreementActor> = {},
): AgreementActor {
  return {
    _id: "user_broker",
    role: "broker",
    ...overrides,
  }
}

function agreement(
  overrides: Partial<AgreementRecordLike> = {},
): AgreementRecordLike {
  return {
    _id: "agreement_1",
    dealRoomId: "deal_1",
    buyerId: "buyer_1",
    type: "tour_pass",
    status: "draft",
    createdAt: "2026-04-10T09:00:00.000Z",
    updatedAt: "2026-04-10T09:00:00.000Z",
    ...overrides,
  }
}

describe("agreement storage helpers", () => {
  it("rejects unauthorized actors and invalid lifecycle transitions", () => {
    expect(() =>
      buildAgreementDraft(
        actor({ role: "buyer", _id: "buyer_1" }),
        {
          dealRoomId: "deal_1",
          buyerId: "buyer_1",
          type: "tour_pass",
        },
        NOW,
      ),
    ).toThrow("Only brokers and admins can manage agreements")

    expect(() =>
      buildAgreementSentPatch(
        agreement({ status: "signed" }),
        actor(),
        NOW,
      ),
    ).toThrow("Can only send draft agreements")

    expect(() =>
      buildAgreementSignedPatch(
        agreement({ status: "draft" }),
        actor(),
        {},
        NOW,
      ),
    ).toThrow("Can only sign sent agreements")

    expect(() =>
      buildAgreementSignedPatch(
        agreement({
          status: "sent",
          documentStorageId: undefined,
          signedArtifact: undefined,
        }),
        actor(),
        {},
        NOW,
      ),
    ).toThrow("Signed agreement storage is required")

    expect(() =>
      buildAgreementCanceledPatch(
        agreement({ status: "sent" }),
        actor(),
        {},
        NOW,
      ),
    ).toThrow("Can only cancel signed agreements")
  })

  it("rejects mismatched signed storage ids", () => {
    expect(() =>
      buildAgreementSignedPatch(
        agreement({
          status: "sent",
          documentStorageId: "storage_canonical",
        }),
        actor(),
        {
          documentStorageId: "storage_canonical",
          signedArtifact: {
            storageId: "storage_signed",
            fileName: "buyer-agreement.pdf",
          },
        },
        NOW,
      ),
    ).toThrow(/storage references must match/i)
  })

  it("rejects malformed or inverted effective date ranges", () => {
    expect(() =>
      buildAgreementDraft(
        actor(),
        {
          dealRoomId: "deal_1",
          buyerId: "buyer_1",
          type: "full_representation",
          effectiveStartAt: "not-an-iso-date",
          effectiveEndAt: EFFECTIVE_END,
        },
        NOW,
      ),
    ).toThrow(/effective.*ISO|ISO.*effective|date range/i)

    expect(() =>
      buildAgreementSignedPatch(
        agreement({
          status: "sent",
          documentStorageId: "storage_signed",
          signedArtifact: {
            storageId: "storage_signed",
            uploadedAt: NOW,
          },
          effectiveStartAt: SIGNED_EFFECTIVE_START,
          effectiveEndAt: SIGNED_EFFECTIVE_END,
        }),
        actor(),
        {
          documentStorageId: "storage_signed",
          signedArtifact: {
            storageId: "storage_signed",
            fileName: "buyer-agreement.pdf",
          },
          effectiveStartAt: "2026-04-17T00:00:00.000Z",
          effectiveEndAt: "2026-04-16T00:00:00.000Z",
        },
        NOW,
      ),
    ).toThrow(/effective date range is inverted|cannot be before effectiveStartAt|inverted/i)
  })

  it("builds typed draft state and create audit metadata", () => {
    const broker = actor()
    const draft = buildAgreementDraft(
      broker,
      {
        dealRoomId: "deal_1",
        buyerId: "buyer_1",
        type: "full_representation",
        documentStorageId: "storage_draft",
        effectiveStartAt: EFFECTIVE_START,
        effectiveEndAt: EFFECTIVE_END,
      },
      NOW,
    )

    expect(draft).toMatchObject({
      dealRoomId: "deal_1",
      buyerId: "buyer_1",
      type: "full_representation",
      status: "draft",
      documentStorageId: "storage_draft",
      effectiveStartAt: EFFECTIVE_START,
      effectiveEndAt: EFFECTIVE_END,
      createdAt: NOW,
      updatedAt: NOW,
      createdByUserId: "user_broker",
      lastUpdatedByUserId: "user_broker",
    })

    const audit = buildAgreementCreatedAudit(
      broker,
      "agreement_1",
      {
        dealRoomId: "deal_1",
        buyerId: "buyer_1",
        type: "full_representation",
        documentStorageId: "storage_draft",
        effectiveStartAt: EFFECTIVE_START,
        effectiveEndAt: EFFECTIVE_END,
      },
      NOW,
    )

    expect(audit).toMatchObject({
      userId: "user_broker",
      action: "agreement_created",
      entityId: "agreement_1",
      timestamp: NOW,
    })
    expect(JSON.parse(audit.details ?? "{}")).toMatchObject({
      buyerId: "buyer_1",
      type: "full_representation",
      hasDocumentStorageId: true,
    })
  })

  it("records signature artifacts and normalizes effective dates", () => {
    const broker = actor()
    const sentAgreement = agreement({
      status: "sent",
      type: "full_representation",
      effectiveStartAt: SIGNED_EFFECTIVE_START,
    })

    const patch = buildAgreementSignedPatch(
      sentAgreement,
      broker,
      {
        signedArtifact: {
          storageId: "storage_signed",
          fileName: "buyer-agreement.pdf",
          contentType: "application/pdf",
          checksumSha256: "abc123",
        },
        effectiveEndAt: SIGNED_EFFECTIVE_END,
      },
      NOW,
    )

    expect(patch).toMatchObject({
      status: "signed",
      documentStorageId: "storage_signed",
      signedAt: NOW,
      effectiveStartAt: SIGNED_EFFECTIVE_START,
      effectiveEndAt: SIGNED_EFFECTIVE_END,
    })
    expect(patch.signedArtifact).toMatchObject({
      storageId: "storage_signed",
      fileName: "buyer-agreement.pdf",
      contentType: "application/pdf",
      checksumSha256: "abc123",
      uploadedAt: NOW,
    })

    const audit = buildAgreementSignedAudit(
      broker,
      sentAgreement,
      {
        signedArtifact: {
          storageId: "storage_signed",
          fileName: "buyer-agreement.pdf",
        },
      },
      NOW,
    )
    expect(audit.action).toBe("agreement_signed")
    expect(JSON.parse(audit.details ?? "{}")).toMatchObject({
      signedStorageId: "storage_signed",
      type: "full_representation",
    })
  })

  it("records cancel metadata and closes the effective window", () => {
    const patch = buildAgreementCanceledPatch(
      agreement({
        status: "signed",
        type: "full_representation",
        effectiveStartAt: SIGNED_EFFECTIVE_START,
      }),
      actor(),
      {
        reason: "buyer opted out",
      },
      NOW,
    )

    expect(patch).toMatchObject({
      status: "canceled",
      canceledAt: NOW,
      canceledReason: "buyer opted out",
      effectiveEndAt: NOW,
    })

    const audit = buildAgreementCanceledAudit(
      actor(),
      agreement({
        _id: "agreement_cancel",
        status: "signed",
      }),
      { reason: "buyer opted out" },
      NOW,
    )
    expect(audit.action).toBe("agreement_canceled")
    expect(JSON.parse(audit.details ?? "{}")).toMatchObject({
      reason: "buyer opted out",
      effectiveEndAt: NOW,
    })
  })

  it("builds replacement drafts and resolves the current governing agreement deterministically", () => {
    const predecessor = agreement({
      _id: "agreement_old",
      type: "tour_pass",
      status: "replaced",
      signedAt: "2026-04-01T09:00:00.000Z",
      replacedById: "agreement_new",
      supersededAt: "2026-04-12T10:00:00.000Z",
    })

    const replacementInput = buildReplacementDraftInput(
      predecessor,
      "full_representation",
      "storage_new_draft",
    )
    expect(replacementInput).toMatchObject({
      dealRoomId: "deal_1",
      buyerId: "buyer_1",
      type: "full_representation",
      documentStorageId: "storage_new_draft",
    })

    const successor = agreement({
      _id: "agreement_new",
      type: "full_representation",
      status: "signed",
      documentStorageId: "storage_signed",
      signedArtifact: {
        storageId: "storage_signed",
        uploadedAt: NOW,
      },
      signedAt: "2026-04-12T11:00:00.000Z",
      effectiveStartAt: "2026-04-12T00:00:00.000Z",
    })

    const resolved = resolveCurrentAgreementReadModel([predecessor, successor])
    expect(resolved).toMatchObject({
      agreementId: "agreement_new",
      type: "full_representation",
      accessScope: "offers",
      signedAt: "2026-04-12T11:00:00.000Z",
    })

    const pendingResolved = resolveCurrentAgreementReadModel([
      predecessor,
      agreement({
        _id: "agreement_new",
        type: "full_representation",
        status: "draft",
      }),
    ])
    expect(pendingResolved).toBeNull()

    const replaceAudit = buildAgreementReplacedAudit(
      actor(),
      predecessor,
      "agreement_new",
      "full_representation",
      "upgrade_to_full_representation",
      NOW,
    )
    expect(replaceAudit.action).toBe("agreement_replaced")
    expect(JSON.parse(replaceAudit.details ?? "{}")).toMatchObject({
      replacedById: "agreement_new",
      previousType: "tour_pass",
      newType: "full_representation",
      reason: "upgrade_to_full_representation",
    })
  })

  it("enforces role-aware reads and audits signed artifact access", () => {
    const agreementRow = agreement({
      _id: "agreement_access",
      status: "signed",
      documentStorageId: "storage_signed",
      signedArtifact: {
        storageId: "storage_signed",
        uploadedAt: NOW,
      },
    })

    expect(canReadAgreement(actor({ role: "buyer", _id: "buyer_1" }), "buyer_1")).toBe(true)
    expect(canReadAgreement(actor({ role: "buyer", _id: "buyer_2" }), "buyer_1")).toBe(false)
    expect(canReadAgreement(actor({ role: "broker", _id: "broker_1" }), "buyer_1")).toBe(true)
    expect(canReadAgreement(actor({ role: "admin", _id: "admin_1" }), "buyer_1")).toBe(true)

    const grantedAudit = buildAgreementAccessAudit(
      actor({ role: "broker", _id: "broker_1" }),
      agreementRow,
      NOW,
      "granted",
    )
    expect(grantedAudit.action).toBe("agreement_artifact_accessed")
    expect(getSignedArtifactStorageId(agreementRow)).toBe("storage_signed")

    const deniedAudit = buildAgreementAccessAudit(
      actor({ role: "buyer", _id: "buyer_2" }),
      agreementRow,
      NOW,
      "denied",
    )
    expect(deniedAudit.action).toBe("agreement_artifact_access_denied")
    expect(JSON.parse(deniedAudit.details ?? "{}")).toMatchObject({
      outcome: "denied",
      artifactStorageId: "storage_signed",
    })

    expect(
      getSignedArtifactStorageId(
        agreement({
          status: "draft",
          documentStorageId: "storage_draft",
        }),
      ),
    ).toBeUndefined()
  })

  it("resolves governing agreements even when legacy timestamp fields are missing", () => {
    const resolved = resolveCurrentAgreementReadModel([
      agreement({
        _id: "agreement_legacy_tour",
        status: "signed",
        type: "tour_pass",
        createdAt: undefined,
        updatedAt: undefined,
        signedAt: "2026-04-01T08:00:00.000Z",
      }),
      agreement({
        _id: "agreement_legacy_full_rep",
        status: "signed",
        type: "full_representation",
        createdAt: undefined,
        updatedAt: undefined,
        signedAt: "2026-04-02T08:00:00.000Z",
      }),
    ])

    expect(resolved).toMatchObject({
      agreementId: "agreement_legacy_full_rep",
      type: "full_representation",
      accessScope: "offers",
    })
  })
})
