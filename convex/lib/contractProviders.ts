"use node";

import type {
  ContractAdapterResult,
  FloridaContractFormKey,
  SabalSignatureRequest,
} from "@buyer-v2/shared/contracts";
import type { Id } from "../_generated/dataModel";

export interface ContractProviderConfig {
  formSimplicityBaseUrl: string;
  formSimplicityClientId: string;
  formSimplicityClientSecret: string;
  formSimplicityUserId: string;
  formSimplicityAgentNrdsId: string;
  formSimplicityStateId: string;
  sabalSignBaseUrl: string;
  sabalSignApiKey: string;
  sabalSignWebhookSecret: string;
  formTemplateRefs: Partial<Record<FloridaContractFormKey, string>>;
}

export interface ContractProviderConfigError {
  ok: false;
  missing: string[];
}

export interface ContractProviderConfigReady {
  ok: true;
  config: ContractProviderConfig;
}

export type ContractProviderConfigResult =
  | ContractProviderConfigError
  | ContractProviderConfigReady;

export interface FormSimplicitySubmissionResult {
  transactionId: string;
  rawResponse: unknown;
  templateRefs: Partial<Record<FloridaContractFormKey, string>>;
}

export interface SabalSignatureSubmissionResult {
  envelopeId: string;
  rawResponse: unknown;
}

export interface NormalizedSabalWebhookEvent {
  contractId?: string;
  envelopeId?: string;
  providerEventId?: string;
  event: "sent" | "viewed" | "signed" | "declined";
  signerEmail?: string;
  signedPdfUrl?: string;
  signedPdfBase64?: string;
  metadata?: Record<string, unknown>;
}

function trimTrailingSlash(value: string | undefined, fallback: string): string {
  return (value && value.trim() ? value : fallback).replace(/\/+$/, "");
}

export function readContractProviderConfig(
  env: Record<string, string | undefined> = process.env,
): ContractProviderConfigResult {
  const required = [
    "FORM_SIMPLICITY_CLIENT_ID",
    "FORM_SIMPLICITY_CLIENT_SECRET",
    "FORM_SIMPLICITY_USER_ID",
    "FORM_SIMPLICITY_AGENT_NRDS_ID",
    "SABAL_SIGN_API_KEY",
    "SABAL_SIGN_WEBHOOK_SECRET",
  ] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    return { ok: false, missing: [...missing] };
  }

  return {
    ok: true,
    config: {
      formSimplicityBaseUrl: trimTrailingSlash(
        env.FORM_SIMPLICITY_BASE_URL,
        "https://formsapidev.floridarealtors.org",
      ),
      formSimplicityClientId: env.FORM_SIMPLICITY_CLIENT_ID!,
      formSimplicityClientSecret: env.FORM_SIMPLICITY_CLIENT_SECRET!,
      formSimplicityUserId: env.FORM_SIMPLICITY_USER_ID!,
      formSimplicityAgentNrdsId: env.FORM_SIMPLICITY_AGENT_NRDS_ID!,
      formSimplicityStateId: env.FORM_SIMPLICITY_STATE_ID ?? "FL",
      sabalSignBaseUrl: trimTrailingSlash(
        env.SABAL_SIGN_BASE_URL,
        "https://api.sabalsign.com",
      ),
      sabalSignApiKey: env.SABAL_SIGN_API_KEY!,
      sabalSignWebhookSecret: env.SABAL_SIGN_WEBHOOK_SECRET!,
      formTemplateRefs: {
        fl_far_bar_residential_contract:
          env.FORM_SIMPLICITY_TEMPLATE_RESIDENTIAL_CONTRACT,
        fl_condominium_rider: env.FORM_SIMPLICITY_TEMPLATE_CONDO_RIDER,
        fl_homeowners_association_addendum:
          env.FORM_SIMPLICITY_TEMPLATE_HOA_ADDENDUM,
        fl_lead_based_paint_disclosure:
          env.FORM_SIMPLICITY_TEMPLATE_LEAD_BASED_PAINT,
      },
    },
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function firstRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    const first = payload[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }
  if (typeof payload === "object") {
    return payload as Record<string, unknown>;
  }
  return null;
}

export function extractFormSimplicityTransactionId(payload: unknown): string | null {
  const record = firstRecord(payload);
  if (!record) return null;
  const direct = record.transId ?? record.transactionId ?? record.id;
  if (typeof direct === "string" && direct.length > 0) return direct;

  const nestedData = record.data;
  if (Array.isArray(nestedData)) {
    for (const row of nestedData) {
      if (!row || typeof row !== "object") continue;
      const candidate =
        (row as Record<string, unknown>).transId ??
        (row as Record<string, unknown>).transactionId ??
        (row as Record<string, unknown>).id;
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
  }

  return null;
}

export function extractSabalEnvelopeId(payload: unknown): string | null {
  const record = firstRecord(payload);
  if (!record) return null;
  const candidate =
    record.envelopeId ??
    record.signatureRequestId ??
    record.requestId ??
    record.id;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

async function fetchFormSimplicityAccessToken(
  config: ContractProviderConfig,
): Promise<string> {
  const response = await fetch(`${config.formSimplicityBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.formSimplicityClientId,
      client_secret: config.formSimplicityClientSecret,
    }),
  });

  const payload = (await parseJsonResponse(response)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(
      `Form Simplicity token request failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  const accessToken = payload?.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("Form Simplicity token response did not include access_token");
  }

  return accessToken;
}

export async function submitToFormSimplicity(
  adapter: ContractAdapterResult,
  config: ContractProviderConfig,
): Promise<FormSimplicitySubmissionResult> {
  const accessToken = await fetchFormSimplicityAccessToken(config);
  const response = await fetch(
    `${config.formSimplicityBaseUrl}/fsforms/addTrans`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        userId: config.formSimplicityUserId,
        stateID: config.formSimplicityStateId,
        agentNRDSID: config.formSimplicityAgentNrdsId,
        ...adapter.formSimplicity.addTransaction,
      }),
    },
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `Form Simplicity addTrans failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  const transactionId = extractFormSimplicityTransactionId(payload);
  if (!transactionId) {
    throw new Error(
      "Form Simplicity addTrans response did not include a transaction id",
    );
  }

  return {
    transactionId,
    rawResponse: payload,
    templateRefs: config.formTemplateRefs,
  };
}

export function buildSabalSignaturePayload(
  contractId: string,
  request: SabalSignatureRequest,
  transactionId: string,
  templateVersion: string,
): Record<string, unknown> {
  return {
    contractId,
    providerTransactionId: transactionId,
    templateVersion,
    packageName: request.packageName,
    recipients: request.recipients.map((recipient) => ({
      role: recipient.role,
      name: recipient.name,
      email: recipient.email,
    })),
  };
}

export async function createSabalSignatureEnvelope(
  contractId: string,
  request: SabalSignatureRequest,
  transactionId: string,
  templateVersion: string,
  config: ContractProviderConfig,
): Promise<SabalSignatureSubmissionResult> {
  const response = await fetch(
    `${config.sabalSignBaseUrl}/signature-requests`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.sabalSignApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        buildSabalSignaturePayload(
          contractId,
          request,
          transactionId,
          templateVersion,
        ),
      ),
    },
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `Sabal Sign create envelope failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  const envelopeId = extractSabalEnvelopeId(payload);
  if (!envelopeId) {
    throw new Error("Sabal Sign response did not include an envelope id");
  }

  return {
    envelopeId,
    rawResponse: payload,
  };
}

export function verifySabalWebhookSignature(
  headers: Headers,
  secret: string,
): boolean {
  const direct = headers.get("x-sabal-sign-signature");
  if (direct === secret) return true;

  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length) === secret;
  }

  return false;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeSabalWebhookPayload(
  payload: unknown,
): NormalizedSabalWebhookEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const rawEvent = asOptionalString(record.event) ?? asOptionalString(record.status);
  if (
    rawEvent !== "sent" &&
    rawEvent !== "viewed" &&
    rawEvent !== "signed" &&
    rawEvent !== "declined"
  ) {
    return null;
  }

  return {
    contractId: asOptionalString(record.contractId),
    envelopeId:
      asOptionalString(record.envelopeId) ??
      asOptionalString(record.signatureRequestId),
    providerEventId:
      asOptionalString(record.eventId) ??
      asOptionalString(record.webhookEventId),
    event: rawEvent,
    signerEmail: asOptionalString(record.signerEmail),
    signedPdfUrl: asOptionalString(record.signedPdfUrl),
    signedPdfBase64: asOptionalString(record.signedPdfBase64),
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : undefined,
  };
}

export async function storeSignedPdfFromWebhook(
  ctx: {
    storage: {
      store(blob: Blob): Promise<Id<"_storage">>;
    };
  },
  event: NormalizedSabalWebhookEvent,
): Promise<Id<"_storage"> | undefined> {
  if (event.signedPdfBase64) {
    const buffer = Buffer.from(event.signedPdfBase64, "base64");
    const blob = new Blob([buffer], { type: "application/pdf" });
    return await ctx.storage.store(blob);
  }

  if (event.signedPdfUrl) {
    const response = await fetch(event.signedPdfUrl);
    if (!response.ok) {
      throw new Error(
        `Signed PDF download failed (${response.status}) for ${event.signedPdfUrl}`,
      );
    }
    const blob = await response.blob();
    return await ctx.storage.store(blob);
  }

  return undefined;
}
