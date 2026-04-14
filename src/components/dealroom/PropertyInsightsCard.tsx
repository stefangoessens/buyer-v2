"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  PropertyInsightItem,
  type Insight,
  type InsightCategory,
  type InsightSeverity,
} from "./PropertyInsightItem";

type PublicVariantProps = {
  variant: "public";
  propertyId: string;
};

type RegisteredVariantProps = {
  variant: "registered";
  dealRoomId: Id<"dealRooms">;
};

type PropertyInsightsCardProps = PublicVariantProps | RegisteredVariantProps;

const CATEGORY_VALUES: readonly InsightCategory[] = [
  "pricing",
  "market_position",
  "florida_risk",
  "seller_motivation",
  "hidden_cost",
  "condition",
  "negotiation",
] as const;

const SEVERITY_VALUES: readonly InsightSeverity[] = [
  "info",
  "positive",
  "warning",
  "critical",
] as const;

function narrowCategory(raw: unknown): InsightCategory {
  return typeof raw === "string" &&
    (CATEGORY_VALUES as readonly string[]).includes(raw)
    ? (raw as InsightCategory)
    : "market_position";
}

function narrowSeverity(raw: unknown): InsightSeverity {
  return typeof raw === "string" &&
    (SEVERITY_VALUES as readonly string[]).includes(raw)
    ? (raw as InsightSeverity)
    : "info";
}

function normalizeInsight(raw: {
  category: string;
  headline: string;
  body: string;
  severity: string;
  confidence: number;
  premium: boolean;
  citations: string[];
}): Insight {
  return {
    category: narrowCategory(raw.category),
    headline: raw.headline,
    body: raw.body,
    severity: narrowSeverity(raw.severity),
    confidence: raw.confidence,
    premium: raw.premium,
    citations: raw.citations,
  };
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMo = Math.round(diffDay / 30);
  return `${diffMo} mo ago`;
}

function Eyebrow() {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-primary-500" />
      </span>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
        AI analysis
      </p>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[24px] border border-neutral-200 bg-white p-6 shadow-[0_1px_0_0_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(59,60,158,0.08)] md:p-8">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute -top-24 right-0 h-48 w-72 rounded-full bg-primary-50/50 blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function CardHeader({
  generatedAt,
  count,
}: {
  generatedAt?: string;
  count?: number;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <Eyebrow />
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.003em] text-neutral-800 md:text-[28px] md:leading-[1.2]">
          Key insights on this listing
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          {count != null && generatedAt ? (
            <>
              {count} {count === 1 ? "take" : "takes"} from our AI engines
              {" · Updated "}
              {formatRelativeTime(generatedAt)}
            </>
          ) : (
            "Florida broker-reviewed analysis, tailored to this property."
          )}
        </p>
      </div>
    </header>
  );
}

function UnlockRow({
  remainingCount,
  propertyId,
}: {
  remainingCount: number;
  propertyId: string;
}) {
  return (
    <div className="relative mt-2 overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 to-primary-600 p-5 md:p-6">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/[0.08] blur-3xl" />
      </div>
      <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-100 ring-1 ring-white/15 backdrop-blur">
            <svg
              className="size-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
            Locked
          </div>
          <p className="mt-3 text-lg font-semibold leading-tight text-white md:text-xl">
            {remainingCount} more {remainingCount === 1 ? "insight" : "insights"}{" "}
            + full deal room
          </p>
          <p className="mt-1.5 text-sm text-primary-100/85">
            Comps, leverage score, offer strategy, negotiation plays. Free
            account, no card required.
          </p>
        </div>
        <Link
          href={`/register?next=/property/${propertyId}`}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-50"
        >
          Unlock insights
          <svg
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <CardShell>
      <div className="mb-6 md:mb-8">
        <div className="h-3.5 w-24 animate-pulse rounded-full bg-neutral-200" />
        <div className="mt-3 h-7 w-80 animate-pulse rounded-full bg-neutral-200" />
        <div className="mt-3 h-3 w-56 animate-pulse rounded-full bg-neutral-100" />
      </div>
      <div className="divide-y divide-neutral-100">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4 py-6 first:pt-0 last:pb-0 md:gap-5">
            <div className="size-11 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="flex-1 space-y-2.5">
              <div className="h-3 w-20 animate-pulse rounded-full bg-neutral-100" />
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-neutral-200" />
              <div className="h-3 w-full animate-pulse rounded-full bg-neutral-100" />
              <div className="h-3 w-5/6 animate-pulse rounded-full bg-neutral-100" />
            </div>
            <div className="hidden h-6 w-24 shrink-0 animate-pulse rounded-full bg-neutral-100 md:block" />
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function GenerationInProgress() {
  return (
    <CardShell>
      <CardHeader />
      <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-primary-100">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-400 opacity-70" />
            <span className="relative inline-flex size-3 rounded-full bg-primary-500" />
          </span>
        </div>
        <p className="mt-4 text-base font-semibold text-neutral-800">
          Analysis in progress
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
          Our engines are reviewing pricing, comps, Florida risk factors, and
          negotiation leverage. This takes a few seconds.
        </p>
      </div>
    </CardShell>
  );
}

type LockedTeaser = {
  category: string;
  severity: string;
  confidence?: number;
};

type InsightsResponse = {
  insights: Array<{
    category: string;
    headline: string;
    body: string;
    severity: string;
    confidence: number;
    premium: boolean;
    citations: string[];
  }>;
  generatedAt: string;
  totalCount: number;
  lockedTeasers?: LockedTeaser[];
} | null;

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  pricing: "Pricing",
  market_position: "Market position",
  florida_risk: "Florida risk",
  seller_motivation: "Seller motivation",
  hidden_cost: "Hidden cost",
  condition: "Condition",
  negotiation: "Negotiation",
};

function LockedInsightRow({ teaser }: { teaser: LockedTeaser }) {
  const category = ((CATEGORY_VALUES as readonly string[]).includes(
    teaser.category,
  )
    ? teaser.category
    : "market_position") as InsightCategory;
  const confidencePct =
    typeof teaser.confidence === "number"
      ? Math.round(teaser.confidence * 100)
      : null;
  const label = CATEGORY_LABELS[category];

  return (
    <div className="flex items-center gap-4 py-5 md:gap-5 md:py-6">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-50 text-neutral-400 ring-1 ring-neutral-200">
        <svg
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {label}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            · Premium
          </span>
        </div>
        <p className="mt-1 text-base font-semibold leading-tight text-neutral-500">
          Sign up to reveal this analysis
        </p>
      </div>
      {confidencePct !== null ? (
        <div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-400 ring-1 ring-neutral-200 md:inline-flex">
          <span className="size-1.5 rounded-full bg-neutral-300" />
          {confidencePct}% confidence
        </div>
      ) : null}
    </div>
  );
}

export function PropertyInsightsCard(props: PropertyInsightsCardProps) {
  const publicResult = useQuery(
    api.insights.getPublic,
    props.variant === "public"
      ? { propertyId: props.propertyId as Id<"properties"> }
      : "skip",
  ) as InsightsResponse | undefined;

  const registeredResult = useQuery(
    api.insights.getAllForDealRoom,
    props.variant === "registered"
      ? { dealRoomId: props.dealRoomId }
      : "skip",
  ) as InsightsResponse | undefined;

  const result = props.variant === "public" ? publicResult : registeredResult;

  if (result === undefined) {
    return <LoadingSkeleton />;
  }

  if (result === null || result.insights.length === 0) {
    return <GenerationInProgress />;
  }

  const insights = result.insights.map(normalizeInsight);
  const visibleInsights = insights.filter((i) => i.category !== "florida_risk");
  const { generatedAt, totalCount } = result;
  const lockedTeasers = result.lockedTeasers ?? [];
  const remaining = Math.max(0, totalCount - insights.length);
  const showUnlock = props.variant === "public" && remaining > 0;

  return (
    <CardShell>
      <CardHeader generatedAt={generatedAt} count={totalCount} />
      <div
        className={cn(
          "divide-y divide-neutral-100",
          showUnlock && "pb-6",
        )}
      >
        {visibleInsights.map((insight, idx) => (
          <PropertyInsightItem
            key={`${insight.category}-${idx}`}
            insight={insight}
          />
        ))}
        {props.variant === "public" &&
          lockedTeasers.map((teaser, idx) => (
            <LockedInsightRow key={`locked-${idx}`} teaser={teaser} />
          ))}
      </div>
      {showUnlock && props.variant === "public" ? (
        <UnlockRow
          remainingCount={remaining}
          propertyId={props.propertyId}
        />
      ) : null}
    </CardShell>
  );
}
