import { describe, it, expect } from "vitest";
import {
  buildCloseTaskTransitionPatch,
  buildCloseTaskUpdatePatch,
  buildCreateCloseTask,
  validateTransition,
  projectBuyerRow,
  projectInternalRow,
  filterByVisibility,
  sortForDisplay,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
  type CloseTaskStatus,
  type RawCloseTask,
} from "@/lib/dealroom/close-tasks";

const NOW = new Date("2026-04-12T00:00:00.000Z").getTime();
const YESTERDAY = new Date("2026-04-11T00:00:00.000Z").toISOString();
const TOMORROW = new Date("2026-04-13T00:00:00.000Z").toISOString();

const mkTask = (overrides: Partial<RawCloseTask> = {}): RawCloseTask => ({
  _id: "task_1",
  dealRoomId: "deal_1",
  title: "Order home inspection",
  category: "inspection",
  status: "pending",
  visibility: "buyer_visible",
  ownerRole: "buyer",
  ownerDisplayName: "Alice Buyer",
  dueDate: TOMORROW,
  createdAt: "2026-04-10T00:00:00.000Z",
  updatedAt: "2026-04-10T00:00:00.000Z",
  ...overrides,
});

describe("validateTransition", () => {
  it("allows same-state transitions as no-ops", () => {
    const result = validateTransition("pending", "pending");
    expect(result.ok).toBe(true);
  });

  it("allows pending → in_progress", () => {
    const result = validateTransition("pending", "in_progress");
    expect(result.ok).toBe(true);
  });

  it("allows in_progress → completed", () => {
    const result = validateTransition("in_progress", "completed");
    expect(result.ok).toBe(true);
  });

  it("allows any non-terminal → blocked", () => {
    expect(validateTransition("pending", "blocked").ok).toBe(true);
    expect(validateTransition("in_progress", "blocked").ok).toBe(true);
  });

  it("allows any non-terminal → canceled", () => {
    expect(validateTransition("pending", "canceled").ok).toBe(true);
    expect(validateTransition("in_progress", "canceled").ok).toBe(true);
    expect(validateTransition("blocked", "canceled").ok).toBe(true);
  });

  it("allows blocked → pending or in_progress (unblock)", () => {
    expect(validateTransition("blocked", "pending").ok).toBe(true);
    expect(validateTransition("blocked", "in_progress").ok).toBe(true);
  });

  it("rejects transitions from terminal states", () => {
    const fromCompleted = validateTransition("completed", "pending");
    expect(fromCompleted.ok).toBe(false);
    if (!fromCompleted.ok) {
      expect(fromCompleted.error.code).toBe("already_terminal");
    }

    const fromCanceled = validateTransition("canceled", "in_progress");
    expect(fromCanceled.ok).toBe(false);
    if (!fromCanceled.ok) {
      expect(fromCanceled.error.code).toBe("already_terminal");
    }
  });

  it("rejects skipping steps: pending → completed", () => {
    const result = validateTransition("pending", "completed");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_transition");
    }
  });

  it("VALID_TRANSITIONS contains all status keys", () => {
    const statuses: CloseTaskStatus[] = [
      "pending",
      "in_progress",
      "completed",
      "blocked",
      "canceled",
    ];
    for (const status of statuses) {
      expect(VALID_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("TERMINAL_STATUSES contains exactly completed and canceled", () => {
    expect(TERMINAL_STATUSES.length).toBe(2);
    expect(TERMINAL_STATUSES).toContain("completed");
    expect(TERMINAL_STATUSES).toContain("canceled");
  });
});

describe("buildCreateCloseTask", () => {
  it("attaches owner, due date, status, and visibility on create", () => {
    const created = buildCreateCloseTask(
      {
        dealRoomId: "deal_1",
        contractId: "contract_1",
        title: "Wire earnest money",
        description: "Send escrow wire before cutoff",
        category: "financing",
        visibility: "buyer_visible",
        ownerRole: "buyer",
        ownerUserId: "user_1",
        ownerDisplayName: "Alice Buyer",
        dueDate: TOMORROW,
        internalNotes: "Confirm receipt with title",
      },
      "2026-04-12T09:00:00.000Z",
    );

    expect(created.status).toBe("pending");
    expect(created.ownerRole).toBe("buyer");
    expect(created.ownerUserId).toBe("user_1");
    expect(created.ownerDisplayName).toBe("Alice Buyer");
    expect(created.dueDate).toBe(TOMORROW);
    expect(created.visibility).toBe("buyer_visible");
    expect(created.createdAt).toBe("2026-04-12T09:00:00.000Z");
    expect(created.updatedAt).toBe("2026-04-12T09:00:00.000Z");
  });
});

describe("buildCloseTaskUpdatePatch", () => {
  it("updates mutable task fields including owner assignment", () => {
    const { changedFields, patch } = buildCloseTaskUpdatePatch(
      mkTask({
        ownerRole: "buyer",
        ownerUserId: "buyer_1",
        ownerDisplayName: "Alice Buyer",
      }),
      {
        title: "Schedule final walkthrough",
        dueDate: "2026-04-20T00:00:00.000Z",
        ownerRole: "broker",
        ownerUserId: "broker_1",
        ownerDisplayName: "Brenda Broker",
        internalNotes: "Coordinate with listing side",
      },
      "2026-04-12T10:00:00.000Z",
    );

    expect(changedFields).toEqual([
      "title",
      "dueDate",
      "ownerRole",
      "ownerUserId",
      "ownerDisplayName",
      "internalNotes",
    ]);
    expect(patch).toMatchObject({
      title: "Schedule final walkthrough",
      dueDate: "2026-04-20T00:00:00.000Z",
      ownerRole: "broker",
      ownerUserId: "broker_1",
      ownerDisplayName: "Brenda Broker",
      internalNotes: "Coordinate with listing side",
      updatedAt: "2026-04-12T10:00:00.000Z",
    });
  });

  it("returns an empty patch when nothing changes", () => {
    const { changedFields, patch } = buildCloseTaskUpdatePatch(
      mkTask(),
      {},
      "2026-04-12T10:00:00.000Z",
    );

    expect(changedFields).toEqual([]);
    expect(patch).toEqual({});
  });
});

describe("buildCloseTaskTransitionPatch", () => {
  it("marks a task completed and stamps completedAt once", () => {
    const patch = buildCloseTaskTransitionPatch(
      mkTask({ status: "in_progress" }),
      { newStatus: "completed" },
      "2026-04-12T11:00:00.000Z",
    );

    expect(patch).toMatchObject({
      status: "completed",
      completedAt: "2026-04-12T11:00:00.000Z",
      updatedAt: "2026-04-12T11:00:00.000Z",
    });
  });

  it("does not overwrite completedAt on idempotent complete", () => {
    const patch = buildCloseTaskTransitionPatch(
      mkTask({
        status: "completed",
        completedAt: "2026-04-11T11:00:00.000Z",
      }),
      { newStatus: "completed" },
      "2026-04-12T11:00:00.000Z",
    );

    expect(patch.status).toBe("completed");
    expect(patch.completedAt).toBeUndefined();
    expect(patch.updatedAt).toBe("2026-04-12T11:00:00.000Z");
  });

  it("clears blockedReason when moving out of blocked", () => {
    const patch = buildCloseTaskTransitionPatch(
      mkTask({
        status: "blocked",
        blockedReason: "Waiting on lender docs",
      }),
      { newStatus: "in_progress" },
      "2026-04-12T11:00:00.000Z",
    );

    expect(patch).toMatchObject({
      status: "in_progress",
      updatedAt: "2026-04-12T11:00:00.000Z",
    });
    expect(patch.blockedReason).toBeUndefined();
  });
});

describe("projectBuyerRow", () => {
  it("projects buyer-facing fields only", () => {
    const row = projectBuyerRow(
      mkTask({
        internalNotes: "SECRET broker-only note",
        blockedReason: "waiting on lender",
      }),
      NOW,
    );
    // @ts-expect-error - we're checking the shape intentionally
    expect(row.internalNotes).toBeUndefined();
    // @ts-expect-error
    expect(row.blockedReason).toBeUndefined();
    expect(row.title).toBe("Order home inspection");
    expect(row.category).toBe("inspection");
  });

  it("marks overdue when due date is in the past and status is active", () => {
    const row = projectBuyerRow(
      mkTask({ status: "pending", dueDate: YESTERDAY }),
      NOW,
    );
    expect(row.isOverdue).toBe(true);
  });

  it("does not mark overdue when task is completed", () => {
    const row = projectBuyerRow(
      mkTask({ status: "completed", dueDate: YESTERDAY }),
      NOW,
    );
    expect(row.isOverdue).toBe(false);
  });

  it("does not mark overdue when no due date", () => {
    const row = projectBuyerRow(
      mkTask({ status: "pending", dueDate: undefined }),
      NOW,
    );
    expect(row.isOverdue).toBe(false);
  });

  it("does not mark overdue when due date is in the future", () => {
    const row = projectBuyerRow(
      mkTask({ status: "pending", dueDate: TOMORROW }),
      NOW,
    );
    expect(row.isOverdue).toBe(false);
  });

  it("does not mark canceled tasks as overdue", () => {
    const row = projectBuyerRow(
      mkTask({ status: "canceled", dueDate: YESTERDAY }),
      NOW,
    );
    expect(row.isOverdue).toBe(false);
  });
});

describe("projectInternalRow", () => {
  it("includes internal-only fields", () => {
    const row = projectInternalRow(
      mkTask({
        internalNotes: "Broker handoff to title company Monday",
        blockedReason: "waiting on inspection report",
      }),
      NOW,
    );
    expect(row.internalNotes).toBe("Broker handoff to title company Monday");
    expect(row.blockedReason).toBe("waiting on inspection report");
    expect(row.visibility).toBe("buyer_visible");
    expect(row.createdAt).toBeTruthy();
    expect(row.updatedAt).toBeTruthy();
  });

  it("passes through all buyer row fields", () => {
    const row = projectInternalRow(mkTask(), NOW);
    expect(row.title).toBe("Order home inspection");
    expect(row.ownerRole).toBe("buyer");
  });
});

describe("filterByVisibility", () => {
  const buyerVisible = mkTask({ _id: "t1", visibility: "buyer_visible" });
  const internal = mkTask({ _id: "t2", visibility: "internal_only" });
  const tasks = [buyerVisible, internal];

  it("strips internal_only for buyers", () => {
    const filtered = filterByVisibility(tasks, "buyer");
    expect(filtered.length).toBe(1);
    expect(filtered[0]._id).toBe("t1");
  });

  it("passes all tasks through for broker", () => {
    const filtered = filterByVisibility(tasks, "broker");
    expect(filtered.length).toBe(2);
  });

  it("passes all tasks through for admin", () => {
    const filtered = filterByVisibility(tasks, "admin");
    expect(filtered.length).toBe(2);
  });
});

describe("sortForDisplay", () => {
  const mkCreatedAt = (iso: string) => ({ createdAt: iso });

  it("sorts overdue first", () => {
    const tasks = [
      mkTask({
        _id: "future",
        dueDate: TOMORROW,
        ...mkCreatedAt("2026-04-01T00:00:00.000Z"),
      }),
      mkTask({
        _id: "overdue",
        dueDate: YESTERDAY,
        ...mkCreatedAt("2026-04-02T00:00:00.000Z"),
      }),
    ];
    const sorted = sortForDisplay(tasks, NOW);
    expect(sorted[0]._id).toBe("overdue");
  });

  it("sorts terminal tasks to the bottom", () => {
    const tasks = [
      mkTask({ _id: "done", status: "completed" }),
      mkTask({ _id: "active", status: "in_progress" }),
    ];
    const sorted = sortForDisplay(tasks, NOW);
    expect(sorted[0]._id).toBe("active");
    expect(sorted[1]._id).toBe("done");
  });

  it("sorts by due date ascending within the same bucket", () => {
    const tasks = [
      mkTask({
        _id: "later",
        dueDate: "2026-04-20T00:00:00.000Z",
      }),
      mkTask({
        _id: "sooner",
        dueDate: "2026-04-15T00:00:00.000Z",
      }),
    ];
    const sorted = sortForDisplay(tasks, NOW);
    expect(sorted[0]._id).toBe("sooner");
  });

  it("handles tasks without due dates (sort to end of non-terminal bucket)", () => {
    const tasks = [
      mkTask({ _id: "noDate", dueDate: undefined }),
      mkTask({
        _id: "withDate",
        dueDate: "2026-04-20T00:00:00.000Z",
      }),
    ];
    const sorted = sortForDisplay(tasks, NOW);
    expect(sorted[0]._id).toBe("withDate");
  });
});
