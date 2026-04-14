"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AgreementDetailSheet,
  type AgreementDetail,
} from "./AgreementDetailSheet";
import { AgreementsEmptyState } from "./AgreementsEmptyState";
import { AgreementRow } from "./AgreementRow";

type PropertyAddress = {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  formatted?: string;
};

type AgreementsGroup = {
  dealRoomId: string;
  property: {
    _id: string;
    address?: PropertyAddress | null;
    listPrice?: number | null;
  } | null;
  governing: AgreementDetail | null;
  allAgreements: AgreementDetail[];
  createdAt?: string;
};

type AgreementsGroupedListProps = {
  dealRoomFilter?: string;
  statusFilter?: string;
  typeFilter?: string;
};

function formatAddress(address: PropertyAddress | null | undefined): string {
  if (!address) return "Untitled property";
  if (address.formatted) return address.formatted;
  const parts = [
    address.street,
    [address.city, address.state].filter(Boolean).join(", "),
    address.zip,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Untitled property";
}

function formatPrice(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return null;
  }
}

export function AgreementsGroupedList({
  dealRoomFilter,
  statusFilter,
  typeFilter,
}: AgreementsGroupedListProps) {
  const queryArgs = useMemo(
    () => ({
      // Convex validators reject undefined keys, so omit unset filters.
      // dealRoomFilter is a branded Convex Id at the validator level — at
      // runtime it's just a string, so casting from URL search params is safe.
      ...(dealRoomFilter
        ? { dealRoomFilter: dealRoomFilter as Id<"dealRooms"> }
        : {}),
      ...(statusFilter ? { statusFilter } : {}),
      ...(typeFilter ? { typeFilter } : {}),
    }),
    [dealRoomFilter, statusFilter, typeFilter],
  );

  const groups = useQuery(
    api.dashboardAgreements.listGrouped,
    queryArgs,
  ) as AgreementsGroup[] | undefined;

  const [selectedAgreement, setSelectedAgreement] =
    useState<AgreementDetail | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleSelect = (agreement: AgreementDetail) => {
    setSelectedAgreement(agreement);
    setIsSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      // Defer clearing so the closing animation keeps the data on screen.
      setTimeout(() => setSelectedAgreement(null), 200);
    }
  };

  if (groups === undefined) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Loading your agreements…
        </CardContent>
      </Card>
    );
  }

  if (groups.length === 0) {
    return <AgreementsEmptyState />;
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {groups.map((group) => {
          const addressLabel = formatAddress(group.property?.address);
          const priceLabel = formatPrice(group.property?.listPrice);
          const history = group.allAgreements.filter(
            (a) => a._id !== group.governing?._id,
          );

          return (
            <Card key={group.dealRoomId}>
              <CardHeader className="border-b border-border/60 pb-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{addressLabel}</CardTitle>
                    <CardDescription className="mt-1">
                      {priceLabel
                        ? `${priceLabel} · ${group.allAgreements.length} agreement${group.allAgreements.length === 1 ? "" : "s"}`
                        : `${group.allAgreements.length} agreement${group.allAgreements.length === 1 ? "" : "s"}`}
                    </CardDescription>
                  </div>
                  <Link
                    href={`/dealroom/${group.dealRoomId}`}
                    className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open deal room
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {group.governing ? (
                  <AgreementRow
                    agreement={group.governing}
                    onSelect={handleSelect}
                    showDealRoomLink={false}
                    emphasis="governing"
                  />
                ) : (
                  <div className="rounded-2xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                    No governing agreement signed yet for this deal room.
                  </div>
                )}

                {history.length > 0 ? (
                  <Accordion
                    type="single"
                    collapsible
                    className="border-border/60 bg-transparent"
                  >
                    <AccordionItem value="history" className="border-0">
                      <AccordionTrigger className="rounded-2xl border-0 px-4 py-3 text-xs font-medium text-muted-foreground hover:no-underline">
                        Show {history.length} prior version
                        {history.length === 1 ? "" : "s"}
                      </AccordionTrigger>
                      <AccordionContent className="px-2">
                        <div className="flex flex-col gap-1">
                          {history.map((agreement) => (
                            <AgreementRow
                              key={agreement._id}
                              agreement={agreement}
                              onSelect={handleSelect}
                              showDealRoomLink={false}
                              emphasis="history"
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AgreementDetailSheet
        open={isSheetOpen}
        onOpenChange={handleSheetOpenChange}
        agreement={selectedAgreement}
      />
    </>
  );
}
