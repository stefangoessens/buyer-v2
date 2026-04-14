import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEMPLATES,
  TAB_ORDER,
  TAB_LABELS,
  resolveTaskDueDate,
  selectApplicableTemplates,
  resolveOwnerRole,
  type ClosingTab,
  type TemplateContext,
  type ClosingTaskTemplate,
} from "@/lib/closing/taskTemplates";

const ONE_DAY_MS = 86_400_000;

describe("TAB_ORDER", () => {
  it("contains all six tabs in expected order", () => {
    expect(TAB_ORDER).toEqual([
      "title",
      "financing",
      "inspections",
      "insurance",
      "moving_in",
      "addendums",
    ]);
  });

  it("has a label for every tab", () => {
    for (const tab of TAB_ORDER) {
      expect(TAB_LABELS[tab]).toBeTruthy();
    }
  });
});

describe("DEFAULT_TEMPLATES", () => {
  it("every template has a unique templateKey", () => {
    const keys = DEFAULT_TEMPLATES.map((t) => t.templateKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("every template's tab is a valid ClosingTab", () => {
    const validTabs: ReadonlySet<ClosingTab> = new Set(TAB_ORDER);
    for (const template of DEFAULT_TEMPLATES) {
      expect(validTabs.has(template.tab)).toBe(true);
    }
  });

  it("covers every tab with at least one template", () => {
    const covered = new Set(DEFAULT_TEMPLATES.map((t) => t.tab));
    for (const tab of TAB_ORDER) {
      expect(covered.has(tab)).toBe(true);
    }
  });

  it("dynamic templates return false on the default empty context", () => {
    const dynamicTemplates = DEFAULT_TEMPLATES.filter((t) => !!t.includeWhen);
    expect(dynamicTemplates.length).toBeGreaterThan(0);
    const emptyCtx: TemplateContext = {};
    for (const template of dynamicTemplates) {
      expect(template.includeWhen!(emptyCtx)).toBe(false);
    }
  });
});

describe("resolveTaskDueDate", () => {
  const makeTemplate = (
    strategy: ClosingTaskTemplate["dueDateStrategy"],
  ): ClosingTaskTemplate => ({
    templateKey: "test_template",
    tab: "title",
    groupKey: "g",
    groupTitle: "G",
    title: "t",
    description: "d",
    category: "other",
    ownerRole: "broker",
    visibility: "buyer_visible",
    sortOrder: 0,
    dueDateStrategy: strategy,
  });

  it("march_1_next_tax_year returns March 1 of the year AFTER closingDate year (UTC)", () => {
    // Closing 2025-06-01 → homestead deadline 2026-03-01.
    const closingDate = Date.UTC(2025, 5, 1); // June 1 2025 UTC
    const result = resolveTaskDueDate(
      makeTemplate({ kind: "march_1_next_tax_year" }),
      { closingDate },
    );
    expect(result).toBe(Date.UTC(2026, 2, 1));
  });

  it("relative_to_closing with offset -10 returns closing minus 10 days", () => {
    const closingDate = Date.UTC(2026, 4, 15);
    const result = resolveTaskDueDate(
      makeTemplate({ kind: "relative_to_closing", offsetDays: -10 }),
      { closingDate },
    );
    expect(result).toBe(closingDate - 10 * ONE_DAY_MS);
  });

  it("relative_to_milestone with a missing milestone returns null", () => {
    const result = resolveTaskDueDate(
      makeTemplate({
        kind: "relative_to_milestone",
        milestoneKey: "does_not_exist",
        offsetDays: 0,
      }),
      { milestonesByKey: {} },
    );
    expect(result).toBeNull();
  });

  it("relative_to_milestone with a present milestone resolves correctly", () => {
    const milestoneDue = Date.UTC(2026, 3, 20);
    const result = resolveTaskDueDate(
      makeTemplate({
        kind: "relative_to_milestone",
        milestoneKey: "inspection_period_end",
        offsetDays: -2,
      }),
      {
        milestonesByKey: {
          inspection_period_end: { dueDate: milestoneDue, id: "ms_1" },
        },
      },
    );
    expect(result).toBe(milestoneDue - 2 * ONE_DAY_MS);
  });

  it("relative_to_closing without closingDate returns null", () => {
    const result = resolveTaskDueDate(
      makeTemplate({ kind: "relative_to_closing", offsetDays: -3 }),
      {},
    );
    expect(result).toBeNull();
  });

  it("strategy=none always returns null", () => {
    const result = resolveTaskDueDate(makeTemplate({ kind: "none" }), {
      closingDate: Date.UTC(2026, 5, 1),
    });
    expect(result).toBeNull();
  });
});

describe("selectApplicableTemplates", () => {
  it("includes templates without includeWhen predicates by default", () => {
    const result = selectApplicableTemplates(DEFAULT_TEMPLATES, {});
    const alwaysOn = DEFAULT_TEMPLATES.filter((t) => !t.includeWhen);
    expect(result.length).toBe(alwaysOn.length);
  });

  it("lead paint disclosure is included when yearBuilt < 1978", () => {
    const ctx: TemplateContext = { propertyYearBuilt: 1965 };
    const result = selectApplicableTemplates(DEFAULT_TEMPLATES, ctx);
    const keys = new Set(result.map((t) => t.templateKey));
    expect(keys.has("inspections_lead_paint_disclosure")).toBe(true);
  });

  it("permit followup is included when openPermitCount > 0", () => {
    const ctx: TemplateContext = { openPermitCount: 2 };
    const result = selectApplicableTemplates(DEFAULT_TEMPLATES, ctx);
    const keys = new Set(result.map((t) => t.templateKey));
    expect(keys.has("inspections_permit_violation_followup")).toBe(true);
  });

  it("flood policy is included only when floodZone is high-risk", () => {
    const ae = selectApplicableTemplates(DEFAULT_TEMPLATES, {
      floodZone: "AE",
    });
    const x = selectApplicableTemplates(DEFAULT_TEMPLATES, { floodZone: "X" });
    const aeKeys = new Set(ae.map((t) => t.templateKey));
    const xKeys = new Set(x.map((t) => t.templateKey));
    expect(aeKeys.has("insurance_flood_policy")).toBe(true);
    expect(xKeys.has("insurance_flood_policy")).toBe(false);
  });
});

describe("resolveOwnerRole", () => {
  it("maps shared → buyer, passes through others", () => {
    expect(resolveOwnerRole("shared")).toBe("buyer");
    expect(resolveOwnerRole("buyer")).toBe("buyer");
    expect(resolveOwnerRole("broker")).toBe("broker");
  });
});
