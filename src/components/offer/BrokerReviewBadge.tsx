// Small status badge that communicates the broker review state on the offer draft.
import type { BrokerReviewState } from "@/lib/dealroom/offer-cockpit-types";
import { Badge } from "@/components/ui/badge";

interface BrokerReviewBadgeProps {
  state: BrokerReviewState;
  note?: string | null;
}

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

interface BadgeConfig {
  label: string;
  variant: BadgeVariant;
  className: string;
}

const BADGE_CONFIG: Record<BrokerReviewState, BadgeConfig> = {
  not_submitted: {
    label: "Not submitted",
    variant: "secondary",
    className: "bg-muted text-neutral-700 border-border",
  },
  pending_review: {
    label: "Pending broker review",
    variant: "outline",
    className: "bg-warning-50 text-warning-700 border-warning-200",
  },
  approved: {
    label: "Approved by broker",
    variant: "default",
    className: "bg-success-50 text-success-700 border-success-200",
  },
  rejected: {
    label: "Rejected — see notes",
    variant: "destructive",
    className: "",
  },
};

export function BrokerReviewBadge({ state, note }: BrokerReviewBadgeProps) {
  const config = BADGE_CONFIG[state];
  const showNote =
    (state === "approved" || state === "rejected") && note && note.trim().length > 0;

  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
      {showNote ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
