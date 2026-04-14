import { describe, it, expect } from "vitest";
import {
  shouldResyncTask,
  computeResyncedTaskDueDates,
  getTemplateByKey,
  type SyncCloseTaskRow,
} from "@/lib/closing/deadlineSync";

const ONE_DAY_MS = 86_400_000;

describe("shouldResyncTask", () => {
  const baseTask: SyncCloseTaskRow = {
    _id: "task_1",
    templateKey: "financing_financing_contingency",
    dueDate: 1_000_000,
    manuallyOverriddenDueDate: false,
  };

  it("returns false when manuallyOverriddenDueDate is true", () => {
    expect(
      shouldResyncTask(
        { ...baseTask, manuallyOverriddenDueDate: true },
        2_000_000,
      ),
    ).toBe(false);
  });

  it("returns false when the task has no templateKey", () => {
    expect(
      shouldResyncTask({ ...baseTask, templateKey: undefined }, 2_000_000),
    ).toBe(false);
  });

  it("returns false when computed equals current", () => {
    expect(shouldResyncTask(baseTask, 1_000_000)).toBe(false);
  });

  it("returns true when dueDate differs and override is false", () => {
    expect(shouldResyncTask(baseTask, 2_000_000)).toBe(true);
  });

  it("returns true when current dueDate is missing but a computed value exists", () => {
    expect(
      shouldResyncTask({ ...baseTask, dueDate: null }, 3_000_000),
    ).toBe(true);
  });
});

describe("computeResyncedTaskDueDates", () => {
  it("resolves from milestonesByKey when strategy is relative_to_milestone", () => {
    const inspectionEnd = Date.UTC(2026, 4, 10);
    const task: SyncCloseTaskRow = {
      _id: "task_inspection_end",
      templateKey: "inspections_inspection_period_end",
      dueDate: 0,
      manuallyOverriddenDueDate: false,
    };
    const map = computeResyncedTaskDueDates(
      [task],
      {
        inspection_period_end: {
          dueDate: inspectionEnd,
          id: "ms_inspection",
        },
      },
      null,
    );
    expect(map.get("task_inspection_end")).toBe(inspectionEnd);
  });

  it("returns null for tasks whose milestone is missing", () => {
    const task: SyncCloseTaskRow = {
      _id: "task_no_milestone",
      templateKey: "financing_financing_contingency",
      dueDate: 123_456_789,
      manuallyOverriddenDueDate: false,
    };
    const map = computeResyncedTaskDueDates([task], {}, null);
    // The computed value is null, and current is 123_456_789, so they
    // differ → shouldResyncTask → entry exists in map with null value.
    expect(map.has("task_no_milestone")).toBe(true);
    expect(map.get("task_no_milestone")).toBeNull();
  });

  it("skips tasks that have been manually overridden", () => {
    const closing = Date.UTC(2026, 5, 15);
    const task: SyncCloseTaskRow = {
      _id: "task_walk_through",
      templateKey: "moving_in_walk_through",
      dueDate: 0,
      manuallyOverriddenDueDate: true,
    };
    const map = computeResyncedTaskDueDates([task], {}, closing);
    expect(map.has("task_walk_through")).toBe(false);
  });

  it("resolves relative_to_closing strategies using the closingDate", () => {
    const closing = Date.UTC(2026, 5, 15);
    const task: SyncCloseTaskRow = {
      _id: "task_cd_review",
      templateKey: "financing_closing_disclosure_review",
      dueDate: 0,
      manuallyOverriddenDueDate: false,
    };
    const map = computeResyncedTaskDueDates([task], {}, closing);
    expect(map.get("task_cd_review")).toBe(closing - 3 * ONE_DAY_MS);
  });

  it("ignores tasks whose templateKey is not in the catalog", () => {
    const task: SyncCloseTaskRow = {
      _id: "task_unknown",
      templateKey: "not_a_real_template",
      dueDate: 123,
      manuallyOverriddenDueDate: false,
    };
    const map = computeResyncedTaskDueDates([task], {}, 0);
    expect(map.has("task_unknown")).toBe(false);
  });
});

describe("getTemplateByKey", () => {
  it("returns a known template", () => {
    expect(getTemplateByKey("title_schedule_closing")).toBeDefined();
  });

  it("returns undefined for unknown keys", () => {
    expect(getTemplateByKey("not_real")).toBeUndefined();
  });
});
