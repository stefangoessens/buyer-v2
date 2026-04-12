import { describe, it, expect } from "vitest";
import { validateLaunchEvent } from "@/lib/launchEvents/validator";
import { LAUNCH_EVENT_CONTRACT } from "@/lib/launchEvents/contract";
import type { LaunchEventContract } from "@/lib/launchEvents/types";

// MARK: - Test contract fixture

/**
 * Minimal contract fixture exercising every prop type + constraint
 * the validator supports. Used by the unit tests so they don't
 * have to track the real launch contract's drift over time.
 */
const TEST_CONTRACT: LaunchEventContract = {
  version: "1.0.0-test",
  lastUpdated: "2026-04-12",
  events: {
    sample: {
      name: "sample",
      category: "public_site",
      description: "Test event",
      owner: "test",
      introducedIn: "1.0.0-test",
      props: {
        id: { type: "string", required: true, description: "id" },
        count: {
          type: "integer",
          required: true,
          description: "count",
          min: 0,
          max: 100,
        },
        ratio: {
          type: "number",
          required: true,
          description: "ratio",
          min: 0,
          max: 1,
        },
        enabled: { type: "boolean", required: true, description: "flag" },
        mode: {
          type: "enum",
          required: true,
          description: "mode",
          enumValues: ["a", "b", "c"],
        },
        note: {
          type: "string",
          required: false,
          description: "optional note",
        },
      },
    },
  },
};

// MARK: - Unknown event

describe("validateLaunchEvent — unknown event", () => {
  it("rejects an event name that isn't in the contract", () => {
    const result = validateLaunchEvent(
      "nonexistent",
      {},
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.kind).toBe("unknownEvent");
    }
  });
});

// MARK: - Required props

describe("validateLaunchEvent — required props", () => {
  const validPayload = {
    id: "abc",
    count: 5,
    ratio: 0.5,
    enabled: true,
    mode: "a",
  };

  it("accepts a payload with every required prop present", () => {
    expect(
      validateLaunchEvent("sample", validPayload, TEST_CONTRACT).ok
    ).toBe(true);
  });

  it("rejects a payload missing a required string", () => {
    const { id: _id, ...rest } = validPayload;
    void _id;
    const result = validateLaunchEvent("sample", rest, TEST_CONTRACT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "missingRequiredProp" && e.prop === "id"
        )
      ).toBe(true);
    }
  });

  it("rejects a payload where a required prop is null", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...validPayload, id: null },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "missingRequiredProp")
      ).toBe(true);
    }
  });

  it("treats an undefined optional prop as fine", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...validPayload, note: undefined },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(true);
  });

  it("reports every missing required prop, not just the first", () => {
    const result = validateLaunchEvent("sample", {}, TEST_CONTRACT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const missing = result.errors.filter(
        (e) => e.kind === "missingRequiredProp"
      );
      expect(missing.length).toBeGreaterThanOrEqual(5);
    }
  });
});

// MARK: - Type checks

describe("validateLaunchEvent — type checks", () => {
  const baseline = {
    id: "abc",
    count: 5,
    ratio: 0.5,
    enabled: true,
    mode: "a",
  };

  it("rejects a string value on a number prop", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, ratio: "half" as unknown as number },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "wrongType" && e.prop === "ratio"
        )
      ).toBe(true);
    }
  });

  it("rejects a non-integer numeric value on an integer prop", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, count: 5.5 },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "integerExpected")
      ).toBe(true);
    }
  });

  it("rejects out-of-range numeric values", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, ratio: 2 },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "outOfRange" && e.prop === "ratio")
      ).toBe(true);
    }
  });

  it("rejects below-min integer values", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, count: -1 },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "outOfRange")).toBe(true);
    }
  });

  it("rejects a number on a boolean prop", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, enabled: 1 as unknown as boolean },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "wrongType" && e.prop === "enabled"
        )
      ).toBe(true);
    }
  });

  it("rejects a number on a string prop", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, id: 123 as unknown as string },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "wrongType" && e.prop === "id"
        )
      ).toBe(true);
    }
  });

  it("rejects a non-string value on an enum prop", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, mode: 1 as unknown as string },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "wrongType" && e.prop === "mode"
        )
      ).toBe(true);
    }
  });

  it("rejects an enum string not in the allow-list", () => {
    const result = validateLaunchEvent(
      "sample",
      { ...baseline, mode: "z" },
      TEST_CONTRACT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "invalidEnumValue")
      ).toBe(true);
    }
  });
});

// MARK: - Codex regressions from PR #73

/**
 * codex P1 finding: `typeof NaN === "number"` so the original
 * validator accepted NaN for numeric/integer props, and the
 * numeric-range helper early-returned on NaN as "skip." Dispatching
 * NaN to PostHog / BI typically coerces to null and silently breaks
 * dashboards. The validator now emits `notANumber`.
 */
describe("validateLaunchEvent — NaN rejection (codex P1)", () => {
  it("rejects NaN on a number prop", () => {
    const result = validateLaunchEvent(
      "pricing_panel_viewed",
      {
        dealRoomId: "dr_1",
        propertyId: "p_1",
        overallConfidence: Number.NaN,
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "notANumber")
      ).toBe(true);
    }
  });

  it("rejects NaN on an integer prop", () => {
    const result = validateLaunchEvent("offer_submitted", {
      offerId: "o_1",
      dealRoomId: "dr_1",
      offerPrice: Number.NaN,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "notANumber")
      ).toBe(true);
    }
  });

  it("does not emit both wrongType and notANumber for the same NaN prop", () => {
    const result = validateLaunchEvent(
      "pricing_panel_viewed",
      {
        dealRoomId: "dr_1",
        propertyId: "p_1",
        overallConfidence: Number.NaN,
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const numericErrors = result.errors.filter(
        (e) => e.kind === "notANumber" || e.kind === "wrongType"
      );
      // Exactly one — notANumber only.
      expect(numericErrors).toHaveLength(1);
      expect(numericErrors[0]?.kind).toBe("notANumber");
    }
  });
});

/**
 * codex P2 finding: the original validator iterated only over
 * declared props, so undeclared keys in the payload were silently
 * dispatched. A contract-controlled schema means undeclared keys
 * are schema drift and must be rejected.
 */
describe("validateLaunchEvent — undeclared prop rejection (codex P2)", () => {
  it("rejects an undeclared property on a contract event", () => {
    const result = validateLaunchEvent("link_pasted", {
      url: "https://zillow.com/1",
      source: "home",
      userEmail: "alice@example.com", // undeclared — schema drift
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "undeclaredProp" && e.prop === "userEmail"
        )
      ).toBe(true);
    }
  });

  it("allows undefined values on undeclared keys (JS ergonomics)", () => {
    // `{ ...spread, extra: undefined }` is a common JS pattern and
    // should not fire a drift error.
    const result = validateLaunchEvent("link_pasted", {
      url: "https://zillow.com/1",
      source: "home",
      extra: undefined,
    });
    expect(result.ok).toBe(true);
  });

  it("reports multiple undeclared props in one pass", () => {
    const result = validateLaunchEvent("link_pasted", {
      url: "https://zillow.com/1",
      source: "home",
      one: 1,
      two: 2,
      three: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const undeclared = result.errors.filter(
        (e) => e.kind === "undeclaredProp"
      );
      expect(undeclared).toHaveLength(3);
    }
  });
});

// MARK: - Real contract

describe("validateLaunchEvent — real LAUNCH_EVENT_CONTRACT", () => {
  it("accepts a well-formed link_pasted payload", () => {
    const result = validateLaunchEvent("link_pasted", {
      url: "https://zillow.com/home/123",
      source: "home",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects link_pasted with an unknown source enum value", () => {
    const result = validateLaunchEvent("link_pasted", {
      url: "https://zillow.com/home/123",
      source: "email",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "invalidEnumValue")
      ).toBe(true);
    }
  });

  it("rejects link_pasted without a required prop", () => {
    const result = validateLaunchEvent("link_pasted", {
      source: "home",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "missingRequiredProp" && e.prop === "url"
        )
      ).toBe(true);
    }
  });

  it("rejects deal_room_entered with an invalid accessLevel", () => {
    const result = validateLaunchEvent("deal_room_entered", {
      dealRoomId: "dr_1",
      propertyId: "p_1",
      accessLevel: "root",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts deal_room_entered with every required prop", () => {
    const result = validateLaunchEvent("deal_room_entered", {
      dealRoomId: "dr_1",
      propertyId: "p_1",
      accessLevel: "registered",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects offer_submitted with a non-integer offerPrice", () => {
    const result = validateLaunchEvent("offer_submitted", {
      offerId: "o_1",
      dealRoomId: "dr_1",
      offerPrice: 499_000.5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "integerExpected")
      ).toBe(true);
    }
  });

  it("rejects offer_submitted with a negative offerPrice", () => {
    const result = validateLaunchEvent("offer_submitted", {
      offerId: "o_1",
      dealRoomId: "dr_1",
      offerPrice: -1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "outOfRange")
      ).toBe(true);
    }
  });

  it("accepts pricing_panel_viewed with a 0..1 confidence", () => {
    const result = validateLaunchEvent("pricing_panel_viewed", {
      dealRoomId: "dr_1",
      propertyId: "p_1",
      overallConfidence: 0.87,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects pricing_panel_viewed with out-of-range confidence", () => {
    const result = validateLaunchEvent("pricing_panel_viewed", {
      dealRoomId: "dr_1",
      propertyId: "p_1",
      overallConfidence: 1.5,
    });
    expect(result.ok).toBe(false);
  });
});
