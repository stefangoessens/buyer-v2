"use client";

import { cn } from "@/lib/utils";

export type DealRoomTabId =
  | "overview"
  | "pricing"
  | "comps"
  | "risks"
  | "offer"
  | "documents"
  | "timeline";

interface TabDef {
  id: DealRoomTabId;
  label: string;
  icon: React.ReactNode;
  ready: boolean;
}

const ICON_CLASS = "size-[18px] shrink-0";

const TABS: TabDef[] = [
  {
    id: "overview",
    label: "Overview",
    ready: true,
    icon: (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 10.5 10 4l7 6.5" />
        <path d="M5 9.5V16a.5.5 0 0 0 .5.5h3v-4.25a1.25 1.25 0 0 1 2.5 0V16.5h3A.5.5 0 0 0 14.5 16V9.5" />
      </svg>
    ),
  },
  {
    id: "pricing",
    label: "Pricing",
    ready: false,
    icon: (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 3v14" />
        <path d="M13.5 6.5H8.75a2.25 2.25 0 0 0 0 4.5h2.5a2.25 2.25 0 0 1 0 4.5H6" />
      </svg>
    ),
  },
  {
    id: "comps",
    label: "Comps",
    ready: false,
    icon: (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="5.5" height="12" rx="1" />
        <rect x="11.5" y="7" width="5.5" height="9" rx="1" />
      </svg>
    ),
  },
  {
    id: "risks",
    label: "Risks",
    ready: false,
    icon: (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 3 2.5 16h15L10 3Z" />
        <path d="M10 8.5v3.5" />
        <path d="M10 14.25v.01" />
      </svg>
    ),
  },
  {
    id: "offer",
    label: "Offer",
    ready: false,
    icon: (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 3h7l3 3v11a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 5 17V3Z" />
        <path d="M12 3v3.5h3" />
        <path d="M7.5 10h5" />
        <path d="M7.5 13h3" />
      </svg>
    ),
  },
  {
    id: "documents",
    label: "Documents",
    ready: false,
    icon: (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11l4 4v9.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16.5v-12Z" />
        <path d="M11 3v4h4" />
      </svg>
    ),
  },
  {
    id: "timeline",
    label: "Timeline",
    ready: false,
    icon: (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6.25V10l2.5 1.75" />
      </svg>
    ),
  },
];

interface DealRoomSidebarProps {
  activeTab: DealRoomTabId;
  onSelect: (tabId: DealRoomTabId) => void;
}

export function DealRoomSidebar({ activeTab, onSelect }: DealRoomSidebarProps) {
  return (
    <>
      {/* Desktop: vertical rail */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-border bg-muted lg:flex lg:flex-col">
        <div className="px-5 pt-7 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            Your deal room
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            Everything our AI engines and brokers find on this property.
          </p>
        </div>
        <nav className="flex-1 px-3 pb-6" aria-label="Deal room sections">
          <ul className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(tab.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] font-medium transition-colors",
                      isActive
                        ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100"
                        : "text-muted-foreground hover:bg-white hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "transition-colors",
                        isActive
                          ? "text-primary-700"
                          : "text-neutral-400 group-hover:text-muted-foreground",
                      )}
                    >
                      {tab.icon}
                    </span>
                    <span className="flex-1">{tab.label}</span>
                    {!tab.ready ? (
                      <span className="rounded-full bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Soon
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Mobile: horizontal scrollable pills */}
      <div className="sticky top-[64px] z-20 border-b border-border bg-white/95 backdrop-blur lg:hidden">
        <nav
          className="flex gap-2 overflow-x-auto px-4 py-3"
          aria-label="Deal room sections"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  isActive
                    ? "border-primary-200 bg-primary-50 text-primary-700"
                    : "border-border bg-white text-muted-foreground hover:border-neutral-300",
                )}
              >
                <span className={isActive ? "text-primary-700" : "text-neutral-400"}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
