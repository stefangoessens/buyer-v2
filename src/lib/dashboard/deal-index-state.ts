import type {
  DashboardActiveDealRow,
  DashboardDealIndex,
  DashboardRecentDealRow,
  DashboardSummaryBadge,
} from "@/lib/dashboard/deal-index";

export type BuyerDashboardState =
  | {
      kind: "loading";
      activeDeals: [];
      recentDeals: [];
      summaryBadges: [];
      hasPartialDeals: false;
    }
  | {
      kind: "empty";
      activeDeals: [];
      recentDeals: [];
      summaryBadges: DashboardSummaryBadge[];
      hasPartialDeals: false;
    }
  | {
      kind: "ready";
      activeDeals: DashboardActiveDealRow[];
      recentDeals: DashboardRecentDealRow[];
      summaryBadges: DashboardSummaryBadge[];
      hasPartialDeals: boolean;
    };

export function resolveBuyerDashboardState(
  dealIndex: DashboardDealIndex | undefined,
): BuyerDashboardState {
  if (dealIndex === undefined) {
    return {
      kind: "loading",
      activeDeals: [],
      recentDeals: [],
      summaryBadges: [],
      hasPartialDeals: false,
    };
  }

  if (!dealIndex.summary.hasAnyDeals) {
    return {
      kind: "empty",
      activeDeals: [],
      recentDeals: [],
      summaryBadges: dealIndex.summary.badges,
      hasPartialDeals: false,
    };
  }

  return {
    kind: "ready",
    activeDeals: dealIndex.active,
    recentDeals: dealIndex.recent,
    summaryBadges: dealIndex.summary.badges,
    hasPartialDeals: dealIndex.summary.hasPartialDeals,
  };
}
