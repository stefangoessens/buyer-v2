"use client";

import Link from "next/link";
import { groupNavItemsBySection, findActiveNavSlug, type NavItem } from "@/lib/admin/nav";
import { roleLabel, type InternalConsoleRole } from "@/lib/admin/roles";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  navItems: NavItem[];
  pathname: string | null;
  role: InternalConsoleRole;
  openReviewItems: number;
  urgentReviewItems: number;
}

/**
 * Persistent left nav for the internal console. Groups items by section,
 * highlights the active route, and surfaces the "open queue items" count
 * next to the Review queues entry so ops never has to navigate to know
 * whether there is something waiting for them.
 */
export function AdminSidebar({
  navItems,
  pathname,
  role,
  openReviewItems,
  urgentReviewItems,
}: AdminSidebarProps) {
  const sections = groupNavItemsBySection(navItems);
  const activeSlug = findActiveNavSlug(navItems, pathname);

  return (
    <aside
      aria-label="Internal console navigation"
      className="hidden w-64 shrink-0 border-r border-neutral-200 bg-white md:flex md:flex-col"
    >
      <div className="flex h-16 items-center gap-3 border-b border-neutral-200 px-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm">
          <span className="text-sm font-semibold">K</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-neutral-900">
            Kindservices
          </span>
          <span className="text-xs text-neutral-500">Internal console</span>
        </div>
      </div>
      <nav
        className="flex-1 overflow-y-auto px-3 py-5"
        aria-label="Primary"
      >
        {sections.map((section) => (
          <div key={section.section} className="mb-6 last:mb-0">
            <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {section.label}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.slug === activeSlug;
                const showQueueBadge =
                  item.slug === "queues" && openReviewItems > 0;
                return (
                  <li key={item.slug}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-primary-50 font-medium text-primary-700"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1.5 h-[calc(100%-0.75rem)] w-0.5 rounded-r bg-primary-500"
                        />
                      ) : null}
                      <span>{item.label}</span>
                      {showQueueBadge ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            urgentReviewItems > 0
                              ? "bg-error-100 text-error-700"
                              : "bg-neutral-200 text-neutral-700",
                          )}
                          aria-label={`${openReviewItems} open queue items, ${urgentReviewItems} urgent`}
                        >
                          {openReviewItems}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-neutral-200 px-6 py-4 text-xs text-neutral-500">
        <div className="flex items-center justify-between">
          <span>Role</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-700">
            {roleLabel(role)}
          </span>
        </div>
      </div>
    </aside>
  );
}
