/**
 * Buyer dashboard (KIN-833) typed view model.
 *
 * Shared between the Convex query projection and the React components so
 * the dashboard has one place to define what a "deal room tile" looks
 * like on the authenticated home surface.
 */

export interface DashboardDealRoomTile {
  dealRoomId: string;
  propertyId: string;
  address: string;
  city: string;
  state: string;
  listPrice: number;
  beds: number;
  baths: number;
  sqft: number;
  photoUrl: string | null;
  score: number | null;
  status: DealRoomTileStatus;
  lastActivityAt: string | null;
  lastActivityLabel: string;
}

export type DealRoomTileStatus =
  | "active"
  | "pending"
  | "closed"
  | "urgent"
  | "draft";

export type DashboardNavKey =
  | "home"
  | "reports"
  | "compare"
  | "favourites"
  | "profile";

export interface DashboardNavItem {
  key: DashboardNavKey;
  label: string;
  href: string;
  description: string;
}

export const DASHBOARD_NAV: ReadonlyArray<DashboardNavItem> = [
  {
    key: "home",
    label: "Home",
    href: "/dashboard",
    description: "Your latest searches and what to do next.",
  },
  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    description: "Every deal room you've opened with pricing and leverage reports.",
  },
  {
    key: "compare",
    label: "Compare",
    href: "/compare",
    description: "Side-by-side comparison of shortlisted properties.",
  },
  {
    key: "favourites",
    label: "Favourites",
    href: "/favourites",
    description: "Saved searches and starred properties.",
  },
  {
    key: "profile",
    label: "Profile",
    href: "/profile",
    description: "Account, notifications, and buyer preferences.",
  },
];

export function formatDealRoomActivity(
  isoTimestamp: string | null,
  now: string,
): string {
  if (!isoTimestamp) return "No activity yet";
  const nowMs = Date.parse(now);
  const thenMs = Date.parse(isoTimestamp);
  if (Number.isNaN(nowMs) || Number.isNaN(thenMs)) return "Recent activity";
  const deltaMs = Math.max(0, nowMs - thenMs);
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function isEmptyDashboard(tiles: DashboardDealRoomTile[]): boolean {
  return tiles.length === 0;
}

export function sortDealRoomsByActivity(
  tiles: DashboardDealRoomTile[],
): DashboardDealRoomTile[] {
  return [...tiles].sort((a, b) => {
    const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return bTime - aTime;
  });
}
