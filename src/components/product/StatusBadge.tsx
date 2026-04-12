import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "active" | "pending" | "closed" | "urgent" | "draft";
  label?: string;
}

const statusConfig = {
  active: {
    dot: "bg-success-500",
    badge: "bg-success-50 text-success-700",
    defaultLabel: "Active",
  },
  pending: {
    dot: "bg-warning-500",
    badge: "bg-warning-50 text-warning-700",
    defaultLabel: "Pending",
  },
  closed: {
    dot: "bg-neutral-400",
    badge: "bg-neutral-100 text-neutral-600",
    defaultLabel: "Closed",
  },
  urgent: {
    dot: "bg-error-500",
    badge: "bg-error-50 text-error-700",
    defaultLabel: "Urgent",
  },
  draft: {
    dot: "bg-info-500",
    badge: "bg-info-50 text-info-700",
    defaultLabel: "Draft",
  },
} as const;

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full border-transparent",
        config.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {label ?? config.defaultLabel}
    </Badge>
  );
}
