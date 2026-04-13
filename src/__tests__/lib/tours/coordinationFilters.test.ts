import { describe, it, expect } from "vitest";
import {
  isStale,
  detectPrerequisiteFailures,
  applyCoordinationFilters,
  bucketizeQueue,
  sortByCoordinationPriority,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  PREREQUISITE_FAILURES,
  STALE_THRESHOLDS_HOURS,
  type CoordinationTourRequest,
} from "@/lib/tours/coordinationFilters";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

const NOW = "2028-04-12T12:00:00.000Z";

function hoursBefore(hours: number): string {
  return new Date(
    Date.parse(NOW) - hours * 60 * 60 * 1000,
  ).toISOString();
}

function request(
  overrides: Partial<CoordinationTourRequest> = {},
): CoordinationTourRequest {
  return {
    _id: "tr_1",
    dealRoomId: "dr_1",
    propertyId: "prop_1",
    buyerId: "buyer_1",
    status: "submitted",
    createdAt: hoursBefore(2),
    submittedAt: hoursBefore(2),
    agreementStateSnapshot: { type: "tour_pass", status: "signed" },
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// isStale
// ───────────────────────────────────────────────────────────────────────────

describe("isStale", () => {
  it("returns false for a fresh submitted request", () => {
    expect(isStale(request({ submittedAt: hoursBefore(1) }), NOW)).toBe(false);
  });

  it("returns true for a submitted request past 24h", () => {
    expect(isStale(request({ submittedAt: hoursBefore(25) }), NOW)).toBe(true);
  });

  it("returns false for a blocked request under 48h", () => {
    expect(
      isStale(
        request({ status: "blocked", submittedAt: hoursBefore(24) }),
        NOW,
      ),
    ).toBe(false);
  });

  it("returns true for a blocked request past 48h", () => {
    expect(
      isStale(
        request({ status: "blocked", submittedAt: hoursBefore(50) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("returns true for an assigned request past 12h", () => {
    expect(
      isStale(
        request({ status: "assigned", assignedAt: hoursBefore(13) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("returns false for an assigned request under 12h", () => {
    expect(
      isStale(
        request({ status: "assigned", assignedAt: hoursBefore(6) }),
        NOW,
      ),
    ).toBe(false);
  });

  it("returns false for terminal states", () => {
    expect(
      isStale(
        request({ status: "completed", submittedAt: hoursBefore(1000) }),
        NOW,
      ),
    ).toBe(false);
  });

  it("handles invalid timestamps gracefully", () => {
    expect(isStale(request({ submittedAt: "invalid" }), NOW)).toBe(false);
    expect(isStale(request({ submittedAt: hoursBefore(25) }), "invalid")).toBe(
      false,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// detectPrerequisiteFailures
// ───────────────────────────────────────────────────────────────────────────

describe("detectPrerequisiteFailures", () => {
  it("flags missing agreement when type is none", () => {
    const failures = detectPrerequisiteFailures(
      request({
        agreementStateSnapshot: { type: "none", status: "none" },
      }),
      NOW,
    );
    expect(failures).toContain("missing_agreement");
  });

  it("flags missing agreement when status is not signed", () => {
    const failures = detectPrerequisiteFailures(
      request({
        agreementStateSnapshot: { type: "tour_pass", status: "draft" },
      }),
      NOW,
    );
    expect(failures).toContain("missing_agreement");
  });

  it("does not flag missing agreement when tour_pass is signed", () => {
    const failures = detectPrerequisiteFailures(
      request({
        agreementStateSnapshot: { type: "tour_pass", status: "signed" },
      }),
      NOW,
    );
    expect(failures).not.toContain("missing_agreement");
  });

  it("flags stale_submission when submitted > 24h ago", () => {
    const failures = detectPrerequisiteFailures(
      request({ submittedAt: hoursBefore(25) }),
      NOW,
    );
    expect(failures).toContain("stale_submission");
  });

  it("flags no_agent_coverage when stale submitted + unassigned", () => {
    const failures = detectPrerequisiteFailures(
      request({ submittedAt: hoursBefore(25), agentId: undefined }),
      NOW,
    );
    expect(failures).toContain("no_agent_coverage");
    expect(failures).toContain("stale_submission");
  });

  it("flags stale_blocked when blocked > 48h", () => {
    const failures = detectPrerequisiteFailures(
      request({ status: "blocked", submittedAt: hoursBefore(50) }),
      NOW,
    );
    expect(failures).toContain("stale_blocked");
  });

  it("flags stale_assigned when assigned > 12h", () => {
    const failures = detectPrerequisiteFailures(
      request({
        status: "assigned",
        assignedAt: hoursBefore(13),
        agentId: "agent_1",
      }),
      NOW,
    );
    expect(failures).toContain("stale_assigned");
  });

  it("returns empty array for a fresh, fully-prerequisite-valid request", () => {
    const failures = detectPrerequisiteFailures(
      request({
        submittedAt: hoursBefore(1),
        agreementStateSnapshot: { type: "full_representation", status: "signed" },
      }),
      NOW,
    );
    expect(failures).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// applyCoordinationFilters
// ───────────────────────────────────────────────────────────────────────────

describe("applyCoordinationFilters", () => {
  const fixtures: CoordinationTourRequest[] = [
    request({ _id: "a", status: "submitted", agentId: undefined }),
    request({ _id: "b", status: "assigned", agentId: "agent_1" }),
    request({ _id: "c", status: "blocked", agentId: undefined }),
    request({
      _id: "d",
      status: "completed",
      agentId: "agent_2",
    }),
    request({
      _id: "e",
      status: "submitted",
      createdAt: hoursBefore(25),
      submittedAt: hoursBefore(25),
      agentId: undefined,
    }),
  ];

  it("defaults to active statuses only", () => {
    const result = applyCoordinationFilters(fixtures, {}, NOW);
    const ids = result.map((r) => r._id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids).not.toContain("d"); // completed
  });

  it("filters by agent", () => {
    const result = applyCoordinationFilters(
      fixtures,
      { agentId: "agent_1" },
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("b");
  });

  it("filters unassigned only", () => {
    const result = applyCoordinationFilters(
      fixtures,
      { unassignedOnly: true },
      NOW,
    );
    const ids = result.map((r) => r._id);
    expect(ids).toContain("a");
    expect(ids).toContain("c");
    expect(ids).not.toContain("b"); // has agent
  });

  it("filters by minAgeHours", () => {
    const result = applyCoordinationFilters(
      fixtures,
      { minAgeHours: 24 },
      NOW,
    );
    const ids = result.map((r) => r._id);
    expect(ids).toContain("e"); // 25h old
    expect(ids).not.toContain("a"); // only 2h old
  });

  it("filters requests with prerequisite failures", () => {
    const result = applyCoordinationFilters(
      fixtures,
      { hasPrerequisiteFailure: true },
      NOW,
    );
    const ids = result.map((r) => r._id);
    expect(ids).toContain("e"); // stale submission
    // Non-stale submitted without failure should be excluded
    expect(ids).not.toContain("a");
  });

  it("filters by explicit status list", () => {
    const result = applyCoordinationFilters(
      fixtures,
      { statuses: ["blocked"] },
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("c");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// bucketizeQueue
// ───────────────────────────────────────────────────────────────────────────

describe("bucketizeQueue", () => {
  const fixtures: CoordinationTourRequest[] = [
    request({ _id: "a", status: "submitted", agentId: undefined }),
    request({ _id: "b", status: "assigned", agentId: "agent_1" }),
    request({ _id: "c", status: "blocked" }),
    request({ _id: "d", status: "confirmed", agentId: "agent_1" }),
    request({ _id: "e", status: "completed" }),
    request({
      _id: "f",
      status: "submitted",
      submittedAt: hoursBefore(25),
      agentId: undefined,
    }),
  ];

  it("groups requests into buckets", () => {
    const buckets = bucketizeQueue(fixtures, NOW);
    expect(buckets.incoming.map((r) => r._id)).toContain("a");
    expect(buckets.incoming.map((r) => r._id)).toContain("f");
    expect(buckets.assigned.map((r) => r._id)).toContain("b");
    expect(buckets.blocked.map((r) => r._id)).toContain("c");
    expect(buckets.confirmed.map((r) => r._id)).toContain("d");
  });

  it("excludes terminal statuses", () => {
    const buckets = bucketizeQueue(fixtures, NOW);
    const allIds = [
      ...buckets.incoming,
      ...buckets.blocked,
      ...buckets.assigned,
      ...buckets.confirmed,
    ].map((r) => r._id);
    expect(allIds).not.toContain("e"); // completed
  });

  it("flags stale requests in the stale bucket", () => {
    const buckets = bucketizeQueue(fixtures, NOW);
    expect(buckets.stale.map((r) => r._id)).toContain("f");
  });

  it("totalActive sums non-terminal buckets", () => {
    const buckets = bucketizeQueue(fixtures, NOW);
    expect(buckets.totalActive).toBe(
      buckets.incoming.length +
        buckets.blocked.length +
        buckets.assigned.length +
        buckets.confirmed.length,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// sortByCoordinationPriority
// ───────────────────────────────────────────────────────────────────────────

describe("sortByCoordinationPriority", () => {
  it("puts stale requests first", () => {
    const fresh = request({ _id: "a", submittedAt: hoursBefore(1) });
    const stale = request({ _id: "b", submittedAt: hoursBefore(30) });
    const sorted = sortByCoordinationPriority([fresh, stale], NOW);
    expect(sorted[0]._id).toBe("b");
  });

  it("among non-stale, sorts by oldest createdAt first", () => {
    const newer = request({
      _id: "newer",
      createdAt: hoursBefore(1),
      submittedAt: hoursBefore(1),
    });
    const older = request({
      _id: "older",
      createdAt: hoursBefore(5),
      submittedAt: hoursBefore(5),
    });
    const sorted = sortByCoordinationPriority([newer, older], NOW);
    expect(sorted[0]._id).toBe("older");
  });

  it("does not mutate input", () => {
    const input = [request({ _id: "a" }), request({ _id: "b" })];
    const snapshot = JSON.stringify(input);
    sortByCoordinationPriority(input, NOW);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("ACTIVE_STATUSES has 4 entries", () => {
    expect(ACTIVE_STATUSES).toHaveLength(4);
    expect(ACTIVE_STATUSES).toContain("submitted");
    expect(ACTIVE_STATUSES).toContain("confirmed");
  });

  it("TERMINAL_STATUSES has 3 entries", () => {
    expect(TERMINAL_STATUSES).toHaveLength(3);
    expect(TERMINAL_STATUSES).toContain("completed");
  });

  it("PREREQUISITE_FAILURES includes all expected codes", () => {
    expect(PREREQUISITE_FAILURES).toContain("missing_agreement");
    expect(PREREQUISITE_FAILURES).toContain("no_agent_coverage");
    expect(PREREQUISITE_FAILURES).toContain("stale_submission");
    expect(PREREQUISITE_FAILURES).toContain("stale_blocked");
    expect(PREREQUISITE_FAILURES).toContain("stale_assigned");
  });

  it("STALE_THRESHOLDS_HOURS has sane defaults", () => {
    expect(STALE_THRESHOLDS_HOURS.submitted).toBe(24);
    expect(STALE_THRESHOLDS_HOURS.blocked).toBe(48);
    expect(STALE_THRESHOLDS_HOURS.assigned).toBe(12);
  });
});
