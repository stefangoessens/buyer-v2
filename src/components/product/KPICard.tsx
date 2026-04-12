import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down" | "flat"; percentage: number };
  description?: string;
}

const trendConfig = {
  up: { symbol: "\u2191", className: "text-success-500" },
  down: { symbol: "\u2193", className: "text-error-500" },
  flat: { symbol: "\u2192", className: "text-neutral-400" },
} as const;

export function KPICard({ label, value, trend, description }: KPICardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-3xl font-bold text-neutral-900">{value}</p>
        <p className="mt-1 text-sm font-medium text-neutral-500">{label}</p>
        {trend && (
          <p className={cn("mt-2 text-sm font-medium", trendConfig[trend.direction].className)}>
            {trendConfig[trend.direction].symbol} {trend.percentage}%
          </p>
        )}
        {description && (
          <p className="mt-2 text-xs text-neutral-400">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
