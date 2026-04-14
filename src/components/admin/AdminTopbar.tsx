"use client";

import { formatConsoleTimestamp, initialsFromName } from "@/lib/admin/format";
import { roleLabel, type InternalConsoleRole } from "@/lib/admin/roles";

interface AdminTopbarProps {
  user: {
    name: string;
    email: string;
    role: InternalConsoleRole;
  };
  snapshot: {
    openReviewItems: number;
    urgentReviewItems: number;
    latestKpiComputedAt: string | null;
    pendingOverrideCount: number;
  };
}

/**
 * Persistent header for the internal console. Shows the active user,
 * their role, and the queue/override freshness. No action buttons — each
 * page adds its own.
 */
export function AdminTopbar({ user, snapshot }: AdminTopbarProps) {
  const initials = initialsFromName(user.name);
  const kpiFreshness = snapshot.latestKpiComputedAt
    ? formatConsoleTimestamp(snapshot.latestKpiComputedAt)
    : "Never";

  return (
    <header
      className="flex h-16 items-center justify-between border-b border-border bg-white px-8"
      role="banner"
    >
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-2 rounded-full bg-success-500" aria-hidden="true" />
          <span>Live</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-neutral-400">KPIs:</span>
          <span className="text-neutral-700">{kpiFreshness}</span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-neutral-400">Queues:</span>
          <span
            className={
              snapshot.urgentReviewItems > 0
                ? "font-medium text-error-700"
                : "text-neutral-700"
            }
          >
            {snapshot.openReviewItems} open
            {snapshot.urgentReviewItems > 0
              ? ` · ${snapshot.urgentReviewItems} urgent`
              : ""}
          </span>
        </div>
        {snapshot.pendingOverrideCount > 0 ? (
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-neutral-400">Overrides pending review:</span>
            <span className="text-neutral-700">
              {snapshot.pendingOverrideCount}
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden flex-col items-end leading-tight sm:flex">
          <span className="text-sm font-medium text-foreground">
            {user.name}
          </span>
          <span className="text-xs text-muted-foreground">{user.email}</span>
        </div>
        <div
          className="flex size-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700"
          aria-label={`${user.name} avatar`}
        >
          {initials}
        </div>
        <span className="hidden rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
          {roleLabel(user.role)}
        </span>
      </div>
    </header>
  );
}
