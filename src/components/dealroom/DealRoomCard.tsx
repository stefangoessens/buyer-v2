import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/product/StatusBadge";
import { type DashboardDealRow } from "@/lib/dashboard/deal-index";
import { formatDealRoomActivity } from "@/lib/dealroom/dashboard-types";

interface DealRoomCardProps {
  row: DashboardDealRow;
  now: string;
  nextAction?: {
    label: string;
    href: string;
    severity: "info" | "warning" | "error";
  };
}

const SEVERITY_PILL_CLASSES: Record<"info" | "warning" | "error", string> = {
  info: "bg-primary/10 text-primary ring-primary/20",
  warning: "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  error: "bg-destructive/10 text-destructive ring-destructive/20",
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

export function DealRoomCard({ row, now, nextAction }: DealRoomCardProps) {
  const badge = projectStatusBadge(row);

  return (
    <Link
      href={`/property/${row.propertyId}/offer`}
      className="group block"
    >
      <Card className="h-full overflow-hidden p-0 transition-all hover:ring-2 hover:ring-primary-300 hover:shadow-md">
        <div className="relative aspect-video bg-neutral-100">
          {row.primaryPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.primaryPhotoUrl}
              alt={row.addressLine}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-100 px-4 text-center text-xs text-neutral-400">
              {row.detailState === "loading"
                ? "Property photo loading"
                : "Photo unavailable"}
            </div>
          )}
        </div>
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-neutral-900">
                {row.addressLine}
              </p>
              {row.detailState !== "complete" && (
                <p className="mt-1 text-xs text-neutral-500">
                  {describeDetailState(row)}
                </p>
              )}
            </div>
            <StatusBadge status={badge.status} label={badge.label} />
          </div>
          <p className="text-lg font-bold text-primary-700">
            {row.listPrice === null
              ? "Price pending"
              : currencyFormatter.format(row.listPrice)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span>{formatMetric(row.beds, "bd", false)}</span>
            <span className="text-neutral-300">·</span>
            <span>{formatMetric(row.baths, "ba", true)}</span>
            <span className="text-neutral-300">·</span>
            <span>{formatSqft(row.sqft)}</span>
          </div>
          <p className="text-xs text-neutral-400">
            {formatDealRoomActivity(row.updatedAt, now)}
          </p>
          {nextAction && (
            <span
              className={`mt-2 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${SEVERITY_PILL_CLASSES[nextAction.severity]}`}
            >
              {nextAction.label}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function projectStatusBadge(
  row: DashboardDealRow,
): {
  status: "active" | "pending" | "closed" | "urgent" | "draft";
  label: string;
} {
  switch (row.status) {
    case "closed":
      return { status: "closed", label: "Closed" };
    case "withdrawn":
      return { status: "draft", label: "Withdrawn" };
    case "under_contract":
      return { status: "pending", label: "Under contract" };
    case "closing":
      return { status: "pending", label: "Closing" };
    case "offer_prep":
      return { status: "urgent", label: "Offer prep" };
    case "offer_sent":
      return { status: "urgent", label: "Offer sent" };
    case "tour_scheduled":
      return { status: "active", label: "Tour scheduled" };
    case "intake":
      return { status: "draft", label: "Intake" };
    case "analysis":
      return { status: "active", label: "Analysis" };
  }
}

function describeDetailState(row: DashboardDealRow): string {
  if (row.detailState === "loading") {
    return "Property details are still loading.";
  }

  return `Missing ${row.missingFields.map(formatMissingFieldLabel).join(", ")}.`;
}

function formatMissingFieldLabel(field: DashboardDealRow["missingFields"][number]): string {
  switch (field) {
    case "listPrice":
      return "price";
    case "beds":
      return "beds";
    case "baths":
      return "baths";
    case "sqft":
      return "sqft";
    case "primaryPhoto":
      return "photo";
  }
}

function formatMetric(
  value: number | null,
  suffix: string,
  allowFraction: boolean,
): string {
  if (value === null) {
    return `${suffix} pending`;
  }

  const formatted = allowFraction ? String(value) : numberFormatter.format(value);
  return `${formatted} ${suffix}`;
}

function formatSqft(value: number | null): string {
  if (value === null) return "sqft pending";
  return `${numberFormatter.format(value)} sqft`;
}
