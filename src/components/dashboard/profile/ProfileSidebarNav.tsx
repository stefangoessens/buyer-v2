"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { id: string; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "search", label: "Search criteria" },
  { id: "saved-searches", label: "Saved searches" },
  { id: "rebate", label: "Rebate payout" },
  { id: "agreements", label: "Agreements" },
];

export function ProfileSidebarNav() {
  const [activeId, setActiveId] = useState<string>(NAV_ITEMS[0]?.id ?? "");

  useEffect(() => {
    const sectionEls = NAV_ITEMS.map(({ id }) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sectionEls.length === 0) return;

    const updateFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && NAV_ITEMS.some((item) => item.id === hash)) {
        setActiveId(hash);
      }
    };
    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sectionEls.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", updateFromHash);
    };
  }, []);

  return (
    <nav
      aria-label="Profile sections"
      className="lg:sticky lg:top-24 lg:self-start"
    >
      <ul className="flex flex-row gap-1 overflow-x-auto rounded-3xl border border-border bg-background/60 p-2 lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id} className="shrink-0 lg:shrink">
              <a
                href={`#${item.id}`}
                className={cn(
                  "block whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-current={isActive ? "true" : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
