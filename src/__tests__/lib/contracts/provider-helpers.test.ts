import { describe, expect, it } from "vitest";
import {
  buildSabalSignaturePayload,
  extractFormSimplicityTransactionId,
  extractSabalEnvelopeId,
  normalizeSabalWebhookPayload,
  readContractProviderConfig,
  verifySabalWebhookSignature,
} from "../../../../convex/lib/contractProviders";

describe("readContractProviderConfig", () => {
  it("reports missing provider configuration explicitly", () => {
    const result = readContractProviderConfig({});
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected missing configuration result");
    }
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "FORM_SIMPLICITY_CLIENT_ID",
        "FORM_SIMPLICITY_CLIENT_SECRET",
        "SABAL_SIGN_API_KEY",
      ]),
    );
  });
});

describe("Form Simplicity helpers", () => {
  it("extracts a transaction id from nested response payloads", () => {
    const transactionId = extractFormSimplicityTransactionId([
      {
        data: [{ transId: "fs-trans-123" }],
      },
    ]);

    expect(transactionId).toBe("fs-trans-123");
  });
});

describe("Sabal Sign helpers", () => {
  it("builds the signature payload from the contract handoff context", () => {
    const payload = buildSabalSignaturePayload(
      "contract-1",
      {
        packageName: "123 Main St",
        recipients: [
          { role: "buyer", name: "John Buyer", email: "john@example.com" },
        ],
      },
      "fs-trans-123",
      "2026-01",
    );

    expect(payload).toMatchObject({
      contractId: "contract-1",
      providerTransactionId: "fs-trans-123",
      templateVersion: "2026-01",
      packageName: "123 Main St",
    });
  });

  it("extracts an envelope id from common response shapes", () => {
    const envelopeId = extractSabalEnvelopeId({
      signatureRequestId: "env-123",
    });

    expect(envelopeId).toBe("env-123");
  });

  it("normalizes webhook payloads into persisted event state", () => {
    const event = normalizeSabalWebhookPayload({
      event: "signed",
      envelopeId: "env-123",
      signerEmail: "john@example.com",
      signedPdfUrl: "https://example.com/contract.pdf",
      metadata: { attempt: 1 },
    });

    expect(event).toEqual({
      contractId: undefined,
      envelopeId: "env-123",
      providerEventId: undefined,
      event: "signed",
      signerEmail: "john@example.com",
      signedPdfUrl: "https://example.com/contract.pdf",
      signedPdfBase64: undefined,
      metadata: { attempt: 1 },
    });
  });

  it("verifies webhook signatures from either direct or bearer headers", () => {
    const directHeaders = new Headers({
      "x-sabal-sign-signature": "secret-123",
    });
    const bearerHeaders = new Headers({
      authorization: "Bearer secret-123",
    });

    expect(verifySabalWebhookSignature(directHeaders, "secret-123")).toBe(true);
    expect(verifySabalWebhookSignature(bearerHeaders, "secret-123")).toBe(true);
    expect(verifySabalWebhookSignature(new Headers(), "secret-123")).toBe(false);
  });
});
