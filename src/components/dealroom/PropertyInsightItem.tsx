"use client";

import { cn } from "@/lib/utils";

export type InsightCategory =
  | "pricing"
  | "market_position"
  | "florida_risk"
  | "seller_motivation"
  | "hidden_cost"
  | "condition"
  | "negotiation";

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export interface Insight {
  category: InsightCategory;
  headline: string;
  body: string;
  severity: InsightSeverity;
  confidence: number;
  premium: boolean;
  citations: string[];
}

interface PropertyInsightItemProps {
  insight: Insight;
}

const SEVERITY_TOKENS: Record<
  InsightSeverity,
  {
    dot: string;
    iconBg: string;
    iconText: string;
    iconRing: string;
    pillBg: string;
    pillText: string;
  }
> = {
  info: {
    dot: "bg-blue-500",
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    iconRing: "ring-blue-100",
    pillBg: "bg-blue-50",
    pillText: "text-blue-700",
  },
  positive: {
    dot: "bg-emerald-500",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    iconRing: "ring-emerald-100",
    pillBg: "bg-emerald-50",
    pillText: "text-emerald-700",
  },
  warning: {
    dot: "bg-amber-500",
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    iconRing: "ring-amber-100",
    pillBg: "bg-amber-50",
    pillText: "text-amber-700",
  },
  critical: {
    dot: "bg-rose-500",
    iconBg: "bg-rose-50",
    iconText: "text-rose-600",
    iconRing: "ring-rose-100",
    pillBg: "bg-rose-50",
    pillText: "text-rose-700",
  },
};

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  pricing: "Pricing",
  market_position: "Market position",
  florida_risk: "Florida risk",
  seller_motivation: "Seller motivation",
  hidden_cost: "Hidden cost",
  condition: "Condition",
  negotiation: "Negotiation",
};

function CategoryIcon({
  category,
  className,
}: {
  category: InsightCategory;
  className?: string;
}) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 20 20",
    "aria-hidden": true,
  };

  switch (category) {
    case "pricing":
      return (
        <svg {...common}>
          <path d="M10.5 2.5H3.75a1.25 1.25 0 0 0-1.25 1.25v6.75a1.25 1.25 0 0 0 .366.884l7 7a1.25 1.25 0 0 0 1.768 0l6.75-6.75a1.25 1.25 0 0 0 0-1.768l-7-7a1.25 1.25 0 0 0-.884-.366Z" />
          <circle cx="6.75" cy="6.75" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "market_position":
      return (
        <svg {...common}>
          <path d="M2.5 14.167 7.083 9.583l3.334 3.334 6.25-6.25" />
          <path d="M12.5 6.667h4.167v4.166" />
        </svg>
      );
    case "florida_risk":
      return (
        <svg {...common}>
          <path d="M10 1.667 3.333 4.167v5.625c0 4.041 2.818 7.583 6.667 8.541 3.849-.958 6.667-4.5 6.667-8.541V4.167L10 1.667Z" />
          <path d="m7.5 10 1.875 1.875L13.125 8.125" />
        </svg>
      );
    case "seller_motivation":
      return (
        <svg {...common}>
          <path d="M10 18.333c3.333 0 6.25-2.083 6.25-5.833 0-1.458-.625-2.708-1.458-3.75-.417 1.042-1.459 1.667-2.292 1.667.833-2.5-.625-5-2.292-6.25-.417 2.083-1.458 3.75-2.916 5-1.459 1.25-2.292 2.708-2.292 4.375 0 3.25 2.917 4.791 5 4.791Z" />
        </svg>
      );
    case "hidden_cost":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 6.667V10.833" />
          <path d="M10 13.333h.008" strokeWidth="2.25" />
        </svg>
      );
    case "condition":
      return (
        <svg {...common}>
          <path d="m2.5 8.333 7.5-5.833 7.5 5.833v8.334a1.667 1.667 0 0 1-1.667 1.666H4.167A1.667 1.667 0 0 1 2.5 16.667V8.333Z" />
          <path d="M7.5 17.5v-7.5h5v7.5" />
        </svg>
      );
    case "negotiation":
      return (
        <svg {...common}>
          <path d="m7.083 10.833 2.5 2.5 5-5" />
          <path d="M15 5.833V3.75a1.25 1.25 0 0 0-1.25-1.25H6.25A1.25 1.25 0 0 0 5 3.75v2.083" />
          <path d="M2.5 10V6.667a1.667 1.667 0 0 1 1.667-1.667h11.666A1.667 1.667 0 0 1 17.5 6.667V10" />
          <path d="M4.167 10v5.833A1.667 1.667 0 0 0 5.833 17.5h8.334a1.667 1.667 0 0 0 1.666-1.667V10" />
        </svg>
      );
  }
}

export function PropertyInsightItem({ insight }: PropertyInsightItemProps) {
  const tokens = SEVERITY_TOKENS[insight.severity];
  const confidencePercent = Math.round(insight.confidence * 100);
  const categoryLabel = CATEGORY_LABELS[insight.category];

  return (
    <div className="group relative flex gap-4 py-6 first:pt-0 last:pb-0 md:gap-5">
      <div className="relative flex shrink-0 flex-col items-center">
        <div
          className={cn(
            "relative flex size-11 items-center justify-center rounded-2xl ring-1 ring-inset",
            tokens.iconBg,
            tokens.iconText,
            tokens.iconRing,
          )}
        >
          <CategoryIcon category={insight.category} className="size-5" />
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-white",
              tokens.dot,
            )}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              tokens.pillBg,
              tokens.pillText,
            )}
          >
            {categoryLabel}
          </span>
        </div>
        <h3 className="text-[17px] font-semibold leading-[1.3] text-foreground md:text-lg">
          {insight.headline}
        </h3>
        <p className="line-clamp-2 text-[15px] leading-[1.55] text-muted-foreground md:line-clamp-none">
          {insight.body}
        </p>
      </div>

      <div className="hidden shrink-0 md:block">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-neutral-400" />
          {confidencePercent}% confidence
        </div>
      </div>
    </div>
  );
}
