"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import {
  TAB_ORDER,
  type ClosingTab,
} from "@/lib/closing/taskTemplates";
import { parseTabFromQuery } from "@/lib/closing/commandCenterHelpers";
import { trackClosingEvent } from "@/lib/analytics/closing-events";
import { ClosingTopRail } from "./ClosingTopRail";
import { ClosingTabNav } from "./ClosingTabNav";
import { ClosingTaskGroupCard } from "./ClosingTaskGroupCard";
import { ClosingWireFraudBanner } from "./ClosingWireFraudBanner";
import { InspectionsTabContent } from "./inspections/InspectionsTabContent";

interface ClosingCommandCenterProps {
  dealRoomId: Id<"dealRooms">;
  propertyAddress?: string | null;
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-4xl bg-muted" />
      <div className="h-10 animate-pulse rounded-full bg-muted" />
      <div className="h-56 animate-pulse rounded-4xl bg-muted" />
      <div className="h-56 animate-pulse rounded-4xl bg-muted" />
    </div>
  );
}

export function ClosingCommandCenter({
  dealRoomId,
  propertyAddress,
}: ClosingCommandCenterProps) {
  const data = useQuery(api.closingCommandCenter.getCommandCenter, {
    dealRoomId,
  });
  const ensureSeeded = useMutation(
    api.closingCommandCenter.ensureSeededOnOpen,
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTab = parseTabFromQuery(searchParams.get("tab"), TAB_ORDER);
  const [activeTab, setActiveTab] = useState<ClosingTab>(queryTab ?? "title");

  useEffect(() => {
    ensureSeeded({ dealRoomId }).catch(() => {
      // Non-fatal — buyers can't seed and that's fine.
    });
    trackClosingEvent("COMMAND_CENTER_VIEWED", { dealRoomId });
  }, [dealRoomId, ensureSeeded]);

  useEffect(() => {
    if (queryTab && queryTab !== activeTab) {
      setActiveTab(queryTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTab]);

  const handleTabChange = (tab: ClosingTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const activeTabPayload = useMemo(() => {
    if (!data) return null;
    return data.tabs.find((t) => t.tab === activeTab) ?? data.tabs[0] ?? null;
  }, [data, activeTab]);

  if (data === undefined) {
    return <Skeleton />;
  }

  if (data === null) {
    return (
      <Card className="rounded-4xl shadow-sm">
        <CardContent className="py-16 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            No closing deal yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Come back after your offer is accepted — we&apos;ll guide you through
            every step of closing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tabsHaveContent = data.tabs.some((t) => t.counts.total > 0);
  if (!tabsHaveContent) {
    return (
      <div className="space-y-6">
        <ClosingTopRail
          propertyAddress={propertyAddress}
          dealStatus={data.dealRoom.status}
          tabs={data.tabs}
          milestones={data.milestones}
          percentComplete={data.summary.percentComplete}
          blockedCount={data.summary.blocked}
          overdueCount={data.summary.overdue}
        />
        <Card className="rounded-4xl shadow-sm">
          <CardContent className="py-16 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              Closing tasks not yet seeded
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your broker will populate this board shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ClosingTopRail
        propertyAddress={propertyAddress}
        dealStatus={data.dealRoom.status}
        tabs={data.tabs}
        milestones={data.milestones}
        percentComplete={data.summary.percentComplete}
        blockedCount={data.summary.blocked}
        overdueCount={data.summary.overdue}
      />

      <ClosingTabNav
        tabs={data.tabs}
        activeTab={activeTab}
        dealRoomId={dealRoomId}
        onTabChange={handleTabChange}
      />

      <div className="space-y-4">
        {activeTab === "title" && (
          <ClosingWireFraudBanner dealRoomId={dealRoomId} />
        )}

        {activeTab === "inspections" && (
          <InspectionsTabContent
            dealRoomId={dealRoomId}
            propertyId={data.dealRoom.propertyId}
          />
        )}

        {activeTabPayload && activeTabPayload.groups.length > 0 ? (
          activeTabPayload.groups.map((group) => (
            <ClosingTaskGroupCard
              key={group.groupKey}
              groupKey={group.groupKey}
              groupTitle={group.groupTitle}
              tasks={group.tasks}
              viewerLevel={data.viewerLevel}
              dealRoomId={dealRoomId}
            />
          ))
        ) : (
          <Card className="rounded-4xl shadow-sm">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nothing in this tab yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
