export type AgreementRole = "buyer" | "broker" | "admin"

export type AgreementType = "tour_pass" | "full_representation"

export type AgreementStatus =
  | "draft"
  | "sent"
  | "signed"
  | "canceled"
  | "replaced"

export type AgreementAccessScope = "touring" | "offers"

export type SupersessionReason =
  | "upgrade_to_full_representation"
  | "correction"
  | "amendment"
  | "renewal"
  | "replace_expired"
  | "broker_decision"

export interface AgreementActor<UserId extends string = string> {
  _id: UserId
  role: AgreementRole
}

export interface AgreementArtifact<StorageId extends string = string> {
  storageId: StorageId
  fileName?: string
  contentType?: string
  checksumSha256?: string
  uploadedAt: string
}

export interface AgreementArtifactInput<StorageId extends string = string> {
  storageId: StorageId
  fileName?: string
  contentType?: string
  checksumSha256?: string
}

export interface AgreementRecordLike<
  AgreementId extends string = string,
  DealRoomId extends string = string,
  UserId extends string = string,
  StorageId extends string = string,
> {
  _id: AgreementId
  dealRoomId: DealRoomId
  buyerId: UserId
  type: AgreementType
  status: AgreementStatus
  documentStorageId?: StorageId
  signedArtifact?: AgreementArtifact<StorageId>
  effectiveStartAt?: string
  effectiveEndAt?: string
  createdAt?: string
  updatedAt?: string
  createdByUserId?: UserId
  lastUpdatedByUserId?: UserId
  sentAt?: string
  signedAt?: string
  canceledAt?: string
  canceledReason?: string
  supersededAt?: string
  supersessionReason?: SupersessionReason
  replacedById?: AgreementId
}

export interface AgreementAuditEntry<
  UserId extends string = string,
  AgreementId extends string = string,
> {
  userId?: UserId
  action: string
  entityType: "agreements"
  entityId: AgreementId
  details?: string
  timestamp: string
}

export interface GoverningAgreementReadModel<
  AgreementId extends string = string,
  DealRoomId extends string = string,
  UserId extends string = string,
  StorageId extends string = string,
> {
  agreementId: AgreementId
  buyerId: UserId
  dealRoomId: DealRoomId
  type: AgreementType
  status: AgreementStatus
  accessScope: AgreementAccessScope
  effectiveStartAt?: string
  effectiveEndAt?: string
  sentAt?: string
  signedAt?: string
  signedArtifact?: AgreementArtifact<StorageId>
  replacedById?: AgreementId
  supersededAt?: string
  canceledAt?: string
}

export interface CreateDraftAgreementInput<
  DealRoomId extends string = string,
  UserId extends string = string,
  StorageId extends string = string,
> {
  dealRoomId: DealRoomId
  buyerId: UserId
  type: AgreementType
  documentStorageId?: StorageId
  effectiveStartAt?: string
  effectiveEndAt?: string
}

export interface RecordAgreementSignatureInput<StorageId extends string = string> {
  documentStorageId?: StorageId
  signedArtifact?: AgreementArtifactInput<StorageId>
  effectiveStartAt?: string
  effectiveEndAt?: string
}

export interface CancelAgreementInput {
  reason?: string
  effectiveEndAt?: string
}

export function canManageAgreements(actor: AgreementActor): boolean {
  return actor.role === "broker" || actor.role === "admin"
}

export function canReadAgreement(
  actor: AgreementActor,
  buyerId: string,
): boolean {
  return actor._id === buyerId || canManageAgreements(actor)
}

export function assertCanManageAgreements(actor: AgreementActor): void {
  if (!canManageAgreements(actor)) {
    throw new Error("Only brokers and admins can manage agreements")
  }
}

function resolveSignedStorageIdFromInput<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  input: RecordAgreementSignatureInput<StorageId>,
): StorageId | undefined {
  if (
    input.documentStorageId &&
    input.signedArtifact?.storageId &&
    input.documentStorageId !== input.signedArtifact.storageId
  ) {
    throw new Error("Signed agreement storage references must match")
  }

  return (
    input.signedArtifact?.storageId ??
    input.documentStorageId ??
    agreement.signedArtifact?.storageId ??
    agreement.documentStorageId
  )
}

function isCanonicalIsoDateLike(value: string): boolean {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/
  const timestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

  return (
    (dateOnly.test(value) || timestamp.test(value)) &&
    !Number.isNaN(Date.parse(value))
  )
}

function assertValidAgreementEffectiveDates(
  effectiveStartAt?: string,
  effectiveEndAt?: string,
): void {
  if (effectiveStartAt && !isCanonicalIsoDateLike(effectiveStartAt)) {
    throw new Error("effectiveStartAt must be a valid ISO date or timestamp")
  }

  if (effectiveEndAt && !isCanonicalIsoDateLike(effectiveEndAt)) {
    throw new Error("effectiveEndAt must be a valid ISO date or timestamp")
  }

  if (
    effectiveStartAt &&
    effectiveEndAt &&
    Date.parse(effectiveEndAt) < Date.parse(effectiveStartAt)
  ) {
    throw new Error(
      "effective date range is inverted: effectiveEndAt cannot be earlier than effectiveStartAt",
    )
  }
}

export function getSignedArtifactStorageId<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
): StorageId | undefined {
  if (agreement.status !== "signed") {
    return undefined
  }

  return agreement.signedArtifact?.storageId ?? agreement.documentStorageId
}

export function normalizeAgreementArtifact<StorageId extends string>(
  artifact: AgreementArtifactInput<StorageId>,
  uploadedAt: string,
): AgreementArtifact<StorageId> {
  return {
    storageId: artifact.storageId,
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    checksumSha256: artifact.checksumSha256,
    uploadedAt,
  }
}

export function buildAgreementDraft<
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  actor: AgreementActor<UserId>,
  input: CreateDraftAgreementInput<DealRoomId, UserId, StorageId>,
  now: string,
): Pick<
  AgreementRecordLike<string, DealRoomId, UserId, StorageId>,
  | "dealRoomId"
  | "buyerId"
  | "type"
  | "status"
  | "documentStorageId"
  | "effectiveStartAt"
  | "effectiveEndAt"
  | "createdAt"
  | "updatedAt"
  | "createdByUserId"
  | "lastUpdatedByUserId"
> {
  assertCanManageAgreements(actor)
  assertValidAgreementEffectiveDates(
    input.effectiveStartAt,
    input.effectiveEndAt,
  )

  return {
    dealRoomId: input.dealRoomId,
    buyerId: input.buyerId,
    type: input.type,
    status: "draft",
    documentStorageId: input.documentStorageId,
    effectiveStartAt: input.effectiveStartAt,
    effectiveEndAt: input.effectiveEndAt,
    createdAt: now,
    updatedAt: now,
    createdByUserId: actor._id,
    lastUpdatedByUserId: actor._id,
  }
}

export function buildAgreementCreatedAudit<
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
  AgreementId extends string,
>(
  actor: AgreementActor<UserId>,
  agreementId: AgreementId,
  input: CreateDraftAgreementInput<DealRoomId, UserId, StorageId>,
  now: string,
): AgreementAuditEntry<UserId, AgreementId> {
  return {
    userId: actor._id,
    action: "agreement_created",
    entityType: "agreements",
    entityId: agreementId,
    details: JSON.stringify({
      dealRoomId: input.dealRoomId,
      buyerId: input.buyerId,
      type: input.type,
      effectiveStartAt: input.effectiveStartAt ?? null,
      effectiveEndAt: input.effectiveEndAt ?? null,
      hasDocumentStorageId: Boolean(input.documentStorageId),
    }),
    timestamp: now,
  }
}

export function buildAgreementSentPatch<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  actor: AgreementActor<UserId>,
  now: string,
): Partial<AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>> {
  assertCanManageAgreements(actor)
  if (agreement.status !== "draft") {
    throw new Error("Can only send draft agreements")
  }

  return {
    status: "sent",
    sentAt: now,
    updatedAt: now,
    lastUpdatedByUserId: actor._id,
  }
}

export function buildAgreementSentAudit<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  actor: AgreementActor<UserId>,
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  now: string,
): AgreementAuditEntry<UserId, AgreementId> {
  return {
    userId: actor._id,
    action: "agreement_sent",
    entityType: "agreements",
    entityId: agreement._id,
    details: JSON.stringify({
      type: agreement.type,
      dealRoomId: agreement.dealRoomId,
      buyerId: agreement.buyerId,
    }),
    timestamp: now,
  }
}

export function buildAgreementSignedPatch<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  actor: AgreementActor<UserId>,
  input: RecordAgreementSignatureInput<StorageId>,
  now: string,
): Partial<AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>> {
  assertCanManageAgreements(actor)
  if (agreement.status !== "sent") {
    throw new Error("Can only sign sent agreements")
  }

  const signedStorageId = resolveSignedStorageIdFromInput(agreement, input)
  const effectiveStartAt = input.effectiveStartAt ?? agreement.effectiveStartAt ?? now
  const effectiveEndAt = input.effectiveEndAt ?? agreement.effectiveEndAt
  assertValidAgreementEffectiveDates(effectiveStartAt, effectiveEndAt)
  if (!signedStorageId) {
    throw new Error("Signed agreement storage is required")
  }

  return {
    status: "signed",
    signedAt: now,
    updatedAt: now,
    lastUpdatedByUserId: actor._id,
    documentStorageId: signedStorageId,
    signedArtifact: normalizeAgreementArtifact(
      input.signedArtifact ?? { storageId: signedStorageId },
      now,
    ),
    effectiveStartAt,
    effectiveEndAt,
  }
}

export function buildAgreementSignedAudit<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  actor: AgreementActor<UserId>,
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  input: RecordAgreementSignatureInput<StorageId>,
  now: string,
): AgreementAuditEntry<UserId, AgreementId> {
  const signedStorageId = resolveSignedStorageIdFromInput(agreement, input)
  if (!signedStorageId) {
    throw new Error("Signed agreement storage is required")
  }
  const effectiveStartAt = input.effectiveStartAt ?? agreement.effectiveStartAt ?? now
  const effectiveEndAt = input.effectiveEndAt ?? agreement.effectiveEndAt
  assertValidAgreementEffectiveDates(effectiveStartAt, effectiveEndAt)

  return {
    userId: actor._id,
    action: "agreement_signed",
    entityType: "agreements",
    entityId: agreement._id,
    details: JSON.stringify({
      type: agreement.type,
      dealRoomId: agreement.dealRoomId,
      buyerId: agreement.buyerId,
      effectiveStartAt,
      effectiveEndAt: effectiveEndAt ?? null,
      signedStorageId,
    }),
    timestamp: now,
  }
}

export function buildAgreementCanceledPatch<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  actor: AgreementActor<UserId>,
  input: CancelAgreementInput,
  now: string,
): Partial<AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>> {
  assertCanManageAgreements(actor)
  if (agreement.status !== "signed") {
    throw new Error("Can only cancel signed agreements")
  }
  const effectiveEndAt = input.effectiveEndAt ?? agreement.effectiveEndAt ?? now
  if (input.effectiveEndAt) {
    assertValidAgreementEffectiveDates(agreement.effectiveStartAt, input.effectiveEndAt)
  }

  return {
    status: "canceled",
    canceledAt: now,
    canceledReason: input.reason?.trim() || undefined,
    effectiveEndAt,
    updatedAt: now,
    lastUpdatedByUserId: actor._id,
  }
}

export function buildAgreementCanceledAudit<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  actor: AgreementActor<UserId>,
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  input: CancelAgreementInput,
  now: string,
): AgreementAuditEntry<UserId, AgreementId> {
  const effectiveEndAt = input.effectiveEndAt ?? agreement.effectiveEndAt ?? now
  if (input.effectiveEndAt) {
    assertValidAgreementEffectiveDates(agreement.effectiveStartAt, input.effectiveEndAt)
  }
  return {
    userId: actor._id,
    action: "agreement_canceled",
    entityType: "agreements",
    entityId: agreement._id,
    details: JSON.stringify({
      reason: input.reason?.trim() || null,
      effectiveEndAt,
    }),
    timestamp: now,
  }
}

export function buildReplacementDraftInput(
  agreement: AgreementRecordLike<string, string, string, string>,
  newType: AgreementType,
  documentStorageId: string | undefined,
): CreateDraftAgreementInput<string, string, string> {
  return {
    dealRoomId: agreement.dealRoomId,
    buyerId: agreement.buyerId,
    type: newType,
    documentStorageId,
  }
}

export function buildAgreementReplacedAudit<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  actor: AgreementActor<UserId>,
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  replacementAgreementId: AgreementId,
  newType: AgreementType,
  reason: SupersessionReason,
  now: string,
): AgreementAuditEntry<UserId, AgreementId> {
  return {
    userId: actor._id,
    action: "agreement_replaced",
    entityType: "agreements",
    entityId: agreement._id,
    details: JSON.stringify({
      replacedById: replacementAgreementId,
      previousType: agreement.type,
      newType,
      reason,
    }),
    timestamp: now,
  }
}

export function buildAgreementAccessAudit<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  actor: AgreementActor<UserId>,
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  now: string,
  outcome: "granted" | "denied",
): AgreementAuditEntry<UserId, AgreementId> {
  return {
    userId: actor._id,
    action:
      outcome === "granted"
        ? "agreement_artifact_accessed"
        : "agreement_artifact_access_denied",
    entityType: "agreements",
    entityId: agreement._id,
    details: JSON.stringify({
      outcome,
      actorRole: actor.role,
      buyerId: agreement.buyerId,
      dealRoomId: agreement.dealRoomId,
      artifactStorageId: getSignedArtifactStorageId(agreement) ?? null,
    }),
    timestamp: now,
  }
}

export function toGoverningAgreementReadModel<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  agreement: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
): GoverningAgreementReadModel<AgreementId, DealRoomId, UserId, StorageId> {
  return {
    agreementId: agreement._id,
    buyerId: agreement.buyerId,
    dealRoomId: agreement.dealRoomId,
    type: agreement.type,
    status: agreement.status,
    accessScope:
      agreement.type === "full_representation" ? "offers" : "touring",
    effectiveStartAt: agreement.effectiveStartAt,
    effectiveEndAt: agreement.effectiveEndAt,
    sentAt: agreement.sentAt,
    signedAt: agreement.signedAt,
    signedArtifact: agreement.signedArtifact,
    replacedById: agreement.replacedById,
    supersededAt: agreement.supersededAt,
    canceledAt: agreement.canceledAt,
  }
}

function walkAgreementChain<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  head: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>,
  byId: Map<
    AgreementId,
    AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>
  >,
): AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>[] {
  const lineage: Array<
    AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>
  > = []
  const seen = new Set<AgreementId>()
  let current:
    | AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>
    | undefined = head

  while (current) {
    if (seen.has(current._id)) break
    seen.add(current._id)
    lineage.push(current)
    if (!current.replacedById) break
    current = byId.get(current.replacedById)
  }

  return lineage
}

export function resolveCurrentAgreementReadModel<
  AgreementId extends string,
  DealRoomId extends string,
  UserId extends string,
  StorageId extends string,
>(
  agreements: AgreementRecordLike<AgreementId, DealRoomId, UserId, StorageId>[],
): GoverningAgreementReadModel<AgreementId, DealRoomId, UserId, StorageId> | null {
  if (agreements.length === 0) return null

  const successorIds = new Set(
    agreements
      .map((agreement) => agreement.replacedById)
      .filter(
        (agreementId): agreementId is AgreementId => agreementId !== undefined,
      ),
  )
  const heads = agreements.filter((agreement) => !successorIds.has(agreement._id))
  const byId = new Map(
    agreements.map((agreement) => [agreement._id, agreement] as const),
  )

  const signedTails = heads
    .map((head) => walkAgreementChain(head, byId).at(-1))
    .filter(
      (
        agreement,
      ): agreement is AgreementRecordLike<
        AgreementId,
        DealRoomId,
        UserId,
        StorageId
      > => agreement !== undefined,
    )
    .filter((agreement) => agreement.status === "signed")

  if (signedTails.length === 0) return null

  const ranked = [...signedTails].sort((left, right) => {
    const typeRank =
      left.type === right.type
        ? 0
        : left.type === "full_representation"
          ? -1
          : 1
    if (typeRank !== 0) return typeRank

    return (right.signedAt ?? "").localeCompare(left.signedAt ?? "")
  })

  return toGoverningAgreementReadModel(ranked[0])
}
