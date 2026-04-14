/**
 * Closing command center backend (KIN-1080).
 *
 * Powers the six-tab closing surface at /property/[propertyId]/closing.
 * Responsibilities:
 *   - Query the structured payload for the buyer or broker UI (role-filtered).
 *   - Query the broker board with stuck-deal signals.
 *   - Seed default tasks from the pure-TS template catalog on first open.
 *   - Update waiting-on state, manual due dates, and dependency chains.
 *   - Re-sync template-driven due dates after contract amendments.
 *
 * Role model:
 *   - Buyers see only buyer_visible tasks with the buyer-safe projection.
 *   - Brokers / admins see everything as-is.
 * Stripping happens at this server boundary, not in the client.
 */

import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth, requireRole } from "./lib/session";
import {
  DEFAULT_TEMPLATES,
  TAB_ORDER,
  resolveTaskDueDate,
  resolveOwnerRole,
  selectApplicableTemplates,
  type ClosingTab,
  type TemplateContext,
  type TemplateMilestoneRef,
} from "../src/lib/closing/taskTemplates";
import {
  computeResyncedTaskDueDates,
  type SyncCloseTaskRow,
} from "../src/lib/closing/deadlineSync";

// ─── Validators ──────────────────────────────────────────────────────────

const closingTabValidator = v.union(
  v.literal("title"),
  v.literal("financing"),
  v.literal("inspections"),
  v.literal("insurance"),
  v.literal("moving_in"),
  v.literal("addendums"),
);

const waitingOnRoleValidator = v.union(
  v.literal("buyer"),
  v.literal("broker"),
  v.literal("title_company"),
  v.literal("lender"),
  v.literal("inspector"),
  v.literal("insurance_agent"),
  v.literal("hoa"),
  v.literal("seller_side"),
  v.literal("moving_company"),
  v.literal("other"),
);

const blockedCodeValidator = v.union(
  v.literal("awaiting_response"),
  v.literal("awaiting_document"),
  v.literal("awaiting_quote"),
  v.literal("awaiting_schedule"),
  v.literal("awaiting_signature"),
  v.literal("awaiting_payment"),
  v.literal("dependency"),
  v.literal("other"),
);

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build the milestonesByKey map used by template resolution. Milestones
 * without a `milestoneKey` are skipped — they exist for display but
 * can't anchor a template date.
 */
function buildMilestonesByKey(
  milestones: ReadonlyArray<Doc<"contractMilestones">>,
): Record<string, TemplateMilestoneRef> {
  const result: Record<string, TemplateMilestoneRef> = {};
  for (const m of milestones) {
    if (!m.milestoneKey) continue;
    const parsed = Date.parse(m.dueDate);
    if (Number.isNaN(parsed)) continue;
    result[m.milestoneKey] = { dueDate: parsed, id: m._id };
  }
  return result;
}

/**
 * Hydrate a TemplateContext from the deal room's property + milestone
 * state. Read-only: used by both seed and command-center queries.
 */
async function buildTemplateContext(
  ctx: QueryCtx,
  dealRoom: Doc<"dealRooms">,
): Promise<TemplateContext> {
  const property = await ctx.db.get(dealRoom.propertyId);

  const milestones = await ctx.db
    .query("contractMilestones")
    .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", dealRoom._id))
    .collect();
  const milestonesByKey = buildMilestonesByKey(milestones);

  const closingMilestone = milestones.find((m) => m.workstream === "closing");
  let closingDate: number | null = null;
  if (closingMilestone) {
    const parsed = Date.parse(closingMilestone.dueDate);
    if (!Number.isNaN(parsed)) closingDate = parsed;
  }
  if (closingDate === null) {
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", dealRoom._id))
      .collect();
    for (const offer of offers) {
      if (offer.closingDate) {
        const parsed = Date.parse(offer.closingDate);
        if (!Number.isNaN(parsed)) {
          closingDate = parsed;
          break;
        }
      }
    }
  }

  // openPermitsCount lives in propertyPermits keyed by propertyId.
  const permitRow = await ctx.db
    .query("propertyPermits")
    .withIndex("by_propertyId", (q) => q.eq("propertyId", dealRoom.propertyId))
    .unique();

  return {
    propertyYearBuilt: property?.yearBuilt ?? null,
    floodZone: property?.femaFloodZone ?? property?.floodZone ?? null,
    openPermitCount: permitRow?.openPermitsCount ?? null,
    closingDate,
    milestonesByKey,
  };
}

// ─── Output validators ──────────────────────────────────────────────────

const commandCenterTaskValidator = v.object({
  _id: v.id("closeTasks"),
  _creationTime: v.number(),
  dealRoomId: v.id("dealRooms"),
  title: v.string(),
  description: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("blocked"),
    v.literal("canceled"),
  ),
  tab: v.optional(closingTabValidator),
  groupKey: v.optional(v.string()),
  groupTitle: v.optional(v.string()),
  templateKey: v.optional(v.string()),
  sortOrder: v.optional(v.number()),
  dueDate: v.optional(v.string()),
  manuallyOverriddenDueDate: v.optional(v.boolean()),
  waitingOnRole: v.optional(waitingOnRoleValidator),
  blockedCode: v.optional(blockedCodeValidator),
  blockedTaskIds: v.optional(v.array(v.id("closeTasks"))),
  dependsOn: v.optional(v.array(v.id("closeTasks"))),
  ownerRole: v.string(),
  visibility: v.union(
    v.literal("buyer_visible"),
    v.literal("internal_only"),
  ),
});

const commandCenterGroupValidator = v.object({
  groupKey: v.string(),
  groupTitle: v.string(),
  tasks: v.array(commandCenterTaskValidator),
});

const commandCenterTabValidator = v.object({
  tab: closingTabValidator,
  label: v.string(),
  groups: v.array(commandCenterGroupValidator),
  counts: v.object({
    total: v.number(),
    pending: v.number(),
    in_progress: v.number(),
    completed: v.number(),
    blocked: v.number(),
    canceled: v.number(),
  }),
});

const commandCenterMilestoneValidator = v.object({
  _id: v.id("contractMilestones"),
  name: v.string(),
  milestoneKey: v.optional(v.string()),
  workstream: v.string(),
  dueDate: v.string(),
  status: v.string(),
});

const commandCenterPayloadValidator = v.object({
  dealRoom: v.object({
    _id: v.id("dealRooms"),
    propertyId: v.id("properties"),
    buyerId: v.id("users"),
    status: v.string(),
  }),
  summary: v.object({
    total: v.number(),
    pending: v.number(),
    inProgress: v.number(),
    completed: v.number(),
    blocked: v.number(),
    canceled: v.number(),
    overdue: v.number(),
    percentComplete: v.number(),
  }),
  tabs: v.array(commandCenterTabValidator),
  milestones: v.array(commandCenterMilestoneValidator),
  viewerLevel: v.union(
    v.literal("buyer"),
    v.literal("broker"),
    v.literal("admin"),
  ),
});

const commandCenterPayloadOrNull = v.union(
  v.null(),
  commandCenterPayloadValidator,
);

// ─── Payload builder ─────────────────────────────────────────────────────

type ViewerLevel = "buyer" | "broker" | "admin";

interface CommandCenterTaskRow {
  _id: Id<"closeTasks">;
  _creationTime: number;
  dealRoomId: Id<"dealRooms">;
  title: string;
  description?: string;
  status:
    | "pending"
    | "in_progress"
    | "completed"
    | "blocked"
    | "canceled";
  tab?: ClosingTab;
  groupKey?: string;
  groupTitle?: string;
  templateKey?: string;
  sortOrder?: number;
  dueDate?: string;
  manuallyOverriddenDueDate?: boolean;
  waitingOnRole?:
    | "buyer"
    | "broker"
    | "title_company"
    | "lender"
    | "inspector"
    | "insurance_agent"
    | "hoa"
    | "seller_side"
    | "moving_company"
    | "other";
  blockedCode?:
    | "awaiting_response"
    | "awaiting_document"
    | "awaiting_quote"
    | "awaiting_schedule"
    | "awaiting_signature"
    | "awaiting_payment"
    | "dependency"
    | "other";
  blockedTaskIds?: Array<Id<"closeTasks">>;
  dependsOn?: Array<Id<"closeTasks">>;
  ownerRole: string;
  visibility: "buyer_visible" | "internal_only";
}

function projectTaskForCommandCenter(
  task: Doc<"closeTasks">,
): CommandCenterTaskRow {
  return {
    _id: task._id,
    _creationTime: task._creationTime,
    dealRoomId: task.dealRoomId,
    title: task.title,
    description: task.description,
    status: task.status,
    tab: task.tab,
    groupKey: task.groupKey,
    groupTitle: task.groupTitle,
    templateKey: task.templateKey,
    sortOrder: task.sortOrder,
    dueDate: task.dueDate,
    manuallyOverriddenDueDate: task.manuallyOverriddenDueDate,
    waitingOnRole: task.waitingOnRole,
    blockedCode: task.blockedCode,
    blockedTaskIds: task.blockedTaskIds,
    dependsOn: task.dependsOn,
    ownerRole: task.ownerRole,
    visibility: task.visibility,
  };
}

function countOverdueTasks(
  tasks: ReadonlyArray<Doc<"closeTasks">>,
  todayIso: string,
): number {
  return tasks.filter(
    (t) =>
      t.dueDate !== undefined &&
      t.dueDate < todayIso &&
      t.status !== "completed" &&
      t.status !== "canceled",
  ).length;
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const getCommandCenter = query({
  args: { dealRoomId: v.id("dealRooms") },
  returns: commandCenterPayloadOrNull,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return null;

    const isBuyer = dealRoom.buyerId === user._id;
    const isBroker = user.role === "broker";
    const isAdmin = user.role === "admin";
    if (!isBuyer && !isBroker && !isAdmin) {
      return null;
    }
    const viewerLevel: ViewerLevel = isAdmin
      ? "admin"
      : isBroker
        ? "broker"
        : "buyer";

    const rawTasks = await ctx.db
      .query("closeTasks")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const visibleTasks =
      viewerLevel === "buyer"
        ? rawTasks.filter((t) => t.visibility === "buyer_visible")
        : rawTasks;

    const milestones = await ctx.db
      .query("contractMilestones")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    // Group by tab → groupKey. Tasks without a tab go into a synthetic
    // "unsorted" group on the first tab so legacy close tasks still show.
    const tabBuckets: Record<ClosingTab, Doc<"closeTasks">[]> = {
      title: [],
      financing: [],
      inspections: [],
      insurance: [],
      moving_in: [],
      addendums: [],
    };
    const unsorted: Doc<"closeTasks">[] = [];
    for (const task of visibleTasks) {
      if (task.tab && task.tab in tabBuckets) {
        tabBuckets[task.tab].push(task);
      } else {
        unsorted.push(task);
      }
    }

    const TAB_LABELS: Record<ClosingTab, string> = {
      title: "Title",
      financing: "Financing",
      inspections: "Inspections",
      insurance: "Insurance",
      moving_in: "Moving in",
      addendums: "Additional addendums",
    };

    const tabs = TAB_ORDER.map((tab) => {
      const bucket = tabBuckets[tab];
      const withUnsorted =
        tab === "title" && unsorted.length > 0
          ? [...bucket, ...unsorted]
          : bucket;

      const grouped = new Map<
        string,
        { groupKey: string; groupTitle: string; tasks: CommandCenterTaskRow[] }
      >();
      for (const task of withUnsorted) {
        const groupKey = task.groupKey ?? "ungrouped";
        const groupTitle = task.groupTitle ?? "Other";
        let bucket2 = grouped.get(groupKey);
        if (!bucket2) {
          bucket2 = { groupKey, groupTitle, tasks: [] };
          grouped.set(groupKey, bucket2);
        }
        bucket2.tasks.push(projectTaskForCommandCenter(task));
      }

      const groups = Array.from(grouped.values()).map((g) => ({
        ...g,
        tasks: g.tasks.sort(
          (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999),
        ),
      }));

      const counts = {
        total: bucket.length,
        pending: bucket.filter((t) => t.status === "pending").length,
        in_progress: bucket.filter((t) => t.status === "in_progress").length,
        completed: bucket.filter((t) => t.status === "completed").length,
        blocked: bucket.filter((t) => t.status === "blocked").length,
        canceled: bucket.filter((t) => t.status === "canceled").length,
      };

      return {
        tab,
        label: TAB_LABELS[tab],
        groups,
        counts,
      };
    });

    const todayIso = new Date().toISOString().slice(0, 10);
    const total = visibleTasks.length;
    const completed = visibleTasks.filter((t) => t.status === "completed").length;
    const summary = {
      total,
      pending: visibleTasks.filter((t) => t.status === "pending").length,
      inProgress: visibleTasks.filter((t) => t.status === "in_progress").length,
      completed,
      blocked: visibleTasks.filter((t) => t.status === "blocked").length,
      canceled: visibleTasks.filter((t) => t.status === "canceled").length,
      overdue: countOverdueTasks(visibleTasks, todayIso),
      percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
    };

    const visibleMilestones = milestones.filter((m) => {
      if (viewerLevel !== "buyer") return true;
      return m.status !== "needs_review";
    });

    return {
      dealRoom: {
        _id: dealRoom._id,
        propertyId: dealRoom.propertyId,
        buyerId: dealRoom.buyerId,
        status: dealRoom.status,
      },
      summary,
      tabs,
      milestones: visibleMilestones.map((m) => ({
        _id: m._id,
        name: m.name,
        milestoneKey: m.milestoneKey,
        workstream: m.workstream,
        dueDate: m.dueDate,
        status: m.status,
      })),
      viewerLevel,
    };
  },
});

const brokerBoardDealValidator = v.object({
  dealRoomId: v.id("dealRooms"),
  propertyId: v.id("properties"),
  buyerId: v.id("users"),
  status: v.string(),
  counts: v.object({
    total: v.number(),
    completed: v.number(),
    blocked: v.number(),
    overdue: v.number(),
  }),
  stuckSignals: v.array(v.string()),
  isStuck: v.boolean(),
  percentComplete: v.number(),
  // KIN-1080 broker board: dates are epoch ms so the UI can sort and
  // format consistently. `waitingOnRole` surfaces the currently-blocking
  // party for the deal card's "waiting on" pill.
  closingDate: v.union(v.number(), v.null()),
  nextDueDate: v.union(v.number(), v.null()),
  waitingOnRole: v.union(v.string(), v.null()),
});

export const getBrokerBoardData = query({
  args: {},
  returns: v.array(brokerBoardDealValidator),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (user.role !== "broker" && user.role !== "admin") {
      return [];
    }

    // Active deals = under_contract or closing. Closed, withdrawn, and
    // earlier stages are excluded from the broker board.
    const allDealRooms = await ctx.db.query("dealRooms").collect();
    const active = allDealRooms.filter(
      (d) => d.status === "under_contract" || d.status === "closing",
    );

    const todayIso = new Date().toISOString().slice(0, 10);
    const STALE_WAITING_ON_DAYS_MS = 5 * 86_400_000;
    const now = Date.now();

    const rows = [];
    for (const deal of active) {
      const tasks = await ctx.db
        .query("closeTasks")
        .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", deal._id))
        .collect();
      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === "completed").length;
      const blocked = tasks.filter((t) => t.status === "blocked").length;
      const overdue = countOverdueTasks(tasks, todayIso);

      const stuckSignals: string[] = [];
      if (blocked > 0) stuckSignals.push(`${blocked}_blocked`);
      if (overdue > 0) stuckSignals.push(`${overdue}_overdue`);
      // "Stale waitingOn" heuristic: any task where waitingOnRole is set
      // and it hasn't been updated in the last 5 days. We approximate
      // "last update" with _creationTime since we don't write updatedAt
      // on waitingOn toggles today; acceptable for first cut.
      const staleWaiting = tasks.filter(
        (t) =>
          t.waitingOnRole !== undefined &&
          t.status !== "completed" &&
          t.status !== "canceled" &&
          now - t._creationTime > STALE_WAITING_ON_DAYS_MS,
      ).length;
      if (staleWaiting > 0) stuckSignals.push(`${staleWaiting}_stale_waiting`);

      // Resolve closingDate: prefer a contract milestone tagged as
      // workstream="closing" OR milestoneKey="closing_date". Among
      // candidates, pick the earliest non-completed date; if all are
      // completed, fall back to the earliest one regardless.
      const milestones = await ctx.db
        .query("contractMilestones")
        .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", deal._id))
        .collect();
      const closingCandidates = milestones.filter(
        (m) => m.workstream === "closing" || m.milestoneKey === "closing_date",
      );
      let closingDate: number | null = null;
      const parseDate = (iso: string): number | null => {
        const parsed = Date.parse(iso);
        return Number.isNaN(parsed) ? null : parsed;
      };
      const uncompletedClosing = closingCandidates
        .filter((m) => m.status !== "completed")
        .map((m) => parseDate(m.dueDate))
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
      if (uncompletedClosing.length > 0) {
        closingDate = uncompletedClosing[0];
      } else {
        const anyClosing = closingCandidates
          .map((m) => parseDate(m.dueDate))
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b);
        if (anyClosing.length > 0) closingDate = anyClosing[0];
      }

      // nextDueDate: the smallest future-or-present due date across
      // uncompleted tasks that have a dueDate set.
      const activeDueMs = tasks
        .filter((t) => t.status !== "completed" && t.status !== "canceled")
        .map((t) =>
          t.dueDate ? parseDate(t.dueDate) : null,
        )
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
      const nextDueDate = activeDueMs.length > 0 ? activeDueMs[0] : null;

      // waitingOnRole: prefer a blocked task's waitingOnRole; otherwise
      // any uncompleted task that has a waitingOnRole set.
      const blockedWithRole = tasks.find(
        (t) => t.status === "blocked" && t.waitingOnRole !== undefined,
      );
      const anyActiveWithRole = tasks.find(
        (t) =>
          t.status !== "completed" &&
          t.status !== "canceled" &&
          t.waitingOnRole !== undefined,
      );
      const waitingOnRole: string | null =
        blockedWithRole?.waitingOnRole ??
        anyActiveWithRole?.waitingOnRole ??
        null;

      rows.push({
        dealRoomId: deal._id,
        propertyId: deal.propertyId,
        buyerId: deal.buyerId,
        status: deal.status,
        counts: { total, completed, blocked, overdue },
        stuckSignals,
        isStuck: stuckSignals.length > 0,
        percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
        closingDate,
        nextDueDate,
        waitingOnRole,
      });
    }
    return rows;
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────

/**
 * Seed default closing tasks for a deal room. Idempotent — a task is
 * only inserted when there's no existing row with a matching
 * (dealRoomId, templateKey) pair. Dynamic templates (e.g. lead paint)
 * only seed when their includeWhen predicate passes against the
 * property context.
 */
export const seedDefaultTasks = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.object({
    seededCount: v.number(),
    skippedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const templateContext = await buildTemplateContext(ctx, dealRoom);
    const applicable = selectApplicableTemplates(
      DEFAULT_TEMPLATES,
      templateContext,
    );

    const existing = await ctx.db
      .query("closeTasks")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const existingTemplateKeys = new Set(
      existing
        .map((t) => t.templateKey)
        .filter((k): k is string => typeof k === "string"),
    );

    const nowIso = new Date().toISOString();
    let seededCount = 0;
    let skippedCount = 0;

    for (const template of applicable) {
      if (existingTemplateKeys.has(template.templateKey)) {
        skippedCount++;
        continue;
      }
      const computedDueMs = resolveTaskDueDate(template, templateContext);
      const dueDateIso =
        computedDueMs !== null
          ? new Date(computedDueMs).toISOString()
          : undefined;

      // Link to contract milestone when the template points at one.
      let contractMilestoneId: Id<"contractMilestones"> | undefined;
      if (template.dueDateStrategy.kind === "relative_to_milestone") {
        const ref =
          templateContext.milestonesByKey?.[
            template.dueDateStrategy.milestoneKey
          ];
        if (ref) {
          contractMilestoneId = ref.id as Id<"contractMilestones">;
        }
      }

      const id = await ctx.db.insert("closeTasks", {
        dealRoomId: args.dealRoomId,
        title: template.title,
        description: template.description,
        category: template.category,
        status: "pending",
        visibility: template.visibility,
        ownerRole: resolveOwnerRole(template.ownerRole),
        dueDate: dueDateIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        tab: template.tab,
        groupKey: template.groupKey,
        groupTitle: template.groupTitle,
        templateKey: template.templateKey,
        sortOrder: template.sortOrder,
        contractMilestoneId,
        manuallyOverriddenDueDate: false,
      });

      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "closing_task_seeded",
        entityType: "closeTasks",
        entityId: id,
        details: JSON.stringify({
          dealRoomId: args.dealRoomId,
          templateKey: template.templateKey,
          tab: template.tab,
        }),
        timestamp: nowIso,
      });

      seededCount++;
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "closing_template_seed_run",
      entityType: "dealRooms",
      entityId: args.dealRoomId,
      details: JSON.stringify({ seededCount, skippedCount }),
      timestamp: nowIso,
    });

    return { seededCount, skippedCount };
  },
});

/**
 * Idempotent wrapper: if the deal room is in under_contract or closing
 * status and has no seeded (templateKey-bearing) tasks yet, run
 * seedDefaultTasks. Safe to call on every page render.
 */
export const ensureSeededOnOpen = mutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.object({ didSeed: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) throw new Error("Deal room not found");

    const isBuyer = dealRoom.buyerId === user._id;
    const isStaff = user.role === "broker" || user.role === "admin";
    if (!isBuyer && !isStaff) {
      throw new Error("Not authorized for this deal room");
    }
    if (dealRoom.status !== "under_contract" && dealRoom.status !== "closing") {
      return { didSeed: false };
    }

    const existing = await ctx.db
      .query("closeTasks")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();
    const hasSeeded = existing.some((t) => typeof t.templateKey === "string");
    if (hasSeeded) {
      return { didSeed: false };
    }

    // Only staff can actually seed. Buyers hitting the page don't
    // trigger a write — they just see an empty state until the broker
    // opens it.
    if (!isStaff) {
      return { didSeed: false };
    }

    const templateContext = await buildTemplateContext(ctx, dealRoom);
    const applicable = selectApplicableTemplates(
      DEFAULT_TEMPLATES,
      templateContext,
    );
    const nowIso = new Date().toISOString();
    let seededCount = 0;
    for (const template of applicable) {
      const computedDueMs = resolveTaskDueDate(template, templateContext);
      const dueDateIso =
        computedDueMs !== null
          ? new Date(computedDueMs).toISOString()
          : undefined;
      let contractMilestoneId: Id<"contractMilestones"> | undefined;
      if (template.dueDateStrategy.kind === "relative_to_milestone") {
        const ref =
          templateContext.milestonesByKey?.[
            template.dueDateStrategy.milestoneKey
          ];
        if (ref) {
          contractMilestoneId = ref.id as Id<"contractMilestones">;
        }
      }
      const id = await ctx.db.insert("closeTasks", {
        dealRoomId: args.dealRoomId,
        title: template.title,
        description: template.description,
        category: template.category,
        status: "pending",
        visibility: template.visibility,
        ownerRole: resolveOwnerRole(template.ownerRole),
        dueDate: dueDateIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        tab: template.tab,
        groupKey: template.groupKey,
        groupTitle: template.groupTitle,
        templateKey: template.templateKey,
        sortOrder: template.sortOrder,
        contractMilestoneId,
        manuallyOverriddenDueDate: false,
      });
      await ctx.db.insert("auditLog", {
        userId: user._id,
        action: "closing_task_seeded",
        entityType: "closeTasks",
        entityId: id,
        details: JSON.stringify({
          dealRoomId: args.dealRoomId,
          templateKey: template.templateKey,
          tab: template.tab,
        }),
        timestamp: nowIso,
      });
      seededCount++;
    }

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "closing_template_seed_run",
      entityType: "dealRooms",
      entityId: args.dealRoomId,
      details: JSON.stringify({ seededCount, via: "ensureSeededOnOpen" }),
      timestamp: nowIso,
    });

    return { didSeed: seededCount > 0 };
  },
});

/**
 * Set the waiting-on state for a task. If blockedCode is "dependency",
 * blockedTaskIds must be provided — those are the upstream tasks this
 * one is waiting on. The task's status is NOT changed here: callers
 * should pair this with a transitionStatus call when they want to move
 * to "blocked".
 */
export const setTaskWaitingOn = mutation({
  args: {
    taskId: v.id("closeTasks"),
    waitingOnRole: waitingOnRoleValidator,
    blockedCode: blockedCodeValidator,
    blockedTaskIds: v.optional(v.array(v.id("closeTasks"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (args.blockedCode === "dependency" && !args.blockedTaskIds?.length) {
      throw new Error("blockedTaskIds required when blockedCode is 'dependency'");
    }

    const nowIso = new Date().toISOString();
    await ctx.db.patch(args.taskId, {
      waitingOnRole: args.waitingOnRole,
      blockedCode: args.blockedCode,
      blockedTaskIds: args.blockedTaskIds,
      updatedAt: nowIso,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "closing_task_waiting_on_changed",
      entityType: "closeTasks",
      entityId: args.taskId,
      details: JSON.stringify({
        waitingOnRole: args.waitingOnRole,
        blockedCode: args.blockedCode,
        blockedTaskIds: args.blockedTaskIds ?? [],
      }),
      timestamp: nowIso,
    });

    return null;
  },
});

/**
 * Set a manual due date on a task. This pins the task against future
 * template-driven resyncs — the deadline sync helper skips any row
 * where manuallyOverriddenDueDate is true.
 */
export const setManualDueDate = mutation({
  args: {
    taskId: v.id("closeTasks"),
    dueDate: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "broker");
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const nowIso = new Date().toISOString();
    const dueDateIso = new Date(args.dueDate).toISOString();
    await ctx.db.patch(args.taskId, {
      dueDate: dueDateIso,
      manuallyOverriddenDueDate: true,
      updatedAt: nowIso,
    });

    await ctx.db.insert("auditLog", {
      userId: user._id,
      action: "closing_task_manual_due_date_set",
      entityType: "closeTasks",
      entityId: args.taskId,
      details: JSON.stringify({
        dueDate: dueDateIso,
        previousDueDate: task.dueDate,
      }),
      timestamp: nowIso,
    });

    return null;
  },
});

// ─── Internal mutations ──────────────────────────────────────────────────

/**
 * Re-sync every template-driven task for a deal room against the
 * current milestone + closing-date context. Tasks with
 * manuallyOverriddenDueDate=true are preserved. Called from contract
 * milestone write paths so amendments flow through to the tasks.
 */
export const syncClosingTaskDeadlinesFromMilestones = internalMutation({
  args: { dealRoomId: v.id("dealRooms") },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    const dealRoom = await ctx.db.get(args.dealRoomId);
    if (!dealRoom) return { updatedCount: 0 };

    const templateContext = await buildTemplateContext(ctx, dealRoom);

    const tasks = await ctx.db
      .query("closeTasks")
      .withIndex("by_dealRoomId", (q) => q.eq("dealRoomId", args.dealRoomId))
      .collect();

    const syncRows: SyncCloseTaskRow[] = tasks.map((t) => ({
      _id: t._id,
      templateKey: t.templateKey,
      dueDate: t.dueDate ? Date.parse(t.dueDate) : null,
      manuallyOverriddenDueDate: t.manuallyOverriddenDueDate,
    }));

    const updates = computeResyncedTaskDueDates(
      syncRows,
      templateContext.milestonesByKey ?? {},
      templateContext.closingDate ?? null,
    );

    const nowIso = new Date().toISOString();
    let updatedCount = 0;
    for (const [taskId, newDueMs] of updates) {
      const newDueIso =
        newDueMs !== null ? new Date(newDueMs).toISOString() : undefined;
      await ctx.db.patch(taskId as Id<"closeTasks">, {
        dueDate: newDueIso,
        updatedAt: nowIso,
      });
      await ctx.db.insert("auditLog", {
        action: "closing_task_deadline_resynced",
        entityType: "closeTasks",
        entityId: taskId,
        details: JSON.stringify({
          newDueDate: newDueIso,
          dealRoomId: args.dealRoomId,
        }),
        timestamp: nowIso,
      });
      updatedCount++;
    }

    if (updatedCount > 0) {
      await ctx.db.insert("auditLog", {
        action: "closing_amendment_triggered_resync",
        entityType: "dealRooms",
        entityId: args.dealRoomId,
        details: JSON.stringify({ updatedCount }),
        timestamp: nowIso,
      });
    }

    return { updatedCount };
  },
});

/**
 * When a task transitions to completed, find all tasks that depend on
 * it. If a dependent task is currently blocked with
 * blockedCode="dependency" AND every task in its blockedTaskIds is now
 * completed, move it back to pending and clear the blocking state.
 */
export const unblockDependents = internalMutation({
  args: { taskId: v.id("closeTasks") },
  returns: v.object({ unblockedCount: v.number() }),
  handler: async (ctx, args) => {
    const completedTask = await ctx.db.get(args.taskId);
    if (!completedTask || completedTask.status !== "completed") {
      return { unblockedCount: 0 };
    }

    const siblings = await ctx.db
      .query("closeTasks")
      .withIndex("by_dealRoomId", (q) =>
        q.eq("dealRoomId", completedTask.dealRoomId),
      )
      .collect();

    const nowIso = new Date().toISOString();
    let unblockedCount = 0;
    for (const sibling of siblings) {
      if (sibling._id === args.taskId) continue;
      if (sibling.status !== "blocked") continue;
      if (sibling.blockedCode !== "dependency") continue;
      const deps = sibling.blockedTaskIds ?? [];
      if (!deps.includes(args.taskId)) continue;

      // Check every upstream is completed.
      let allUpstreamDone = true;
      for (const upstreamId of deps) {
        const upstream = await ctx.db.get(upstreamId);
        if (!upstream || upstream.status !== "completed") {
          allUpstreamDone = false;
          break;
        }
      }
      if (!allUpstreamDone) continue;

      await ctx.db.patch(sibling._id, {
        status: "pending",
        blockedCode: undefined,
        blockedTaskIds: undefined,
        blockedReason: undefined,
        updatedAt: nowIso,
      });

      await ctx.db.insert("auditLog", {
        action: "closing_dependency_unblocked",
        entityType: "closeTasks",
        entityId: sibling._id,
        details: JSON.stringify({
          unblockedBy: args.taskId,
          dealRoomId: completedTask.dealRoomId,
        }),
        timestamp: nowIso,
      });

      unblockedCount++;
    }

    return { unblockedCount };
  },
});

