"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { AgreementsGroupedList } from "@/components/dashboard/agreements/AgreementsGroupedList";
import { Card, CardContent } from "@/components/ui/card";

function AgreementsPageInner() {
  const searchParams = useSearchParams();
  const dealRoom = searchParams.get("dealRoom") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const type = searchParams.get("type") ?? undefined;

  return (
    <AgreementsGroupedList
      dealRoomFilter={dealRoom}
      statusFilter={status}
      typeFilter={type}
    />
  );
}

export function AgreementsPageClient() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading your agreements…
          </CardContent>
        </Card>
      }
    >
      <AgreementsPageInner />
    </Suspense>
  );
}
