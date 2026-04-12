/**
 * Pure grouping / urgency / weekly-plan logic for the close dashboard.
 *
 * No Convex imports, no I/O, fully testable offline. The convex query
 * layer invokes these helpers after fetching milestones via the existing
 * contractMilestones module.
 */

import type {
  CloseDashboardData,
  CloseDashboardMilestone,
  MilestoneStatus,
  NextStepSummary,
  ResponsibleParty,
  Urgency,
  WeeklyPlan,
  WeeklyPlanItem,
  Workstream,
  WorkstreamGroup,
} from "./close-dashboard-types";
import { WORKSTREAM_ORDER } from "./close-dashboard-types";

export interface RawMilestone {
  _id: string;
  name: string;
  workstream: Workstream;
  dueDate: string;
  status: MilestoneStatus;
  completedAt?: string;
}

export interface BuildDashboardInput {
  dealRoomId: string;
  propertyAddress: string;
  closeDate: string | null;
  milestones: RawMilestone[];
  now?: string; // ISO date, injected for deterministic tests
}

const MS_PER_DAY = 86_400_000;

function parseDateOnly(iso: string): number {
  // Treat ISO YYYY-MM-DD as midnight UTC to keep the day-math deterministic
  // regardless of local timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return Date.parse(`${iso}T00:00:00Z`);
  }
  return Date.parse(iso);
}

export function daysBetween(now: string, iso: string): number {
  const nowDay = parseDateOnly(now.slice(0, 10));
  const target = parseDateOnly(iso.slice(0, 10));
  return Math.round((target - nowDay) / MS_PER_DAY);
}

export function classifyUrgency(
  milestone: RawMilestone,
  days: number,
): Urgency {
  if (milestone.status === "completed") return "completed";
  if (days < 0) return "overdue";
  if (days <= 7) return "this_week";
  if (days <= 14) return "next_week";
  return "later";
}

const PARTY_BY_WORKSTREAM: Record<Workstream, ResponsibleParty> = {
  inspection: "inspector",
  financing: "lender",
  appraisal: "lender",
  title: "title_company",
  insurance: "buyer",
  escrow: "title_company",
  hoa: "hoa",
  walkthrough: "buyer",
  closing: "title_company",
  other: "unknown",
};

const BUYER_DRIVEN_KEYWORDS = [
  "buyer",
  "review",
  "sign",
  "schedule",
  "select",
  "pay",
  "deposit",
  "upload",
  "submit",
];

export function inferResponsibleParty(
  milestone: RawMilestone,
): ResponsibleParty {
  const nameLower = milestone.name.toLowerCase();
  for (const keyword of BUYER_DRIVEN_KEYWORDS) {
    if (nameLower.includes(keyword)) return "buyer";
  }
  return PARTY_BY_WORKSTREAM[milestone.workstream] ?? "unknown";
}

export function toCloseDashboardMilestone(
  raw: RawMilestone,
  now: string,
): CloseDashboardMilestone {
  const days = daysBetween(now, raw.dueDate);
  return {
    id: raw._id,
    name: raw.name,
    workstream: raw.workstream,
    dueDate: raw.dueDate,
    status: raw.status,
    completedAt: raw.completedAt,
    responsibleParty: inferResponsibleParty(raw),
    daysUntilDue: days,
    urgency: classifyUrgency(raw, days),
  };
}

export function groupByWorkstream(
  milestones: CloseDashboardMilestone[],
): WorkstreamGroup[] {
  const byStream: Map<Workstream, CloseDashboardMilestone[]> = new Map();
  for (const m of milestones) {
    const list = byStream.get(m.workstream) ?? [];
    list.push(m);
    byStream.set(m.workstream, list);
  }
  const groups: WorkstreamGroup[] = [];
  for (const workstream of WORKSTREAM_ORDER) {
    const list = byStream.get(workstream);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const pending = list.filter((m) => m.status === "pending").length;
    const overdue = list.filter((m) => m.status === "overdue").length;
    const completed = list.filter((m) => m.status === "completed").length;
    const nextDue =
      list.find((m) => m.status !== "completed")?.dueDate ?? null;
    groups.push({
      workstream,
      milestones: list,
      pendingCount: pending,
      overdueCount: overdue,
      completedCount: completed,
      nextDueDate: nextDue,
    });
  }
  return groups;
}

function isNeedsAttention(m: CloseDashboardMilestone): boolean {
  if (m.status === "completed") return false;
  if (m.urgency === "overdue") return true;
  if (m.urgency === "this_week" && m.responsibleParty === "buyer") return true;
  return false;
}

function isWaitingOnOthers(m: CloseDashboardMilestone): boolean {
  if (m.status === "completed") return false;
  return m.responsibleParty !== "buyer" && m.status !== "overdue";
}

function isOnTrack(m: CloseDashboardMilestone): boolean {
  if (m.status === "completed") return true;
  return !isNeedsAttention(m) && !isWaitingOnOthers(m);
}

export function buildNextStep(
  milestones: CloseDashboardMilestone[],
): NextStepSummary {
  const overdue = milestones
    .filter((m) => m.urgency === "overdue")
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  if (overdue.length > 0) {
    const m = overdue[0];
    return {
      headline: `${m.name} is overdue`,
      body: `This milestone was due ${Math.abs(m.daysUntilDue)} day${Math.abs(m.daysUntilDue) === 1 ? "" : "s"} ago. Resolve it to keep the close on track.`,
      action: "Review and resolve",
      dueDate: m.dueDate,
      urgency: "overdue",
    };
  }
  const thisWeekBuyer = milestones
    .filter((m) => isNeedsAttention(m))
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  if (thisWeekBuyer.length > 0) {
    const m = thisWeekBuyer[0];
    return {
      headline: m.name,
      body:
        m.daysUntilDue === 0
          ? "Due today — take care of this before end of day."
          : `Due in ${m.daysUntilDue} day${m.daysUntilDue === 1 ? "" : "s"}.`,
      action: "Start now",
      dueDate: m.dueDate,
      urgency: "this_week",
    };
  }
  const upcoming = milestones
    .filter((m) => m.status !== "completed")
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  if (upcoming.length > 0) {
    const m = upcoming[0];
    return {
      headline: `Next up: ${m.name}`,
      body: `Due in ${m.daysUntilDue} days — waiting on ${m.responsibleParty.replace(/_/g, " ")}.`,
      dueDate: m.dueDate,
      urgency: m.urgency,
    };
  }
  return {
    headline: "You're all caught up",
    body: "Every milestone is resolved. Congrats!",
    urgency: "completed",
  };
}

export function buildWeeklyPlan(
  milestones: CloseDashboardMilestone[],
  now: string,
): WeeklyPlan {
  const start = now.slice(0, 10);
  const endDate = new Date(parseDateOnly(start) + 6 * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  const inWindow = (m: CloseDashboardMilestone) =>
    m.daysUntilDue >= 0 && m.daysUntilDue <= 7 && m.status !== "completed";

  const actionsThisWeek: WeeklyPlanItem[] = milestones
    .filter((m) => inWindow(m) && m.responsibleParty === "buyer")
    .map((m) => ({
      milestone: m,
      kind: "action",
      reason: `You own this${m.daysUntilDue === 0 ? " — due today" : ""}.`,
    }));

  const deadlinesThisWeek: WeeklyPlanItem[] = milestones
    .filter((m) => inWindow(m))
    .map((m) => ({
      milestone: m,
      kind: "deadline",
      reason: `Due ${m.dueDate}`,
    }));

  const blockedOnOthers: WeeklyPlanItem[] = milestones
    .filter(
      (m) =>
        m.status !== "completed" &&
        m.responsibleParty !== "buyer" &&
        m.daysUntilDue <= 14,
    )
    .map((m) => ({
      milestone: m,
      kind: "waiting",
      reason: `Waiting on ${m.responsibleParty.replace(/_/g, " ")}`,
    }));

  const headline = actionsThisWeek.length > 0
    ? `${actionsThisWeek.length} action${actionsThisWeek.length === 1 ? "" : "s"} this week`
    : deadlinesThisWeek.length > 0
      ? `${deadlinesThisWeek.length} deadline${deadlinesThisWeek.length === 1 ? "" : "s"} this week`
      : "Quiet week — waiting on partners.";

  const summary = [
    actionsThisWeek.length > 0
      ? `${actionsThisWeek.length} for you`
      : "0 actions",
    `${deadlinesThisWeek.length} deadlines`,
    `${blockedOnOthers.length} waiting on others`,
  ].join(" · ");

  return {
    weekStartDate: start,
    weekEndDate: endDate,
    actionsThisWeek,
    deadlinesThisWeek,
    blockedOnOthers,
    headline,
    summary,
  };
}

export function buildCloseDashboard(
  input: BuildDashboardInput,
): CloseDashboardData {
  const now = input.now ?? new Date().toISOString();
  const milestones = input.milestones.map((m) =>
    toCloseDashboardMilestone(m, now),
  );

  const needsAttention = milestones
    .filter(isNeedsAttention)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const waitingOnOthers = milestones
    .filter(isWaitingOnOthers)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const onTrack = milestones
    .filter(isOnTrack)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const byWorkstream = groupByWorkstream(milestones);
  const nextStep = buildNextStep(milestones);
  const weeklyPlan = buildWeeklyPlan(milestones, now);

  const pending = milestones.filter((m) => m.status === "pending").length;
  const completed = milestones.filter((m) => m.status === "completed").length;
  const overdue = milestones.filter((m) => m.status === "overdue").length;
  const onTrackPct =
    milestones.length > 0
      ? (completed + Math.max(0, onTrack.length - completed)) /
        milestones.length
      : 1;

  const daysToClose = input.closeDate
    ? Math.max(0, daysBetween(now, input.closeDate))
    : null;

  return {
    dealRoomId: input.dealRoomId,
    propertyAddress: input.propertyAddress,
    closeDate: input.closeDate,
    daysToClose,
    totalMilestones: milestones.length,
    pendingMilestones: pending,
    completedMilestones: completed,
    overdueMilestones: overdue,
    onTrackPct: Math.min(1, Math.max(0, onTrackPct)),
    needsAttention,
    waitingOnOthers,
    onTrack,
    byWorkstream,
    nextStep,
    weeklyPlan,
    generatedAt: now,
  };
}

// ICS calendar generation — pure string builder for .ics attachment.
// The delivery pipeline (Resend + APNs) lives in a separate lane and
// will consume this output.
//
// IMPORTANT: for VALUE=DATE events, DTEND is EXCLUSIVE per RFC 5545. A
// one-day event on 2026-04-25 must have DTSTART=20260425 and
// DTEND=20260426. Setting DTEND equal to DTSTART creates a zero-length
// event that some clients (Google Calendar, Outlook) drop or render in
// unexpected ways.
export function nextDayDate(iso: string): string {
  const parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return iso.replace(/-/g, "");
  const [, y, m, d] = parts;
  const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
  const yy = next.getUTCFullYear().toString().padStart(4, "0");
  const mm = (next.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = next.getUTCDate().toString().padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function icsCompactDate(iso: string): string {
  return iso.replace(/-/g, "");
}

export function buildIcsForMilestone(
  milestone: CloseDashboardMilestone,
  dealRoomId: string,
): string {
  const uid = `${dealRoomId}-${milestone.id}@buyer-v2`;
  const dtStart = icsCompactDate(milestone.dueDate);
  const dtEnd = nextDayDate(milestone.dueDate);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//buyer-v2//close-dashboard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStart}T000000Z`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${milestone.name}`,
    `DESCRIPTION:Closing milestone (${milestone.workstream}). Responsible: ${milestone.responsibleParty}.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function buildIcsForWeeklyPlan(
  plan: WeeklyPlan,
  dealRoomId: string,
): string {
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//buyer-v2//close-dashboard-weekly//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const events: string[] = [];
  const unique = new Map<string, WeeklyPlanItem>();
  for (const item of [...plan.actionsThisWeek, ...plan.deadlinesThisWeek]) {
    unique.set(item.milestone.id, item);
  }
  for (const item of unique.values()) {
    const m = item.milestone;
    const uid = `${dealRoomId}-${m.id}-weekly@buyer-v2`;
    const dtStart = icsCompactDate(m.dueDate);
    const dtEnd = nextDayDate(m.dueDate);
    events.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtStart}T000000Z`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${m.name}`,
      `DESCRIPTION:${item.reason}`,
      "END:VEVENT",
    );
  }
  return [...header, ...events, "END:VCALENDAR"].join("\r\n");
}
