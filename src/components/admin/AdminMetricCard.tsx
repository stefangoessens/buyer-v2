import { type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AdminMetricCardProps {
  label: string;
  value: ReactNode;
  delta?: {
    direction: "up" | "down" | "flat";
    text: string;
  };
  helper?: string;
  tone?: "default" | "warning" | "error";
}

/**
 * Reusable metric tile for the console overview and KPI dashboard stubs.
 * Keeps the card size + type scale consistent across routes.
 */
export function AdminMetricCard({
  label,
  value,
  delta,
  helper,
  tone = "default",
}: AdminMetricCardProps) {
  return (
    <Card
      className={cn(
        "gap-2 transition-shadow hover:shadow-md",
        tone === "warning" && "border border-warning-500/40 bg-warning-50/50",
        tone === "error" && "border border-error-500/40 bg-error-50/40",
      )}
    >
      <CardHeader className="pb-0">
        <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight text-neutral-900">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-baseline justify-between text-xs">
        {helper ? (
          <span className="text-neutral-500">{helper}</span>
        ) : (
          <span />
        )}
        {delta ? (
          <span
            className={cn(
              "font-medium",
              delta.direction === "up" && "text-success-700",
              delta.direction === "down" && "text-error-700",
              delta.direction === "flat" && "text-neutral-500",
            )}
          >
            {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "—"} {delta.text}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
