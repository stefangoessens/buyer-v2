"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DASHBOARD_NAV } from "@/lib/dealroom/dashboard-types";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  buyerName?: string;
  buyerEmail?: string;
}

export function AppSidebar({ buyerName, buyerEmail }: AppSidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-sm font-semibold text-white">
          bv
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">buyer-v2</p>
          <p className="text-xs text-neutral-500">Your deals home</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {DASHBOARD_NAV.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-neutral-700 hover:bg-neutral-50",
              )}
            >
              <span className="font-medium">{item.label}</span>
              <span className="text-xs text-neutral-500">{item.description}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-neutral-200 p-4">
        <p className="text-sm font-medium text-neutral-900">
          {buyerName ?? "Signed-in buyer"}
        </p>
        {buyerEmail && (
          <p className="truncate text-xs text-neutral-500">{buyerEmail}</p>
        )}
      </div>
    </aside>
  );
}

export function AppTopNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
      {DASHBOARD_NAV.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "border-primary-400 bg-primary-50 text-primary-700"
                : "border-neutral-200 bg-white text-neutral-600",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
