// Three-column section wrapper for attention / waiting / on track lists.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardSectionProps {
  title: string;
  subtitle?: string;
  count: number;
  tone: "attention" | "waiting" | "on_track";
  children: ReactNode;
  empty?: string;
}

const toneStyles: Record<DashboardSectionProps["tone"], string> = {
  attention: "border-error-100 bg-error-50/40",
  waiting: "border-warning-100 bg-warning-50/40",
  on_track: "border-success-100 bg-success-50/40",
};

const accentStyles: Record<DashboardSectionProps["tone"], string> = {
  attention: "text-error-700",
  waiting: "text-warning-700",
  on_track: "text-success-700",
};

export function DashboardSection({
  title,
  subtitle,
  count,
  tone,
  children,
  empty,
}: DashboardSectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border p-5",
        toneStyles[tone],
      )}
    >
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>
          )}
        </div>
        <span className={cn("text-2xl font-bold", accentStyles[tone])}>
          {count}
        </span>
      </header>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 bg-white/80 p-4 text-center text-sm text-neutral-500">
          {empty ?? "Nothing here right now."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}
