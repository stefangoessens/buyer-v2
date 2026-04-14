"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AgreementType = "tour_pass" | "full_representation";
type AgreementStatus =
  | "draft"
  | "sent"
  | "signed"
  | "canceled"
  | "replaced"
  | "superseded";

type AgreementParty = {
  name?: string;
  email?: string;
  role?: string;
};

export type AgreementDetail = {
  _id: string;
  dealRoomId: string;
  dealRoomAddress?: string;
  type: AgreementType;
  status: AgreementStatus;
  signedAt?: string;
  canceledAt?: string;
  supersededAt?: string;
  supersessionReason?: string;
  replacedById?: string;
  parties?: AgreementParty[];
  reviewedAt?: string;
  reviewedBy?: { name?: string; email?: string } | string;
  brokerEmail?: string;
  priorVersions?: Array<{
    _id: string;
    type: AgreementType;
    status: AgreementStatus;
    signedAt?: string;
    supersededAt?: string;
    supersessionReason?: string;
  }>;
};

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

const STATUS_VARIANT: Record<
  AgreementStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  sent: "outline",
  signed: "default",
  canceled: "destructive",
  replaced: "secondary",
  superseded: "secondary",
};

const SUPERSESSION_LABELS: Record<string, string> = {
  upgrade_to_full_representation: "Upgraded to full representation",
  correction: "Correction",
  amendment: "Amendment",
  renewal: "Renewal",
  replace_expired: "Replaced expired agreement",
  broker_decision: "Broker decision",
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

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getReviewerName(
  reviewedBy: AgreementDetail["reviewedBy"],
): string | undefined {
  if (!reviewedBy) return undefined;
  if (typeof reviewedBy === "string") return reviewedBy;
  return reviewedBy.name ?? reviewedBy.email;
}

export type AgreementDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agreement: AgreementDetail | null;
};

export function AgreementDetailSheet({
  open,
  onOpenChange,
  agreement,
}: AgreementDetailSheetProps) {
  const [showHistory, setShowHistory] = React.useState(false);

  React.useEffect(() => {
    if (!open) setShowHistory(false);
  }, [open]);

  if (!agreement) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Agreement</SheetTitle>
            <SheetDescription>
              Select an agreement to see its details.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const reviewerName = getReviewerName(agreement.reviewedBy);
  const priorVersions = agreement.priorVersions ?? [];
  const hasHistory = priorVersions.length > 0;
  const supersessionLabel = agreement.supersessionReason
    ? (SUPERSESSION_LABELS[agreement.supersessionReason] ??
      agreement.supersessionReason)
    : undefined;
  const contactHref = agreement.brokerEmail
    ? `mailto:${agreement.brokerEmail}?subject=${encodeURIComponent(
        `Question about my ${TYPE_LABELS[agreement.type]} agreement`,
      )}`
    : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <div className="flex items-start justify-between gap-3 pr-10">
            <div className="flex flex-col gap-1">
              <SheetTitle>{TYPE_LABELS[agreement.type]}</SheetTitle>
              <SheetDescription>
                {agreement.dealRoomAddress ?? "Buyer broker agreement"}
              </SheetDescription>
            </div>
            <Badge variant={STATUS_VARIANT[agreement.status]}>
              {STATUS_LABELS[agreement.status]}
            </Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Signed</dt>
              <dd className="font-medium text-foreground">
                {formatDate(agreement.signedAt)}
              </dd>
            </div>
            {agreement.canceledAt ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Canceled</dt>
                <dd className="font-medium text-foreground">
                  {formatDate(agreement.canceledAt)}
                </dd>
              </div>
            ) : null}
            {agreement.supersededAt ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Superseded</dt>
                <dd className="font-medium text-foreground">
                  {formatDate(agreement.supersededAt)}
                </dd>
              </div>
            ) : null}
            {supersessionLabel ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="font-medium text-foreground">
                  {supersessionLabel}
                </dd>
              </div>
            ) : null}
          </dl>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="rounded-3xl bg-muted/40 px-4 py-6 text-sm text-muted-foreground ring-1 ring-inset ring-border/40">
            <p className="font-medium text-foreground">Document preview</p>
            <p className="mt-1">
              Full document preview coming soon &mdash; your broker can email
              you a copy on request.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Button variant="outline" disabled className="justify-start">
              Preview PDF &middot; Coming soon
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={!hasHistory}
              aria-expanded={hasHistory ? showHistory : undefined}
              onClick={() => setShowHistory((value) => !value)}
            >
              {hasHistory
                ? showHistory
                  ? "Hide supersession history"
                  : `View supersession history (${priorVersions.length})`
                : "No prior versions"}
            </Button>
            {contactHref ? (
              <Button
                variant="secondary"
                asChild
                className="justify-start"
              >
                <Link href={contactHref}>Contact broker</Link>
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled
                className="justify-start"
              >
                Contact broker &middot; Unavailable
              </Button>
            )}
            <Button asChild variant="link" className="justify-start px-0">
              <Link href={`/dealroom/${agreement.dealRoomId}`}>
                Open deal room
              </Link>
            </Button>
          </div>

          {hasHistory && showHistory ? (
            <ol className="mt-5 flex flex-col gap-2 border-t border-border/60 pt-4">
              {priorVersions.map((prior) => (
                <li
                  key={prior._id}
                  className="flex flex-col gap-1 rounded-3xl bg-muted/30 px-4 py-3 ring-1 ring-inset ring-border/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {TYPE_LABELS[prior.type]}
                    </span>
                    <Badge variant={STATUS_VARIANT[prior.status]}>
                      {STATUS_LABELS[prior.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Signed {formatDate(prior.signedAt)}
                    {prior.supersededAt
                      ? ` \u00b7 Superseded ${formatDate(prior.supersededAt)}`
                      : ""}
                  </p>
                  {prior.supersessionReason ? (
                    <p className="text-xs text-muted-foreground">
                      {SUPERSESSION_LABELS[prior.supersessionReason] ??
                        prior.supersessionReason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border/60">
          {agreement.parties && agreement.parties.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Signed parties
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {agreement.parties.map((party, index) => (
                  <li key={`${party.email ?? party.name ?? index}`}>
                    <Badge variant="outline">
                      {party.name ?? party.email ?? "Unnamed party"}
                      {party.role ? ` \u00b7 ${party.role}` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Signed parties
              </p>
              <p className="text-xs text-muted-foreground">
                Party details will appear here once the broker uploads the
                signed copy.
              </p>
            </div>
          )}
          {reviewerName || agreement.reviewedAt ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-xs font-medium text-muted-foreground">
                Reviewed
              </p>
              <p className="text-xs text-foreground">
                {reviewerName ? `${reviewerName} \u00b7 ` : ""}
                {formatDateTime(agreement.reviewedAt)}
              </p>
            </div>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
