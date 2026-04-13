import { describe, expect, it } from "vitest";
import {
  ESCALATION_SKIP_LABELS,
  buildFallbackDedupeKey,
  decideEscalation,
  errorCodeToFallbackReason,
} from "@/lib/enrichment/fallback";
import {
  FALLBACK_REASONS,
  FALLBACK_REASON_LABELS,
} from "@/lib/enrichment/types";

const NOW = new Date("2026-04-12T12:00:00Z");

function baseInput(overrides = {}) {
  return {
    propertyId: "p1",
    sourceUrl: "https://zillow.com/homedetails/123",
    portal: "zillow" as const,
    extractorErrorCode: "parse_error" as const,
    priorFallbackAttempts: 0,
    maxFallbackAttempts: 2,
    now: NOW,
    ...overrides,
  };
}

describe("enrichment/fallback", () => {
  describe("errorCodeToFallbackReason", () => {
    it("maps parse_error to parser_schema_drift", () => {
      expect(errorCodeToFallbackReason("parse_error")).toBe("parser_schema_drift");
    });

    it("maps rate_limited and unauthorized to anti_bot_block", () => {
      expect(errorCodeToFallbackReason("rate_limited")).toBe("anti_bot_block");
      expect(errorCodeToFallbackReason("unauthorized")).toBe("anti_bot_block");
    });

    it("maps network and timeout to vendor_unavailable", () => {
      expect(errorCodeToFallbackReason("network_error")).toBe("vendor_unavailable");
      expect(errorCodeToFallbackReason("timeout")).toBe("vendor_unavailable");
    });

    it("returns null for not_found and unknown — never auto-escalates", () => {
      expect(errorCodeToFallbackReason("not_found")).toBeNull();
      expect(errorCodeToFallbackReason("unknown")).toBeNull();
    });
  });

  describe("decideEscalation — auto path", () => {
    it("escalates parse_error → parser_schema_drift", () => {
      const decision = decideEscalation(baseInput());
      expect(decision.eligible).toBe(true);
      if (decision.eligible) {
        expect(decision.fallbackReason).toBe("parser_schema_drift");
        expect(decision.dedupeKey).toContain("p1");
        expect(decision.dedupeKey).toContain("browser_use_fallback");
      }
    });

    it("escalates anti-bot block via rate_limited", () => {
      const decision = decideEscalation(
        baseInput({ extractorErrorCode: "rate_limited" }),
      );
      expect(decision.eligible).toBe(true);
      if (decision.eligible) {
        expect(decision.fallbackReason).toBe("anti_bot_block");
      }
    });

    it("does NOT escalate not_found", () => {
      const decision = decideEscalation(
        baseInput({ extractorErrorCode: "not_found" }),
      );
      expect(decision.eligible).toBe(false);
      if (!decision.eligible) {
        expect(decision.skipReason).toContain("no_mapping_for_error_code");
        expect(decision.skipReason).toContain("not_found");
      }
    });

    it("does NOT escalate unknown", () => {
      const decision = decideEscalation(
        baseInput({ extractorErrorCode: "unknown" }),
      );
      expect(decision.eligible).toBe(false);
    });
  });

  describe("decideEscalation — attempt cap", () => {
    it("stops escalating after maxFallbackAttempts", () => {
      const decision = decideEscalation(
        baseInput({ priorFallbackAttempts: 2, maxFallbackAttempts: 2 }),
      );
      expect(decision.eligible).toBe(false);
      if (!decision.eligible) {
        expect(decision.skipReason).toBe("max_fallback_attempts_exceeded");
      }
    });

    it("still allows the final attempt at the cap boundary", () => {
      const decision = decideEscalation(
        baseInput({ priorFallbackAttempts: 1, maxFallbackAttempts: 2 }),
      );
      expect(decision.eligible).toBe(true);
    });
  });

  describe("decideEscalation — manual override", () => {
    it("escalates with manual_override reason even on not_found", () => {
      const decision = decideEscalation(
        baseInput({
          extractorErrorCode: "not_found",
          manualOverride: true,
        }),
      );
      expect(decision.eligible).toBe(true);
      if (decision.eligible) {
        expect(decision.fallbackReason).toBe("manual_override");
      }
    });

    it("manual override does NOT bypass the attempt cap", () => {
      const decision = decideEscalation(
        baseInput({
          manualOverride: true,
          priorFallbackAttempts: 2,
          maxFallbackAttempts: 2,
        }),
      );
      expect(decision.eligible).toBe(false);
    });
  });

  describe("decideEscalation — unsupported portal", () => {
    it("escalates with unsupported_portal reason", () => {
      const decision = decideEscalation(
        baseInput({
          portal: "unknown",
          unsupportedPortal: true,
          extractorErrorCode: "unknown",
        }),
      );
      expect(decision.eligible).toBe(true);
      if (decision.eligible) {
        expect(decision.fallbackReason).toBe("unsupported_portal");
      }
    });
  });

  describe("buildFallbackDedupeKey", () => {
    it("is deterministic for the same inputs", () => {
      const a = buildFallbackDedupeKey("p1", "https://a.com/x", 0, NOW);
      const b = buildFallbackDedupeKey("p1", "https://a.com/x", 0, NOW);
      expect(a).toBe(b);
    });

    it("differs per-URL", () => {
      const a = buildFallbackDedupeKey("p1", "https://a.com/x", 0, NOW);
      const b = buildFallbackDedupeKey("p1", "https://a.com/y", 0, NOW);
      expect(a).not.toBe(b);
    });

    it("differs per-attempt — successive retries get fresh keys", () => {
      const a = buildFallbackDedupeKey("p1", "https://a.com/x", 0, NOW);
      const b = buildFallbackDedupeKey("p1", "https://a.com/x", 1, NOW);
      expect(a).not.toBe(b);
    });

    it("stays stable within the same hour bucket", () => {
      const early = new Date("2026-04-12T12:15:00Z");
      const late = new Date("2026-04-12T12:45:00Z");
      const a = buildFallbackDedupeKey("p1", "https://a.com/x", 0, early);
      const b = buildFallbackDedupeKey("p1", "https://a.com/x", 0, late);
      expect(a).toBe(b);
    });

    it("rolls over at hour boundaries", () => {
      const before = new Date("2026-04-12T12:59:00Z");
      const after = new Date("2026-04-12T13:01:00Z");
      const a = buildFallbackDedupeKey("p1", "https://a.com/x", 0, before);
      const b = buildFallbackDedupeKey("p1", "https://a.com/x", 0, after);
      expect(a).not.toBe(b);
    });
  });

  describe("labels", () => {
    it("exposes a label for every fallback reason", () => {
      for (const reason of FALLBACK_REASONS) {
        expect(FALLBACK_REASON_LABELS[reason]).toBeDefined();
        expect(FALLBACK_REASON_LABELS[reason]!.length).toBeGreaterThan(0);
      }
    });

    it("exposes labels for the standard skip reasons", () => {
      expect(ESCALATION_SKIP_LABELS["max_fallback_attempts_exceeded"]).toBeDefined();
      expect(ESCALATION_SKIP_LABELS["no_mapping_for_error_code:not_found"]).toBeDefined();
    });
  });
});
