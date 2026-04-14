"use client";

import Image from "next/image";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { DealRoomBreadcrumb } from "./DealRoomBreadcrumb";
import { cn } from "@/lib/utils";

const PRICE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type PropertyStatus =
  | "active"
  | "pending"
  | "contingent"
  | "sold"
  | "withdrawn";

const STATUS_STYLES: Record<PropertyStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  pending: "bg-amber-50 text-amber-700 ring-amber-100",
  contingent: "bg-amber-50 text-amber-700 ring-amber-100",
  sold: "bg-muted text-muted-foreground ring-neutral-200",
  withdrawn: "bg-muted text-muted-foreground ring-neutral-200",
};

const STATUS_LABELS: Record<PropertyStatus, string> = {
  active: "Active",
  pending: "Pending",
  contingent: "Contingent",
  sold: "Sold",
  withdrawn: "Withdrawn",
};

type PropertyAddress = {
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
  formatted?: string;
};

export type DealRoomHeaderProperty = {
  address?: PropertyAddress | null;
  listPrice?: number | null;
  status?: PropertyStatus | string | null;
  photoUrls?: string[] | null;
};

interface DealRoomHeaderProps {
  property: DealRoomHeaderProperty | null | undefined;
}

function resolveAddressLines(address: PropertyAddress | null | undefined): {
  line1: string;
  line2: string;
  full: string;
} {
  if (!address) {
    return { line1: "Your property", line2: "Florida", full: "Your property" };
  }
  if (address.formatted) {
    const [first, ...rest] = address.formatted.split(",");
    const line1 = first?.trim() || address.street || "Your property";
    const line2 =
      rest.join(",").trim() ||
      [address.city, address.state, address.zip].filter(Boolean).join(", ");
    return {
      line1,
      line2: line2 || "Florida",
      full: address.formatted,
    };
  }
  const line1 = address.unit
    ? `${address.street ?? ""}, ${address.unit}`
    : address.street ?? "Your property";
  const line2 =
    [address.city, address.state, address.zip].filter(Boolean).join(", ") ||
    "Florida";
  return { line1, line2, full: `${line1}, ${line2}` };
}

export function DealRoomHeader({ property }: DealRoomHeaderProps) {
  const { line1, line2, full } = resolveAddressLines(property?.address ?? null);
  const rawStatus = (property?.status ?? "active") as string;
  const status = (
    rawStatus in STATUS_STYLES ? rawStatus : "active"
  ) as PropertyStatus;
  const statusLabel = STATUS_LABELS[status];
  const listPrice = property?.listPrice ?? null;
  const thumb = property?.photoUrls?.[0];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="hidden size-10 shrink-0 overflow-hidden rounded-[10px] bg-muted ring-1 ring-neutral-200 sm:block">
            {thumb ? (
              <Image
                src={thumb}
                alt=""
                width={40}
                height={40}
                className="size-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex size-full items-center justify-center text-neutral-300">
                <svg
                  className="size-5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path d="M3 10.5 10 4l7 6.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 9.5V16a.5.5 0 0 0 .5.5h9A.5.5 0 0 0 15 16V9.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <DealRoomBreadcrumb propertyLabel={line1} />
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="truncate" title={full}>
                {line2}
              </span>
              {listPrice != null ? (
                <>
                  <span className="text-neutral-300" aria-hidden="true">
                    •
                  </span>
                  <span className="shrink-0 font-semibold text-neutral-700">
                    {PRICE_FORMATTER.format(listPrice)}
                  </span>
                </>
              ) : null}
              <span
                className={cn(
                  "ml-1 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
                  STATUS_STYLES[status],
                )}
              >
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
