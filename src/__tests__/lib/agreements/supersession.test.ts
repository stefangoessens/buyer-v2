import { describe, it, expect } from "vitest";
import {
  walkChain,
  buildChains,
  resolveCurrentGoverning,
  findChainContaining,
  isSuperseded,
  getDirectSuccessor,
  SUPERSESSION_REASONS,
  type AgreementRecord,
} from "@/lib/agreements/supersession";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

function agreement(
  overrides: Partial<AgreementRecord> & { _id: string },
): AgreementRecord {
  return {
    buyerId: "buyer_1",
    type: "tour_pass",
    status: "signed",
    signedAt: "2028-01-01T12:00:00Z",
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// walkChain
// ───────────────────────────────────────────────────────────────────────────

describe("walkChain", () => {
  it("walks a single-node chain", () => {
    const a = agreement({ _id: "a1" });
    const result = walkChain(a, [a]);
    expect(result.depth).toBe(1);
    expect(result.head).toBe(a);
    expect(result.tail).toBe(a);
    expect(result.lineage).toEqual([a]);
  });

  it("walks a two-node chain", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2" });
    const result = walkChain(a, [a, b]);
    expect(result.depth).toBe(2);
    expect(result.head._id).toBe("a1");
    expect(result.tail._id).toBe("a2");
    expect(result.lineage.map((x) => x._id)).toEqual(["a1", "a2"]);
  });

  it("walks a three-node chain", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2", replacedById: "a3" });
    const c = agreement({ _id: "a3" });
    const result = walkChain(a, [a, b, c]);
    expect(result.depth).toBe(3);
    expect(result.lineage.map((x) => x._id)).toEqual(["a1", "a2", "a3"]);
  });

  it("defensively handles a cycle", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2", replacedById: "a1" });
    const result = walkChain(a, [a, b]);
    expect(result.depth).toBeLessThanOrEqual(2);
    expect(result.lineage.map((x) => x._id)).toEqual(["a1", "a2"]);
  });

  it("stops at a dangling successor pointer", () => {
    const a = agreement({ _id: "a1", replacedById: "nonexistent" });
    const result = walkChain(a, [a]);
    expect(result.depth).toBe(1);
    expect(result.tail._id).toBe("a1");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// buildChains
// ───────────────────────────────────────────────────────────────────────────

describe("buildChains", () => {
  it("produces one chain per lineage", () => {
    const chainA = [
      agreement({ _id: "a1", replacedById: "a2" }),
      agreement({ _id: "a2" }),
    ];
    const chainB = [agreement({ _id: "b1" })];
    const chains = buildChains([...chainA, ...chainB]);
    expect(chains).toHaveLength(2);
  });

  it("identifies heads correctly (agreements not pointed to)", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2", replacedById: "a3" });
    const c = agreement({ _id: "a3" });
    const chains = buildChains([a, b, c]);
    expect(chains).toHaveLength(1);
    expect(chains[0].head._id).toBe("a1");
    expect(chains[0].tail._id).toBe("a3");
    expect(chains[0].depth).toBe(3);
  });

  it("handles multiple parallel chains for the same buyer", () => {
    // Chain 1: tour_pass → full_representation (upgrade)
    const tourPass = agreement({
      _id: "tp1",
      type: "tour_pass",
      replacedById: "fr1",
    });
    const fullRep = agreement({
      _id: "fr1",
      type: "full_representation",
    });
    // Chain 2: standalone newer tour_pass
    const tourPass2 = agreement({
      _id: "tp2",
      type: "tour_pass",
      signedAt: "2028-03-01T12:00:00Z",
    });
    const chains = buildChains([tourPass, fullRep, tourPass2]);
    expect(chains).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// resolveCurrentGoverning
// ───────────────────────────────────────────────────────────────────────────

describe("resolveCurrentGoverning", () => {
  it("returns null with no agreements", () => {
    expect(resolveCurrentGoverning([])).toBeNull();
  });

  it("returns null when nothing is signed", () => {
    const drafts = [
      agreement({ _id: "a1", status: "draft" }),
      agreement({ _id: "a2", status: "sent" }),
    ];
    expect(resolveCurrentGoverning(drafts)).toBeNull();
  });

  it("returns the terminal signed agreement in a chain", () => {
    const a = agreement({
      _id: "a1",
      type: "tour_pass",
      status: "replaced",
      replacedById: "a2",
    });
    const b = agreement({
      _id: "a2",
      type: "full_representation",
      status: "signed",
    });
    const result = resolveCurrentGoverning([a, b]);
    expect(result?._id).toBe("a2");
  });

  it("prefers full_representation over tour_pass", () => {
    const tourPass = agreement({
      _id: "tp1",
      type: "tour_pass",
      signedAt: "2028-03-01T12:00:00Z",
    });
    const fullRep = agreement({
      _id: "fr1",
      type: "full_representation",
      signedAt: "2028-01-01T12:00:00Z", // earlier, but preferred type
    });
    const result = resolveCurrentGoverning([tourPass, fullRep]);
    expect(result?._id).toBe("fr1");
  });

  it("prefers most recently signed within the same type", () => {
    const older = agreement({
      _id: "a1",
      type: "tour_pass",
      signedAt: "2028-01-01T12:00:00Z",
    });
    const newer = agreement({
      _id: "a2",
      type: "tour_pass",
      signedAt: "2028-03-01T12:00:00Z",
    });
    const result = resolveCurrentGoverning([older, newer]);
    expect(result?._id).toBe("a2");
  });

  it("ignores replaced predecessors and returns the chain tail", () => {
    const old1 = agreement({
      _id: "tp1",
      type: "tour_pass",
      status: "replaced",
      signedAt: "2028-01-01T12:00:00Z",
      replacedById: "fr1",
    });
    const current = agreement({
      _id: "fr1",
      type: "full_representation",
      status: "signed",
      signedAt: "2028-02-01T12:00:00Z",
    });
    const result = resolveCurrentGoverning([old1, current]);
    expect(result?._id).toBe("fr1");
  });

  it("handles a 3-deep chain correctly", () => {
    const v1 = agreement({
      _id: "v1",
      status: "replaced",
      replacedById: "v2",
    });
    const v2 = agreement({
      _id: "v2",
      status: "replaced",
      replacedById: "v3",
    });
    const v3 = agreement({
      _id: "v3",
      status: "signed",
      signedAt: "2028-03-01T12:00:00Z",
    });
    const result = resolveCurrentGoverning([v1, v2, v3]);
    expect(result?._id).toBe("v3");
  });

  it("returns null when the only signed agreement has been superseded by a canceled successor", () => {
    const a = agreement({
      _id: "a1",
      status: "replaced",
      replacedById: "a2",
    });
    const b = agreement({ _id: "a2", status: "canceled" });
    const result = resolveCurrentGoverning([a, b]);
    expect(result).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

describe("findChainContaining", () => {
  it("finds the chain containing a head agreement", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2" });
    const chain = findChainContaining("a1", [a, b]);
    expect(chain?.depth).toBe(2);
  });

  it("finds the chain containing a tail agreement", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2" });
    const chain = findChainContaining("a2", [a, b]);
    expect(chain?.depth).toBe(2);
  });

  it("returns null when the agreement doesn't exist", () => {
    const a = agreement({ _id: "a1" });
    expect(findChainContaining("missing", [a])).toBeNull();
  });
});

describe("isSuperseded", () => {
  it("returns true when something points at it", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2" });
    expect(isSuperseded("a1", [a, b])).toBe(true);
  });

  it("returns false for a chain tail", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2" });
    expect(isSuperseded("a2", [a, b])).toBe(false);
  });

  it("returns false for a standalone agreement", () => {
    const a = agreement({ _id: "a1" });
    expect(isSuperseded("a1", [a])).toBe(false);
  });
});

describe("getDirectSuccessor", () => {
  it("returns the direct successor", () => {
    const a = agreement({ _id: "a1", replacedById: "a2" });
    const b = agreement({ _id: "a2" });
    const successor = getDirectSuccessor("a1", [a, b]);
    expect(successor?._id).toBe("a2");
  });

  it("returns null when there is no successor", () => {
    const a = agreement({ _id: "a1" });
    expect(getDirectSuccessor("a1", [a])).toBeNull();
  });

  it("returns null when the agreement doesn't exist", () => {
    expect(getDirectSuccessor("missing", [])).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("SUPERSESSION_REASONS", () => {
  it("includes all expected reasons", () => {
    expect(SUPERSESSION_REASONS).toContain("upgrade_to_full_representation");
    expect(SUPERSESSION_REASONS).toContain("correction");
    expect(SUPERSESSION_REASONS).toContain("amendment");
    expect(SUPERSESSION_REASONS).toContain("renewal");
    expect(SUPERSESSION_REASONS).toContain("replace_expired");
    expect(SUPERSESSION_REASONS).toContain("broker_decision");
  });
});
