/**
 * Typed view model for the buyer close dashboard (KIN-793).
 *
 * The dashboard answers three questions for the buyer after a contract
 * is fully executed:
 *
 *   1. What needs my attention?
 *   2. What's waiting on someone else?
 *   3. Are we on track?
 *
 * This module defines the shared shape that the convex aggregation query
 * produces and the UI + weekly-plan generator consume. iOS reuses the
 * same contract via a mirror in Swift so the dashboard data never drifts
 * between platforms.
 */

export type Workstream =
  | "inspection"
  | "financing"
  | "appraisal"
  | "title"
  | "insurance"
  | "escrow"
  | "hoa"
  | "walkthrough"
  | "closing"
  | "other";

export type MilestoneStatus =
  | "pending"
  | "completed"
  | "overdue"
  | "needs_review";

export type Urgency =
  | "overdue"
  | "this_week"
  | "next_week"
  | "later"
  | "completed";

export type ResponsibleParty =
  | "buyer"
  | "seller"
  | "lender"
  | "broker"
  | "title_company"
  | "inspector"
  | "hoa"
  | "unknown";

export interface CloseDashboardMilestone {
  id: string;
  name: string;
  workstream: Workstream;
  dueDate: string; // ISO YYYY-MM-DD
  status: MilestoneStatus;
  completedAt?: string;
  responsibleParty: ResponsibleParty;
  daysUntilDue: number;
  urgency: Urgency;
}

export interface WorkstreamGroup {
  workstream: Workstream;
  milestones: CloseDashboardMilestone[];
  pendingCount: number;
  overdueCount: number;
  completedCount: number;
  nextDueDate: string | null;
}

export interface UrgencyGroup {
  urgency: Urgency;
  milestones: CloseDashboardMilestone[];
}

export interface NextStepSummary {
  headline: string;
  body: string;
  action?: string;
  dueDate?: string;
  urgency: Urgency;
}

export interface CloseDashboardData {
  dealRoomId: string;
  propertyAddress: string;
  closeDate: string | null;
  daysToClose: number | null;
  totalMilestones: number;
  pendingMilestones: number;
  completedMilestones: number;
  overdueMilestones: number;
  onTrackPct: number; // 0-1
  needsAttention: CloseDashboardMilestone[];
  waitingOnOthers: CloseDashboardMilestone[];
  onTrack: CloseDashboardMilestone[];
  byWorkstream: WorkstreamGroup[];
  nextStep: NextStepSummary;
  weeklyPlan: WeeklyPlan;
  generatedAt: string;
}

export interface WeeklyPlanItem {
  milestone: CloseDashboardMilestone;
  kind: "action" | "deadline" | "waiting";
  reason: string;
}

export interface WeeklyPlan {
  weekStartDate: string;
  weekEndDate: string;
  actionsThisWeek: WeeklyPlanItem[];
  deadlinesThisWeek: WeeklyPlanItem[];
  blockedOnOthers: WeeklyPlanItem[];
  headline: string;
  summary: string;
}

export const WORKSTREAM_LABELS: Record<Workstream, string> = {
  inspection: "Inspection",
  financing: "Financing",
  appraisal: "Appraisal",
  title: "Title",
  insurance: "Insurance",
  escrow: "Escrow",
  hoa: "HOA / Condo",
  walkthrough: "Final walkthrough",
  closing: "Closing",
  other: "Other",
};

export const WORKSTREAM_ORDER: ReadonlyArray<Workstream> = [
  "inspection",
  "financing",
  "appraisal",
  "title",
  "insurance",
  "hoa",
  "escrow",
  "walkthrough",
  "closing",
  "other",
];

export const URGENCY_LABELS: Record<Urgency, string> = {
  overdue: "Overdue",
  this_week: "This week",
  next_week: "Next week",
  later: "Later",
  completed: "Completed",
};
