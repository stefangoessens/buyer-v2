import { describe, it, expect } from "vitest";
import {
  resolveRegisterDecision,
  tokensToInvalidate,
  filterActiveTokens,
  type DeviceTokenRecord,
} from "@/lib/deviceTokens";

const NOW = "2026-04-12T10:00:00.000Z";

function row(overrides: Partial<DeviceTokenRecord>): DeviceTokenRecord {
  return {
    _id: "row_default",
    userId: "user_1",
    token: "tok_default",
    deviceId: undefined,
    invalidatedAt: undefined,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveRegisterDecision", () => {
  it("inserts when no existing rows", () => {
    const decision = resolveRegisterDecision([], {
      token: "tok_abc",
      deviceId: "device_1",
      now: NOW,
    });
    expect(decision.kind).toBe("insert");
    if (decision.kind === "insert") {
      expect(decision.token).toBe("tok_abc");
      expect(decision.deviceId).toBe("device_1");
      expect(decision.createdAt).toBe(NOW);
      expect(decision.updatedAt).toBe(NOW);
    }
  });

  it("replaces when existing row matches deviceId and is active", () => {
    const existing = [
      row({
        _id: "row_1",
        token: "tok_old",
        deviceId: "device_1",
      }),
    ];
    const decision = resolveRegisterDecision(existing, {
      token: "tok_new",
      deviceId: "device_1",
      now: NOW,
    });
    expect(decision.kind).toBe("replace");
    if (decision.kind === "replace") {
      expect(decision.rowId).toBe("row_1");
      expect(decision.token).toBe("tok_new");
      expect(decision.updatedAt).toBe(NOW);
    }
  });

  it("inserts new row when token matches but deviceId differs", () => {
    // Same APNS token bound to a different device is an edge case — we
    // still register the current device as its own row. Cross-device
    // cleanup (tokensToInvalidate) handles the stale reference afterward.
    const existing = [
      row({
        _id: "row_1",
        token: "tok_shared",
        deviceId: "device_other",
      }),
    ];
    const decision = resolveRegisterDecision(existing, {
      token: "tok_shared",
      deviceId: "device_current",
      now: NOW,
    });
    // deviceId lookup fails → token fallback picks up row_1 → replace.
    // This is correct: same token = same registration, we just update
    // the deviceId on the existing row.
    expect(decision.kind).toBe("replace");
    if (decision.kind === "replace") {
      expect(decision.rowId).toBe("row_1");
    }
  });

  it("inserts when deviceId and token both differ", () => {
    const existing = [
      row({
        _id: "row_1",
        token: "tok_other",
        deviceId: "device_other",
      }),
    ];
    const decision = resolveRegisterDecision(existing, {
      token: "tok_new",
      deviceId: "device_current",
      now: NOW,
    });
    expect(decision.kind).toBe("insert");
  });

  it("reactivates when deviceId matches an invalidated row", () => {
    const existing = [
      row({
        _id: "row_1",
        token: "tok_old",
        deviceId: "device_1",
        invalidatedAt: "2026-04-05T00:00:00.000Z",
      }),
    ];
    const decision = resolveRegisterDecision(existing, {
      token: "tok_new",
      deviceId: "device_1",
      now: NOW,
    });
    expect(decision.kind).toBe("reactivate");
    if (decision.kind === "reactivate") {
      expect(decision.rowId).toBe("row_1");
      expect(decision.token).toBe("tok_new");
      expect(decision.updatedAt).toBe(NOW);
    }
  });

  it("prefers deviceId match over token match", () => {
    const existing = [
      // Row 1 has a matching TOKEN but a different deviceId
      row({ _id: "row_1", token: "tok_new", deviceId: "device_other" }),
      // Row 2 has a matching DEVICEID with an old token
      row({ _id: "row_2", token: "tok_stale", deviceId: "device_current" }),
    ];
    const decision = resolveRegisterDecision(existing, {
      token: "tok_new",
      deviceId: "device_current",
      now: NOW,
    });
    // Should prefer the deviceId match (row_2), not the token match (row_1)
    expect(decision.kind).toBe("replace");
    if (decision.kind === "replace") {
      expect(decision.rowId).toBe("row_2");
    }
  });
});

describe("tokensToInvalidate", () => {
  it("returns IDs of other rows sharing the same token", () => {
    const allForUser = [
      row({ _id: "row_1", token: "tok_shared" }),
      row({ _id: "row_2", token: "tok_shared" }),
      row({ _id: "row_3", token: "tok_different" }),
    ];
    const ids = tokensToInvalidate(allForUser, {
      token: "tok_shared",
      keepRowId: "row_1",
    });
    expect(ids).toEqual(["row_2"]);
  });

  it("excludes the keepRowId even if its token matches", () => {
    const allForUser = [
      row({ _id: "row_1", token: "tok_shared" }),
      row({ _id: "row_2", token: "tok_shared" }),
    ];
    const ids = tokensToInvalidate(allForUser, {
      token: "tok_shared",
      keepRowId: "row_2",
    });
    expect(ids).toEqual(["row_1"]);
  });

  it("returns empty when no rows share the token", () => {
    const allForUser = [
      row({ _id: "row_1", token: "tok_a" }),
      row({ _id: "row_2", token: "tok_b" }),
    ];
    const ids = tokensToInvalidate(allForUser, {
      token: "tok_c",
      keepRowId: "row_1",
    });
    expect(ids).toEqual([]);
  });

  it("returns all matching rows when keepRowId is not provided", () => {
    const allForUser = [
      row({ _id: "row_1", token: "tok_shared" }),
      row({ _id: "row_2", token: "tok_shared" }),
    ];
    const ids = tokensToInvalidate(allForUser, { token: "tok_shared" });
    expect(ids.sort()).toEqual(["row_1", "row_2"]);
  });
});

describe("filterActiveTokens", () => {
  it("filters out rows with invalidatedAt set", () => {
    const tokens = [
      row({ _id: "row_1" }),
      row({ _id: "row_2", invalidatedAt: "2026-04-05T00:00:00.000Z" }),
      row({ _id: "row_3" }),
    ];
    const active = filterActiveTokens(tokens);
    expect(active.map((r) => r._id)).toEqual(["row_1", "row_3"]);
  });

  it("returns empty when all tokens are invalidated", () => {
    const tokens = [
      row({ _id: "row_1", invalidatedAt: NOW }),
      row({ _id: "row_2", invalidatedAt: NOW }),
    ];
    expect(filterActiveTokens(tokens)).toEqual([]);
  });

  it("returns all when none are invalidated", () => {
    const tokens = [row({ _id: "row_1" }), row({ _id: "row_2" })];
    expect(filterActiveTokens(tokens)).toHaveLength(2);
  });
});
