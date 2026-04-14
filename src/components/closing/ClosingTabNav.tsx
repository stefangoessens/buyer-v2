"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { trackClosingEvent } from "@/lib/analytics/closing-events";
import {
  TAB_ORDER,
  type ClosingTab,
} from "@/lib/closing/taskTemplates";

interface ClosingTabNavProps {
  tabs: ReadonlyArray<{
    tab: ClosingTab;
    label: string;
    counts: {
      total: number;
      completed: number;
    };
  }>;
  activeTab: ClosingTab;
  dealRoomId: string;
  onTabChange: (tab: ClosingTab) => void;
}

export function ClosingTabNav({
  tabs,
  activeTab,
  dealRoomId,
  onTabChange,
}: ClosingTabNavProps) {
  const orderedTabs = TAB_ORDER.map(
    (order) => tabs.find((t) => t.tab === order) ?? null,
  ).filter((t): t is NonNullable<typeof t> => t !== null);

  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTab]);

  const handleClick = (tab: ClosingTab) => {
    if (tab === activeTab) return;
    onTabChange(tab);
    trackClosingEvent("TAB_VIEWED", { tab, dealRoomId });
  };

  return (
    <nav
      aria-label="Closing tabs"
      className="relative"
      data-testid="closing-tab-nav"
    >
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 md:flex-wrap md:overflow-visible md:pb-0">
        {orderedTabs.map((tab) => {
          const isActive = tab.tab === activeTab;
          return (
            <button
              key={tab.tab}
              ref={isActive ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleClick(tab.tab)}
              className={cn(
                "group relative flex shrink-0 snap-start items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="whitespace-nowrap">{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-foreground/70 group-hover:bg-background",
                )}
                aria-label={`${tab.counts.completed} of ${tab.counts.total} complete`}
              >
                {tab.counts.completed}/{tab.counts.total}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
