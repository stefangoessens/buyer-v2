"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  ClosingDealsBoard,
  type BrokerBoardSeed,
} from "@/components/admin/ClosingDealsBoard";

/**
 * Broker-facing closing deals board (KIN-1080). Surfaces every active
 * `under_contract` / `closing` deal room with stuck-deal signals so
 * ops can triage the pipeline from one place.
 */
export default function ConsoleClosingPage() {
  return (
    <AdminShell>
      <ConsoleClosingContent />
    </AdminShell>
  );
}

function ConsoleClosingContent() {
  const seeds = useQuery(api.closingCommandCenter.getBrokerBoardData) as
    | readonly BrokerBoardSeed[]
    | undefined;

  return (
    <>
      <AdminPageHeader
        eyebrow="Closing deals"
        title="Closing command center"
        description="Every deal room under contract or in closing. Stuck-deal signals flag where brokers need to intervene — blocked tasks, overdue deadlines, or stale waiting-on handoffs."
      />
      {seeds === undefined ? (
        <AdminEmptyState
          title="Loading closing deals…"
          description="Fetching the active board from the closing command center."
        />
      ) : (
        <ClosingDealsBoard seeds={seeds} />
      )}
    </>
  );
}
