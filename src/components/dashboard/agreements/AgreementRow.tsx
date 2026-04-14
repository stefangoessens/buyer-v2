"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgreementDetail } from "./AgreementDetailSheet";

type AgreementType = AgreementDetail["type"];
type AgreementStatus = AgreementDetail["status"];

const TYPE_LABELS: Record<AgreementType, string> = {
  tour_pass: "Tour pass",
  full_representation: "Full representation",
};

const STATUS_LABELS: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
  canceled: "Canceled",
  replaced: "Replaced",
  superseded: "Superseded",
};

const STATUS_PILL_CLASSES: Record<AgreementStatus, string> = {
  draft:
    "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  sent:
    "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
  signed:
    "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30",
  canceled:
    "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20",
  replaced:
    "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  superseded:
    "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

type AgreementRowProps = {
  agreement: AgreementDetail;
  onSelect: (agreement: AgreementDetail) => void;
  showDealRoomLink?: boolean;
  emphasis?: "governing" | "history";
};

export function AgreementRow({
  agreement,
  onSelect,
  showDealRoomLink = true,
  emphasis = "history",
}: AgreementRowProps) {
  const isGoverning = emphasis === "governing";

  const primaryParty = agreement.parties?.find((p) => p.name || p.email);
  const partyLabel = primaryParty?.name ?? primaryParty?.email;

  const handleClick = () => onSelect(agreement);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(agreement);
    }
  };

  const dateLabel =
    agreement.status === "signed" || agreement.status === "replaced"
      ? `Signed ${formatDate(agreement.signedAt)}`
      : agreement.status === "canceled"
        ? `Canceled ${formatDate(agreement.canceledAt)}`
        : agreement.status === "sent"
          ? "Awaiting signature"
          : "Draft";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group/row flex flex-col gap-3 rounded-2xl px-4 py-3 transition-colors outline-none sm:flex-row sm:items-center sm:justify-between",
        "cursor-pointer hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
        isGoverning
          ? "bg-muted/40 ring-1 ring-inset ring-border"
          : "bg-transparent",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {TYPE_LABELS[agreement.type]}
          </p>
          <Badge
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              STATUS_PILL_CLASSES[agreement.status],
            )}
          >
            {STATUS_LABELS[agreement.status]}
          </Badge>
          {isGoverning ? (
            <Badge
              variant="outline"
              className="rounded-full border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              Governing
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {dateLabel}
          {partyLabel ? ` · ${partyLabel}` : ""}
          {agreement.supersededAt
            ? ` · Replaced ${formatDate(agreement.supersededAt)}`
            : ""}
        </p>
      </div>
      {showDealRoomLink ? (
        <Link
          href={`/dealroom/${agreement.dealRoomId}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Open deal room
        </Link>
      ) : null}
    </div>
  );
}
