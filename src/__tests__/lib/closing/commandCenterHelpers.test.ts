import { describe, it, expect } from "vitest";
import {
  computeGroupProgress,
  shouldShowWireFraudBanner,
  shouldShowBlockedChip,
  findNextDueTask,
  countBlockedInTab,
  parseTabFromQuery,
  type CommandCenterGroupLike,
  type CommandCenterTabLike,
} from "@/lib/closing/commandCenterHelpers";
import { TAB_ORDER } from "@/lib/closing/taskTemplates";

const makeGroup = (
  statuses: Array<
    "pending" | "in_progress" | "completed" | "blocked" | "canceled"
  >,
): CommandCenterGroupLike => ({
  groupKey: "g",
  groupTitle: "Group",
  tasks: statuses.map((status, i) => ({
    _id: `t${i}`,
    status,
    title: `Task ${i}`,
  })),
});

describe("computeGroupProgress", () => {
  it("counts completed out of total across mixed statuses", () => {
    const group = makeGroup([
      "completed",
      "completed",
      "pending",
      "in_progress",
      "blocked",
    ]);
    expect(computeGroupProgress(group)).toEqual({ total: 5, completed: 2 });
  });

  it("returns zero when the group is empty", () => {
    expect(
      computeGroupProgress({ groupKey: "g", groupTitle: "G", tasks: [] }),
    ).toEqual({ total: 0, completed: 0 });
  });

  it("counts all completed when every task is done", () => {
    const group = makeGroup(["completed", "completed"]);
    expect(computeGroupProgress(group)).toEqual({ total: 2, completed: 2 });
  });
});

describe("shouldShowWireFraudBanner", () => {
  it("is true only on the title tab", () => {
    expect(shouldShowWireFraudBanner("title")).toBe(true);
    expect(shouldShowWireFraudBanner("financing")).toBe(false);
    expect(shouldShowWireFraudBanner("inspections")).toBe(false);
    expect(shouldShowWireFraudBanner("insurance")).toBe(false);
    expect(shouldShowWireFraudBanner("moving_in")).toBe(false);
    expect(shouldShowWireFraudBanner("addendums")).toBe(false);
  });
});

describe("shouldShowBlockedChip", () => {
  it("hides when blocked count is zero", () => {
    expect(shouldShowBlockedChip(0)).toBe(false);
  });
  it("shows when blocked count is positive", () => {
    expect(shouldShowBlockedChip(1)).toBe(true);
    expect(shouldShowBlockedChip(9)).toBe(true);
  });
});

describe("findNextDueTask", () => {
  const makeTab = (
    tab: (typeof TAB_ORDER)[number],
    tasks: Array<{
      title: string;
      status:
        | "pending"
        | "in_progress"
        | "completed"
        | "blocked"
        | "canceled";
      dueDate?: string;
    }>,
  ): CommandCenterTabLike => ({
    tab,
    label: tab,
    groups: [
      {
        groupKey: "g",
        groupTitle: "G",
        tasks: tasks.map((t, i) => ({
          _id: `${tab}-${i}`,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate,
        })),
      },
    ],
    counts: {
      total: tasks.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
      canceled: 0,
    },
  });

  it("returns earliest uncompleted task across tabs", () => {
    const tabs: CommandCenterTabLike[] = [
      makeTab("title", [
        { title: "Z", status: "pending", dueDate: "2026-06-10" },
      ]),
      makeTab("financing", [
        { title: "A", status: "pending", dueDate: "2026-05-15" },
      ]),
    ];
    expect(findNextDueTask(tabs)).toEqual({
      title: "A",
      dueDate: "2026-05-15",
    });
  });

  it("ignores completed and canceled tasks", () => {
    const tabs: CommandCenterTabLike[] = [
      makeTab("title", [
        { title: "A", status: "completed", dueDate: "2026-05-01" },
        { title: "B", status: "canceled", dueDate: "2026-05-02" },
        { title: "C", status: "pending", dueDate: "2026-05-03" },
      ]),
    ];
    expect(findNextDueTask(tabs)).toEqual({
      title: "C",
      dueDate: "2026-05-03",
    });
  });

  it("ignores tasks without a dueDate", () => {
    const tabs: CommandCenterTabLike[] = [
      makeTab("title", [
        { title: "No date", status: "pending" },
        { title: "With date", status: "pending", dueDate: "2026-07-01" },
      ]),
    ];
    expect(findNextDueTask(tabs)).toEqual({
      title: "With date",
      dueDate: "2026-07-01",
    });
  });

  it("returns null when no qualifying task exists", () => {
    const tabs: CommandCenterTabLike[] = [
      makeTab("title", [{ title: "A", status: "completed" }]),
    ];
    expect(findNextDueTask(tabs)).toBeNull();
  });

  it("breaks ties on title", () => {
    const tabs: CommandCenterTabLike[] = [
      makeTab("title", [
        { title: "Zed", status: "pending", dueDate: "2026-05-15" },
        { title: "Alpha", status: "pending", dueDate: "2026-05-15" },
      ]),
    ];
    expect(findNextDueTask(tabs)?.title).toBe("Alpha");
  });
});

describe("countBlockedInTab", () => {
  it("delegates to tab counts", () => {
    const tab: CommandCenterTabLike = {
      tab: "title",
      label: "Title",
      groups: [],
      counts: {
        total: 5,
        pending: 2,
        in_progress: 0,
        completed: 1,
        blocked: 2,
        canceled: 0,
      },
    };
    expect(countBlockedInTab(tab)).toBe(2);
  });
});

describe("parseTabFromQuery", () => {
  it("returns the tab when valid", () => {
    expect(parseTabFromQuery("financing", TAB_ORDER)).toBe("financing");
  });
  it("returns null for unknown strings", () => {
    expect(parseTabFromQuery("bogus", TAB_ORDER)).toBeNull();
  });
  it("returns null for empty/undefined values", () => {
    expect(parseTabFromQuery(null, TAB_ORDER)).toBeNull();
    expect(parseTabFromQuery("", TAB_ORDER)).toBeNull();
    expect(parseTabFromQuery(undefined, TAB_ORDER)).toBeNull();
  });
});
