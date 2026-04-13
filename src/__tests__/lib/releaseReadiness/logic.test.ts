import { describe, it, expect } from "vitest";
import {
  buildReadinessState,
  canTransition,
  computeOverallReadiness,
  isIsoDate,
  summarizeChecklist,
  transitionStatus,
  validateChecklist,
  validateItem,
  writeReadinessItem,
} from "@/lib/releaseReadiness/logic";
import type {
  ReadinessItem,
  ReadinessItemInput,
  ReadinessItemSeverity,
  ReadinessItemStatus,
} from "@/lib/releaseReadiness/types";

// MARK: - Fixtures

function makeItem(overrides: Partial<ReadinessItem> = {}): ReadinessItem {
  return {
    id: "alpha",
    title: "Test readiness item",
    description: "A test readiness checklist entry.",
    owner: "ops",
    severity: "p0",
    status: "notStarted",
    targetDate: "2026-05-01",
    updatedAt: "2026-04-12T00:00:00Z",
    updatedBy: "stefang@buyerv2.com",
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<ReadinessItemInput> = {}
): ReadinessItemInput {
  const item = makeItem(overrides);
  const { updatedAt: _updatedAt, updatedBy: _updatedBy, ...input } = item;
  return input;
}

// MARK: - isIsoDate

describe("isIsoDate", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(isIsoDate("2026-05-01")).toBe(true);
  });

  it("accepts full ISO timestamps", () => {
    expect(isIsoDate("2026-05-01T12:00:00Z")).toBe(true);
    expect(isIsoDate("2026-05-01T12:00:00.123Z")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isIsoDate("05/01/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("tomorrow")).toBe(false);
  });

  it("rejects parses-but-invalid dates like 2026-13-40", () => {
    expect(isIsoDate("2026-13-40")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
  });
});

// MARK: - validateItem

describe("validateItem", () => {
  it("passes for a well-formed notStarted item", () => {
    expect(validateItem(makeItem()).ok).toBe(true);
  });

  it("requires id", () => {
    const result = validateItem(makeItem({ id: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "missingField" && e.field === "id"
        )
      ).toBe(true);
    }
  });

  it("requires owner", () => {
    const result = validateItem(makeItem({ owner: "  " }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "missingField" && e.field === "owner"
        )
      ).toBe(true);
    }
  });

  it("rejects empty title", () => {
    const result = validateItem(makeItem({ title: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.kind === "missingField" && e.field === "title"
        )
      ).toBe(true);
    }
  });

  it("rejects title shorter than 3 chars", () => {
    const result = validateItem(makeItem({ title: "ab" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "titleTooShort")
      ).toBe(true);
    }
  });

  it("rejects title longer than 120 chars", () => {
    const result = validateItem(makeItem({ title: "x".repeat(121) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "titleTooLong")
      ).toBe(true);
    }
  });

  it("rejects invalid ISO date in targetDate", () => {
    const result = validateItem(makeItem({ targetDate: "not-a-date" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "invalidTargetDate")
      ).toBe(true);
    }
  });

  it("requires blockerNote when status is blocked", () => {
    const result = validateItem(
      makeItem({ status: "blocked", blockerNote: undefined })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "missingBlockerNote")
      ).toBe(true);
    }
  });

  it("allows blocker note to flow through when status is blocked", () => {
    expect(
      validateItem(
        makeItem({
          status: "blocked",
          blockerNote: "Waiting on legal review of disclosures.",
        })
      ).ok
    ).toBe(true);
  });

  it("requires evidenceUrl when status is ready", () => {
    const result = validateItem(
      makeItem({ status: "ready", evidenceUrl: undefined })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "missingEvidenceForReady")
      ).toBe(true);
    }
  });

  it("passes ready item with evidence URL", () => {
    expect(
      validateItem(
        makeItem({
          status: "ready",
          evidenceUrl: "https://linear.app/kindservices/issue/KIN-846",
        })
      ).ok
    ).toBe(true);
  });

  it("collects multiple errors in one pass", () => {
    const result = validateItem(
      makeItem({
        title: "x",
        targetDate: "nope",
        status: "blocked",
        blockerNote: undefined,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// MARK: - validateChecklist

describe("validateChecklist", () => {
  it("passes for a well-formed list", () => {
    const list: ReadinessItem[] = [
      makeItem({ id: "a" }),
      makeItem({ id: "b" }),
      makeItem({ id: "c" }),
    ];
    expect(validateChecklist(list).ok).toBe(true);
  });

  it("detects duplicate ids", () => {
    const list: ReadinessItem[] = [
      makeItem({ id: "dupe" }),
      makeItem({ id: "dupe" }),
    ];
    const result = validateChecklist(list);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "duplicateId")).toBe(true);
    }
  });

  it("passes through per-item errors", () => {
    const list: ReadinessItem[] = [
      makeItem({ id: "a", title: "" }),
      makeItem({ id: "b" }),
    ];
    const result = validateChecklist(list);
    expect(result.ok).toBe(false);
  });
});

// MARK: - canTransition

describe("canTransition", () => {
  const matrix: Array<{
    from: ReadinessItemStatus;
    to: ReadinessItemStatus;
    allowed: boolean;
  }> = [
    { from: "notStarted", to: "inProgress", allowed: true },
    { from: "notStarted", to: "blocked", allowed: true },
    { from: "notStarted", to: "ready", allowed: false },
    { from: "inProgress", to: "ready", allowed: true },
    { from: "inProgress", to: "blocked", allowed: true },
    { from: "blocked", to: "inProgress", allowed: true },
    { from: "blocked", to: "ready", allowed: false },
    { from: "ready", to: "inProgress", allowed: true },
    { from: "ready", to: "notStarted", allowed: false },
    { from: "deferred", to: "inProgress", allowed: true },
    { from: "deferred", to: "ready", allowed: false },
    { from: "atRisk", to: "ready", allowed: true },
    { from: "atRisk", to: "inProgress", allowed: true },
    { from: "atRisk", to: "notStarted", allowed: false },
  ];

  for (const { from, to, allowed } of matrix) {
    it(`${from} → ${to} ${allowed ? "allowed" : "blocked"}`, () => {
      expect(canTransition(from, to)).toBe(allowed);
    });
  }

  it("allows a self-transition as a no-op", () => {
    expect(canTransition("inProgress", "inProgress")).toBe(true);
  });
});

// MARK: - transitionStatus

describe("transitionStatus", () => {
  it("returns a new item with updated status and timestamp", () => {
    const item = makeItem({ status: "notStarted" });
    const result = transitionStatus(
      item,
      "inProgress",
      "2026-04-15T12:00:00Z",
      "stefang@buyerv2.com"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.status).toBe("inProgress");
      expect(result.item.updatedAt).toBe("2026-04-15T12:00:00Z");
    }
  });

  it("rejects an illegal transition", () => {
    const item = makeItem({ status: "notStarted" });
    const result = transitionStatus(
      item,
      "ready",
      "2026-04-15T12:00:00Z",
      "stefang@buyerv2.com"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("illegalTransition");
      expect(result.error.from).toBe("notStarted");
      expect(result.error.to).toBe("ready");
    }
  });

  it("leaves the original item untouched (pure function)", () => {
    const item = makeItem({ status: "notStarted" });
    transitionStatus(item, "inProgress", "2026-04-15T12:00:00Z", "a");
    expect(item.status).toBe("notStarted");
  });
});

// MARK: - writeReadinessItem

describe("writeReadinessItem", () => {
  it("creates a new item from the shared write payload", () => {
    const result = writeReadinessItem(
      null,
      makeInput({
        id: " launch-checklist ",
        title: "  Final QA sweep  ",
        owner: "  ops  ",
      }),
      "2026-04-15T12:00:00Z",
      "stefang@buyerv2.com"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(true);
      expect(result.item.id).toBe("launch-checklist");
      expect(result.item.title).toBe("Final QA sweep");
      expect(result.item.owner).toBe("ops");
      expect(result.item.updatedBy).toBe("stefang@buyerv2.com");
    }
  });

  it("updates an existing item when the transition is legal", () => {
    const existing = makeItem({
      id: "beta",
      status: "inProgress",
      owner: "ops",
    });

    const result = writeReadinessItem(
      existing,
      makeInput({
        id: "beta",
        status: "ready",
        evidenceUrl: "https://example.com/pr/123",
        owner: "launch-ops",
      }),
      "2026-04-16T09:00:00Z",
      "launch@buyerv2.com"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(false);
      expect(result.item.status).toBe("ready");
      expect(result.item.owner).toBe("launch-ops");
      expect(result.item.evidenceUrl).toBe("https://example.com/pr/123");
      expect(result.item.updatedAt).toBe("2026-04-16T09:00:00Z");
    }
  });

  it("rejects blocked items without a blocker note", () => {
    const result = writeReadinessItem(
      null,
      makeInput({
        id: "gamma",
        status: "blocked",
        blockerNote: "   ",
      }),
      "2026-04-15T12:00:00Z",
      "stefang@buyerv2.com"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      if (result.error.kind === "validation") {
        expect(
          result.error.errors.some(
            (error) => error.kind === "missingBlockerNote"
          )
        ).toBe(true);
      }
    }
  });
});

// MARK: - computeOverallReadiness

describe("computeOverallReadiness", () => {
  function item(
    severity: ReadinessItemSeverity,
    status: ReadinessItemStatus,
    id: string = `i-${Math.random()}`
  ): ReadinessItem {
    return makeItem({ severity, status, id });
  }

  it("returns `empty` for an empty list", () => {
    expect(computeOverallReadiness([])).toEqual({ kind: "empty" });
  });

  it("returns `empty` when every item is deferred", () => {
    expect(
      computeOverallReadiness([
        item("p0", "deferred"),
        item("p1", "deferred"),
      ])
    ).toEqual({ kind: "empty" });
  });

  it("returns `go` when every p0 is ready and no p1 is blocked", () => {
    const result = computeOverallReadiness([
      item("p0", "ready"),
      item("p0", "ready"),
      item("p1", "inProgress"),
      item("p2", "atRisk"),
    ]);
    expect(result.kind).toBe("go");
    if (result.kind === "go") {
      expect(result.total).toBe(4);
    }
  });

  it("returns `noGo` when any p0 item is blocked", () => {
    const result = computeOverallReadiness([
      item("p0", "blocked"),
      item("p1", "ready"),
    ]);
    expect(result.kind).toBe("noGo");
    if (result.kind === "noGo") {
      expect(result.blockedCount).toBe(1);
    }
  });

  it("returns `atRisk` when a p0 item is atRisk", () => {
    const result = computeOverallReadiness([
      item("p0", "atRisk"),
      item("p1", "ready"),
    ]);
    expect(result.kind).toBe("atRisk");
    if (result.kind === "atRisk") {
      expect(result.atRiskCount).toBe(1);
    }
  });

  it("returns `atRisk` when a p1 item is blocked", () => {
    const result = computeOverallReadiness([
      item("p0", "ready"),
      item("p1", "blocked"),
    ]);
    expect(result.kind).toBe("atRisk");
  });

  it("excludes deferred items from the total count", () => {
    const result = computeOverallReadiness([
      item("p0", "ready"),
      item("p1", "deferred"),
      item("p2", "deferred"),
    ]);
    expect(result.kind).toBe("go");
    if (result.kind === "go") {
      expect(result.total).toBe(1);
    }
  });

  it("noGo wins over atRisk when both are present", () => {
    const result = computeOverallReadiness([
      item("p0", "blocked"),
      item("p0", "atRisk"),
      item("p1", "blocked"),
    ]);
    expect(result.kind).toBe("noGo");
  });
});

// MARK: - buildReadinessState

describe("buildReadinessState", () => {
  it("derives overall status from the same item list it returns", () => {
    const ready = makeItem({
      id: "a",
      severity: "p0",
      status: "ready",
      evidenceUrl: "https://example.com/a",
    });
    const blocked = makeItem({
      id: "b",
      severity: "p0",
      status: "blocked",
      blockerNote: "Waiting on App Store review",
    });

    const state = buildReadinessState([ready, blocked]);

    expect(state.items).toHaveLength(2);
    expect(state.overall.kind).toBe("noGo");
    if (state.overall.kind === "noGo") {
      expect(state.overall.blockedCount).toBe(1);
    }
  });
});

// MARK: - summarizeChecklist

describe("summarizeChecklist", () => {
  it("counts every status bucket", () => {
    const summary = summarizeChecklist([
      makeItem({ id: "a", status: "notStarted" }),
      makeItem({ id: "b", status: "inProgress" }),
      makeItem({ id: "c", status: "blocked", blockerNote: "legal" }),
      makeItem({ id: "d", status: "atRisk" }),
      makeItem({
        id: "e",
        status: "ready",
        evidenceUrl: "https://example.com",
      }),
      makeItem({ id: "f", status: "deferred" }),
    ]);
    expect(summary.total).toBe(6);
    expect(summary.notStarted).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.atRisk).toBe(1);
    expect(summary.ready).toBe(1);
    expect(summary.deferred).toBe(1);
  });

  it("reports p0-specific totals", () => {
    const summary = summarizeChecklist([
      makeItem({
        id: "a",
        severity: "p0",
        status: "ready",
        evidenceUrl: "https://example.com",
      }),
      makeItem({
        id: "b",
        severity: "p0",
        status: "blocked",
        blockerNote: "legal",
      }),
      makeItem({ id: "c", severity: "p1", status: "ready", evidenceUrl: "https://example.com" }),
    ]);
    expect(summary.p0Total).toBe(2);
    expect(summary.p0Ready).toBe(1);
    expect(summary.p0Blocked).toBe(1);
  });

  it("readinessPct uses active items (deferred excluded from denominator)", () => {
    const summary = summarizeChecklist([
      makeItem({
        id: "a",
        status: "ready",
        evidenceUrl: "https://example.com",
      }),
      makeItem({ id: "b", status: "inProgress" }),
      makeItem({ id: "c", status: "deferred" }),
    ]);
    // 1 ready / (3 total - 1 deferred) = 0.5
    expect(summary.readinessPct).toBeCloseTo(0.5);
  });

  it("readinessPct handles all-deferred lists without NaN", () => {
    const summary = summarizeChecklist([
      makeItem({ id: "a", status: "deferred" }),
    ]);
    expect(summary.readinessPct).toBe(0);
  });
});
