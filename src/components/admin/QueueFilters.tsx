"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  QUEUE_STATUSES,
  QUEUE_STATUS_LABELS,
  QUEUE_PRIORITIES,
  QUEUE_PRIORITY_LABELS,
  type QueueKey,
} from "@/lib/admin/queueLabels";
import {
  AGE_BUCKETS,
  AGE_BUCKET_LABELS,
  DEFAULT_FILTER_STATE,
  filterToSearchParams,
  type QueueFilterState,
} from "@/lib/admin/queueFilters";

interface QueueFiltersProps {
  filter: QueueFilterState;
  /** If true, the queue picker is suppressed (queue detail pages pin to one queue). */
  hideQueueKey?: boolean;
  /** Bind each link to this queue key — used when the page already fixes one queue. */
  pinnedQueueKey?: QueueKey;
}

function pillHref(
  pathname: string,
  filter: QueueFilterState,
  patch: Partial<QueueFilterState>,
): string {
  const next = { ...filter, ...patch };
  const params = filterToSearchParams(next);
  const qs = new URLSearchParams(params).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

interface PillGroupProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  active: T;
  buildHref: (value: T) => string;
}

function PillGroup<T extends string>({
  label,
  options,
  active,
  buildHref,
}: PillGroupProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Link
            key={opt.value}
            href={buildHref(opt.value)}
            aria-pressed={active === opt.value}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active === opt.value
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-border bg-white text-muted-foreground hover:border-neutral-300 hover:text-foreground",
            )}
          >
            {opt.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Filter toolbar shown above the queue table. Every control is a
 * `<Link>` so filter state is shareable via URL and the page owner
 * does not need client-side state. Resetting drops all params.
 */
export function QueueFilters({
  filter,
  hideQueueKey = false,
  pinnedQueueKey,
}: QueueFiltersProps) {
  const pathname = usePathname() ?? "/queues";
  const baseFilter: QueueFilterState = pinnedQueueKey
    ? { ...filter, queueKey: pinnedQueueKey }
    : filter;

  const statusOptions: { value: QueueFilterState["status"]; label: string }[] = [
    { value: "all", label: "All statuses" },
    ...QUEUE_STATUSES.map((s) => ({ value: s, label: QUEUE_STATUS_LABELS[s] })),
  ];
  const priorityOptions: { value: QueueFilterState["priority"]; label: string }[] = [
    { value: "all", label: "All priorities" },
    ...QUEUE_PRIORITIES.map((p) => ({ value: p, label: QUEUE_PRIORITY_LABELS[p] })),
  ];
  const ageOptions = AGE_BUCKETS.map((a) => ({ value: a, label: AGE_BUCKET_LABELS[a] }));

  return (
    <div className="mb-6 rounded-xl border border-border bg-white p-5">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <PillGroup
          label="Status"
          options={statusOptions}
          active={baseFilter.status}
          buildHref={(value) => pillHref(pathname, baseFilter, { status: value })}
        />
        <PillGroup
          label="Priority"
          options={priorityOptions}
          active={baseFilter.priority}
          buildHref={(value) => pillHref(pathname, baseFilter, { priority: value })}
        />
        <PillGroup
          label="Age"
          options={ageOptions}
          active={baseFilter.age}
          buildHref={(value) => pillHref(pathname, baseFilter, { age: value })}
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {hideQueueKey
            ? "Filters apply to this queue."
            : "Share this URL to preserve filters."}
        </span>
        <Link
          href={pathname}
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Reset filters
        </Link>
      </div>
    </div>
  );
}

export { DEFAULT_FILTER_STATE };
