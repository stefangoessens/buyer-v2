"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AgreementType = "tour_pass" | "full_representation";
type AgreementStatus =
  | "draft"
  | "sent"
  | "signed"
  | "canceled"
  | "superseded";

type AgreementRow = {
  _id: string;
  dealRoomId: string;
  type: AgreementType;
  status: AgreementStatus;
  signedAt?: string;
  canceledAt?: string;
};

const TYPE_LABELS: Record<AgreementType, string> = {
  tour_pass: "Tour pass",
  full_representation: "Full representation",
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
  superseded:
    "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
};

const STATUS_LABELS: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
  canceled: "Canceled",
  superseded: "Superseded",
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

export function ProfileAgreementsHistorySection() {
  const profile = useQuery(api.buyerProfiles.getMyProfile, {});
  const buyerId = profile?.userId;
  const governing = useQuery(
    api.agreements.getCurrentGoverning,
    buyerId ? { buyerId } : "skip",
  ) as AgreementRow | null | undefined;

  const isLoading = profile === undefined || governing === undefined;
  const agreements: AgreementRow[] =
    governing && governing._id ? [governing] : [];

  return (
    <Card id="agreements-history">
      <CardHeader>
        <CardTitle>Agreements history</CardTitle>
        <CardDescription>
          Buyer broker agreements you&apos;ve signed with us.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <div className="rounded-3xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            Loading agreements…
          </div>
        ) : agreements.length === 0 ? (
          <div className="rounded-3xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            No signed agreements yet. They&apos;ll appear here once you sign one in
            a deal room.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {agreements.map((agreement) => (
              <li
                key={agreement._id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {TYPE_LABELS[agreement.type]}
                    </p>
                    <Badge
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL_CLASSES[agreement.status]}`}
                    >
                      {STATUS_LABELS[agreement.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Signed {formatDate(agreement.signedAt)}
                    {agreement.canceledAt
                      ? ` · Canceled ${formatDate(agreement.canceledAt)}`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/dealroom/${agreement.dealRoomId}`}
                  className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open deal room
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
