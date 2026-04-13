import { describe, expect, it } from "vitest";
import {
  buildCloseDashboard,
  buildIcsForMilestone,
  buildIcsForWeeklyPlan,
  buildNextStep,
  buildWeeklyPlan,
  classifyUrgency,
  daysBetween,
  groupByWorkstream,
  inferResponsibleParty,
  toCloseDashboardMilestone,
  type RawMilestone,
} from "@/lib/dealroom/close-dashboard-logic";
import type { CloseDashboardMilestone } from "@/lib/dealroom/close-dashboard-types";

const NOW = "2026-04-12T00:00:00Z";

function raw(
  id: string,
  name: string,
  workstream: RawMilestone["workstream"],
  dueDate: string,
  status: RawMilestone["status"] = "pending",
): RawMilestone {
  return { _id: id, name, workstream, dueDate, status };
}

describe("daysBetween", () => {
  it("returns zero when dates are identical", () => {
    expect(daysBetween("2026-04-12", "2026-04-12")).toBe(0);
  });

  it("returns positive days for future dates", () => {
    expect(daysBetween("2026-04-12", "2026-04-19")).toBe(7);
  });

  it("returns negative days for past dates", () => {
    expect(daysBetween("2026-04-12", "2026-04-05")).toBe(-7);
  });

  it("is timezone stable with ISO-T prefixes", () => {
    expect(daysBetween("2026-04-12T22:00:00Z", "2026-04-15T02:00:00Z")).toBe(3);
  });
});

describe("classifyUrgency", () => {
  it("classifies past-due non-completed as overdue", () => {
    expect(classifyUrgency(raw("1", "x", "inspection", "2026-04-01"), -11)).toBe(
      "overdue",
    );
  });

  it("classifies 0-7 days as this_week", () => {
    expect(classifyUrgency(raw("1", "x", "inspection", "2026-04-15"), 3)).toBe(
      "this_week",
    );
    expect(classifyUrgency(raw("1", "x", "inspection", "2026-04-19"), 7)).toBe(
      "this_week",
    );
  });

  it("classifies 8-14 days as next_week", () => {
    expect(classifyUrgency(raw("1", "x", "inspection", "2026-04-25"), 13)).toBe(
      "next_week",
    );
  });

  it("classifies >14 days as later", () => {
    expect(classifyUrgency(raw("1", "x", "inspection", "2026-05-10"), 28)).toBe(
      "later",
    );
  });

  it("classifies completed regardless of date", () => {
    const completed = { ...raw("1", "x", "inspection", "2026-04-01"), status: "completed" as const };
    expect(classifyUrgency(completed, -11)).toBe("completed");
  });
});

describe("inferResponsibleParty", () => {
  it("assigns buyer when name contains an action keyword", () => {
    expect(inferResponsibleParty(raw("1", "Buyer reviews HOA docs", "hoa", "2026-04-15"))).toBe(
      "buyer",
    );
    expect(inferResponsibleParty(raw("1", "Sign purchase addendum", "other", "2026-04-15"))).toBe(
      "buyer",
    );
  });

  it("falls back to workstream-based party", () => {
    expect(inferResponsibleParty(raw("1", "Appraisal completion", "appraisal", "2026-04-15"))).toBe(
      "lender",
    );
    expect(inferResponsibleParty(raw("1", "Title clearance", "title", "2026-04-15"))).toBe(
      "title_company",
    );
  });
});

describe("groupByWorkstream", () => {
  it("groups milestones by workstream and sorts by due date", () => {
    const milestones: CloseDashboardMilestone[] = [
      toCloseDashboardMilestone(raw("1", "Schedule inspection", "inspection", "2026-04-15"), NOW),
      toCloseDashboardMilestone(raw("2", "Inspection report", "inspection", "2026-04-13"), NOW),
      toCloseDashboardMilestone(raw("3", "Appraisal", "appraisal", "2026-04-20"), NOW),
    ];
    const groups = groupByWorkstream(milestones);
    expect(groups).toHaveLength(2);
    expect(groups[0].workstream).toBe("inspection");
    expect(groups[0].milestones[0].id).toBe("2"); // earlier date first
    expect(groups[0].pendingCount).toBe(2);
    expect(groups[1].workstream).toBe("appraisal");
  });

  it("returns an empty array when no milestones", () => {
    expect(groupByWorkstream([])).toEqual([]);
  });
});

describe("buildNextStep", () => {
  it("prioritizes overdue milestones", () => {
    const milestones = [
      toCloseDashboardMilestone(raw("1", "Sign disclosures", "other", "2026-04-01"), NOW),
      toCloseDashboardMilestone(raw("2", "Review title", "title", "2026-04-15"), NOW),
    ];
    const step = buildNextStep(milestones);
    expect(step.urgency).toBe("overdue");
    expect(step.headline).toContain("Sign disclosures");
  });

  it("returns a buyer this-week milestone when none are overdue", () => {
    const milestones = [
      toCloseDashboardMilestone(raw("1", "Buyer signs escrow instructions", "escrow", "2026-04-15"), NOW),
      toCloseDashboardMilestone(raw("2", "Seller signs deed", "closing", "2026-04-20"), NOW),
    ];
    const step = buildNextStep(milestones);
    expect(step.urgency).toBe("this_week");
    expect(step.headline).toContain("Buyer signs");
  });

  it("falls back to next upcoming when nothing is urgent", () => {
    const milestones = [
      toCloseDashboardMilestone(raw("1", "Title clearance", "title", "2026-05-05"), NOW),
    ];
    const step = buildNextStep(milestones);
    expect(step.headline).toContain("Next up");
  });

  it("returns all-caught-up when everything is completed", () => {
    const milestones = [
      toCloseDashboardMilestone(
        { ...raw("1", "Closing", "closing", "2026-04-20"), status: "completed" },
        NOW,
      ),
    ];
    const step = buildNextStep(milestones);
    expect(step.urgency).toBe("completed");
    expect(step.headline).toContain("caught up");
  });
});

describe("buildWeeklyPlan", () => {
  it("includes only buyer-owned milestones in actionsThisWeek", () => {
    const milestones = [
      toCloseDashboardMilestone(raw("1", "Buyer signs disclosures", "other", "2026-04-15"), NOW),
      toCloseDashboardMilestone(raw("2", "Appraisal completion", "appraisal", "2026-04-15"), NOW),
    ];
    const plan = buildWeeklyPlan(milestones, NOW);
    expect(plan.actionsThisWeek).toHaveLength(1);
    expect(plan.actionsThisWeek[0].milestone.id).toBe("1");
    expect(plan.deadlinesThisWeek).toHaveLength(2);
  });

  it("generates a headline based on action count", () => {
    const plan = buildWeeklyPlan(
      [
        toCloseDashboardMilestone(raw("1", "Buyer signs", "other", "2026-04-14"), NOW),
        toCloseDashboardMilestone(raw("2", "Buyer reviews", "hoa", "2026-04-15"), NOW),
      ],
      NOW,
    );
    expect(plan.headline).toContain("2 actions");
  });
});

describe("buildCloseDashboard", () => {
  it("produces a complete dashboard from raw milestones", () => {
    const dashboard = buildCloseDashboard({
      dealRoomId: "dr1",
      propertyAddress: "123 Main St, Miami, FL 33101",
      closeDate: "2026-04-25",
      milestones: [
        raw("1", "Buyer signs escrow", "escrow", "2026-04-14"),
        raw("2", "Appraisal completion", "appraisal", "2026-04-17"),
        raw("3", "Title clearance", "title", "2026-04-20"),
        { ...raw("4", "Inspection scheduled", "inspection", "2026-04-10"), status: "completed" },
      ],
      now: NOW,
    });
    expect(dashboard.totalMilestones).toBe(4);
    expect(dashboard.completedMilestones).toBe(1);
    expect(dashboard.needsAttention.length).toBeGreaterThan(0);
    expect(dashboard.waitingOnOthers.length).toBeGreaterThan(0);
    expect(dashboard.byWorkstream.length).toBe(4);
    expect(dashboard.daysToClose).toBe(13);
    expect(dashboard.nextStep.headline).toBeTruthy();
  });

  it("handles an empty milestone list gracefully", () => {
    const dashboard = buildCloseDashboard({
      dealRoomId: "dr1",
      propertyAddress: "Test",
      closeDate: null,
      milestones: [],
      now: NOW,
    });
    expect(dashboard.totalMilestones).toBe(0);
    expect(dashboard.nextStep.urgency).toBe("completed");
    expect(dashboard.weeklyPlan.actionsThisWeek).toHaveLength(0);
  });
});

describe("buildIcsForMilestone", () => {
  it("produces a valid-looking VCALENDAR string", () => {
    const milestone = toCloseDashboardMilestone(
      raw("1", "Closing day", "closing", "2026-04-25"),
      NOW,
    );
    const ics = buildIcsForMilestone(milestone, "dr1");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Closing day");
    expect(ics).toContain("UID:dr1-1@buyer-v2");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260425");
  });

  it("uses next-day DTEND for all-day events (RFC 5545 exclusive)", () => {
    const milestone = toCloseDashboardMilestone(
      raw("1", "Closing day", "closing", "2026-04-25"),
      NOW,
    );
    const ics = buildIcsForMilestone(milestone, "dr1");
    expect(ics).toContain("DTEND;VALUE=DATE:20260426");
    expect(ics).not.toContain("DTEND;VALUE=DATE:20260425");
  });

  it("handles month rollover in next-day calculation", () => {
    const milestone = toCloseDashboardMilestone(
      raw("1", "Month-end close", "closing", "2026-04-30"),
      NOW,
    );
    const ics = buildIcsForMilestone(milestone, "dr1");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260430");
    expect(ics).toContain("DTEND;VALUE=DATE:20260501");
  });
});

describe("buildIcsForWeeklyPlan", () => {
  it("includes distinct events per milestone", () => {
    const plan = buildWeeklyPlan(
      [
        toCloseDashboardMilestone(raw("1", "Buyer signs", "other", "2026-04-14"), NOW),
        toCloseDashboardMilestone(raw("2", "Title clearance", "title", "2026-04-16"), NOW),
      ],
      NOW,
    );
    const ics = buildIcsForWeeklyPlan(plan, "dr1");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Buyer signs");
    expect(ics).toContain("SUMMARY:Title clearance");
  });
});
