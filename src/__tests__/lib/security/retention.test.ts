import { describe, it, expect } from "vitest";
import { isPastRetention, RETENTION_POLICIES } from "@/lib/security/retention";

describe("RETENTION_POLICIES", () => {
  it("has permanent retention for audit", () => {
    expect(RETENTION_POLICIES.audit.retentionDays).toBe("permanent");
  });

  it("has 7-year retention for legal documents", () => {
    expect(RETENTION_POLICIES.legal_documents.retentionDays).toBe(2555);
  });

  it("has 3-year retention for buyer data", () => {
    expect(RETENTION_POLICIES.buyer_data.retentionDays).toBe(1095);
  });

  it("has 1-year retention for AI outputs", () => {
    expect(RETENTION_POLICIES.ai_outputs.retentionDays).toBe(365);
  });

  it("requires soft delete for financial records", () => {
    expect(RETENTION_POLICIES.financial.softDeleteFirst).toBe(true);
  });
});

describe("isPastRetention", () => {
  it("returns false for permanent categories", () => {
    expect(isPastRetention("audit", new Date("2020-01-01"))).toBe(false);
  });

  it("returns false for recent records", () => {
    expect(isPastRetention("buyer_data", new Date())).toBe(false);
  });

  it("returns true for records past retention period", () => {
    const fourYearsAgo = new Date();
    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
    expect(isPastRetention("buyer_data", fourYearsAgo)).toBe(true);
  });

  it("returns false for unknown categories", () => {
    expect(isPastRetention("unknown_category", new Date("2020-01-01"))).toBe(false);
  });

  it("returns false for records within retention period", () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    expect(isPastRetention("legal_documents", oneYearAgo)).toBe(false);
  });

  it("returns true for expired AI outputs", () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    expect(isPastRetention("ai_outputs", twoYearsAgo)).toBe(true);
  });
});
