import { describe, expect, it } from "vitest";
import {
  runEnrichmentJob,
  stubAdapters,
  type EnrichmentFetchAdapters,
} from "@/lib/ai/engines/enrichmentWorker";
import type { BrowserUseFallbackResult } from "@/lib/enrichment/types";

function adaptersWithFallback(
  override: Partial<EnrichmentFetchAdapters> = {},
): EnrichmentFetchAdapters {
  return {
    ...stubAdapters,
    async browserUseFallback({ propertyId, sourceUrl, portal, reason }) {
      const result: BrowserUseFallbackResult = {
        sourceUrl,
        portal,
        canonicalFields: {
          listPrice: 500_000,
          beds: 3,
          baths: 2,
        },
        confidence: 0.82,
        evidence: [
          { kind: "screenshot", url: "s3://bucket/screenshots/a.png" },
        ],
        reason,
        capturedAt: "2026-04-12T12:05:00Z",
      };
      return {
        result,
        citation: `browser-use://${portal}/${propertyId}`,
      };
    },
    ...override,
  };
}

describe("enrichmentWorker — browser_use_fallback", () => {
  it("dispatches to the browserUseFallback adapter on success", async () => {
    const outcome = await runEnrichmentJob(
      {
        propertyId: "p1",
        source: "browser_use_fallback",
        context: {
          sourceUrl: "https://zillow.com/homedetails/999",
          portal: "zillow",
          reason: "parser_schema_drift",
        },
      },
      adaptersWithFallback(),
    );

    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.result.source).toBe("browser_use_fallback");
      expect(outcome.result.propertyId).toBe("p1");
      const payload = outcome.result.payload as { result: BrowserUseFallbackResult };
      expect(payload.result.reason).toBe("parser_schema_drift");
      expect(payload.result.canonicalFields.listPrice).toBe(500_000);
    }
  });

  it("accepts 'unknown' as a portal value for unsupported portals", async () => {
    const outcome = await runEnrichmentJob(
      {
        propertyId: "p1",
        source: "browser_use_fallback",
        context: {
          sourceUrl: "https://other.com/listing",
          portal: "unknown",
          reason: "unsupported_portal",
        },
      },
      adaptersWithFallback(),
    );
    expect(outcome.kind).toBe("success");
  });

  it("returns parse_error when context.sourceUrl is missing", async () => {
    const outcome = await runEnrichmentJob(
      {
        propertyId: "p1",
        source: "browser_use_fallback",
        context: { portal: "zillow", reason: "parser_schema_drift" },
      },
      adaptersWithFallback(),
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.error.code).toBe("parse_error");
    }
  });

  it("returns parse_error when context.reason is not a valid FallbackReason", async () => {
    const outcome = await runEnrichmentJob(
      {
        propertyId: "p1",
        source: "browser_use_fallback",
        context: {
          sourceUrl: "https://zillow.com/homedetails/1",
          portal: "zillow",
          reason: "totally_made_up_reason",
        },
      },
      adaptersWithFallback(),
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.error.code).toBe("parse_error");
    }
  });

  it("returns parse_error when context.portal is invalid", async () => {
    const outcome = await runEnrichmentJob(
      {
        propertyId: "p1",
        source: "browser_use_fallback",
        context: {
          sourceUrl: "https://zillow.com/homedetails/1",
          portal: "bogus",
          reason: "parser_schema_drift",
        },
      },
      adaptersWithFallback(),
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.error.code).toBe("parse_error");
    }
  });

  it("stubAdapters.browserUseFallback throws not_found by default", async () => {
    const outcome = await runEnrichmentJob(
      {
        propertyId: "p1",
        source: "browser_use_fallback",
        context: {
          sourceUrl: "https://zillow.com/homedetails/1",
          portal: "zillow",
          reason: "parser_schema_drift",
        },
      },
      stubAdapters,
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.error.code).toBe("not_found");
      expect(outcome.error.source).toBe("browser_use_fallback");
    }
  });

  it("forwards network errors as retryable failures", async () => {
    const adapters = adaptersWithFallback({
      async browserUseFallback() {
        const err = new Error("ECONNRESET") as Error & { code?: string };
        err.code = "ECONNRESET";
        throw err;
      },
    });
    const outcome = await runEnrichmentJob(
      {
        propertyId: "p1",
        source: "browser_use_fallback",
        context: {
          sourceUrl: "https://zillow.com/homedetails/1",
          portal: "zillow",
          reason: "parser_schema_drift",
        },
      },
      adapters,
    );
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.error.retryable).toBe(true);
    }
  });
});
