"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DealRoomHeader, type DealRoomHeaderProperty } from "./DealRoomHeader";
import { DealRoomOverview } from "./DealRoomOverview";
import { DealRoomSidebar, type DealRoomTabId } from "./DealRoomSidebar";

const TAB_LABELS: Record<DealRoomTabId, string> = {
  overview: "Overview",
  pricing: "Pricing",
  comps: "Comps",
  risks: "Risks",
  offer: "Offer",
  documents: "Documents",
  timeline: "Timeline",
};

const TAB_TAGLINES: Partial<Record<DealRoomTabId, string>> = {
  pricing: "Fair-price analysis with confidence bands and comp-based reasoning.",
  comps: "Side-by-side recent sales, with adjustments and market context.",
  risks: "Title, disclosure, flood, HOA, and inspection red flags — auto-surfaced.",
  offer: "Scenario builder and broker-reviewed offer packages.",
  documents: "All deal docs in one place, summarized and searchable.",
  timeline: "Milestones from intake to close, with broker status updates.",
};

interface DealRoomShellProps {
  dealRoomId: Id<"dealRooms">;
}

function ComingSoonCard({ tabId }: { tabId: DealRoomTabId }) {
  const label = TAB_LABELS[tabId];
  const tagline = TAB_TAGLINES[tabId];
  return (
    <div className="rounded-[20px] border border-border bg-white p-10">
      <div className="mx-auto max-w-md text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-700 ring-1 ring-primary-100">
          Coming soon
        </span>
        <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.006em] text-foreground">
          {label}
        </h2>
        {tagline ? (
          <p className="mt-3 text-[14px] leading-[1.55] text-muted-foreground">
            {tagline}
          </p>
        ) : null}
        <p className="mt-6 text-[12px] text-neutral-400">
          Available in a future milestone. Your broker will surface anything
          urgent in Overview.
        </p>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-16 border-b border-border bg-white/95" />
      <div className="flex flex-1">
        <div className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-border bg-muted lg:block">
          <div className="px-5 pt-7">
            <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
            <div className="mt-3 h-3 w-40 animate-pulse rounded bg-neutral-200/70" />
          </div>
          <div className="mt-6 space-y-2 px-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-[12px] bg-neutral-200/60"
              />
            ))}
          </div>
        </div>
        <div className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="h-6 w-48 animate-pulse rounded bg-neutral-200" />
            <div className="h-72 animate-pulse rounded-[20px] bg-muted" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="h-40 animate-pulse rounded-[16px] bg-muted" />
              <div className="h-40 animate-pulse rounded-[16px] bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFoundShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4 py-16">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-neutral-400">
          <svg
            className="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <h1 className="mt-5 text-[20px] font-semibold tracking-[-0.006em] text-foreground">
          Deal room not found
        </h1>
        <p className="mt-2 text-[14px] leading-[1.55] text-muted-foreground">
          We couldn&apos;t load this deal room. It may have been archived, or you
          may not have access.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-[12px] bg-primary-700 px-5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export function DealRoomShell({ dealRoomId }: DealRoomShellProps) {
  const [activeTab, setActiveTab] = useState<DealRoomTabId>("overview");
  const dealRoomData = useQuery(api.dealRooms.get, { dealRoomId });

  if (dealRoomData === undefined) {
    return <ShellSkeleton />;
  }

  if (dealRoomData === null) {
    return <NotFoundShell />;
  }

  const property = (dealRoomData as { property?: unknown } | null)
    ?.property as DealRoomHeaderProperty | undefined;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <DealRoomHeader property={property ?? null} />
      <div className="flex flex-1 flex-col lg:flex-row">
        <DealRoomSidebar activeTab={activeTab} onSelect={setActiveTab} />
        <div className="flex-1 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            {activeTab === "overview" ? (
              <DealRoomOverview dealRoomId={dealRoomId} />
            ) : (
              <ComingSoonCard tabId={activeTab} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
