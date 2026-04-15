"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Mail01Icon,
  TickDouble02Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { track } from "@/lib/analytics";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  DisclosureRequestStatusTimeline,
  type DisclosureRequestTimelineStage,
} from "./DisclosureRequestStatusTimeline";
import { DisclosureRequestPreviewDialog } from "./DisclosureRequestPreviewDialog";

interface DisclosureRequestCardProps {
  dealRoomId: Id<"dealRooms">;
}

function isFeatureEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_KIN_1079_REQUEST_DISCLOSURES_ENABLED === "true"
  );
}

function statusToTimelineStage(
  status: string,
): DisclosureRequestTimelineStage | null {
  switch (status) {
    case "sent":
      return "sent";
    case "opened":
      return "opened";
    case "replied":
      return "replied";
    case "follow_up_needed":
      return "follow_up_needed";
    default:
      return null;
  }
}

export function DisclosureRequestCard({ dealRoomId }: DisclosureRequestCardProps) {
  if (!isFeatureEnabled()) {
    return null;
  }

  return <DisclosureRequestCardInner dealRoomId={dealRoomId} />;
}

function DisclosureRequestCardInner({ dealRoomId }: DisclosureRequestCardProps) {
  const latestRequest = useQuery(api.disclosures.getLatestDisclosureRequest, {
    dealRoomId,
  });
  const requestFromListingAgent = useMutation(
    api.disclosures.requestFromListingAgent,
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const viewedFiredRef = useRef(false);

  useEffect(() => {
    if (viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    track("disclosure_request_card_viewed", { dealRoomId });
  }, [dealRoomId]);

  const handleOpenPreview = useCallback(() => {
    setPreviewOpen(true);
  }, []);

  const handleSendFollowUp = useCallback(async () => {
    if (sendingFollowUp) return;
    setSendingFollowUp(true);
    try {
      await requestFromListingAgent({ dealRoomId });
      track("disclosure_request_sent", { dealRoomId, hasPersonalNote: false });
      toast.success(
        "Follow-up sent — we'll nudge you again when the agent replies.",
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't send the follow-up. Try again in a moment.";
      toast.error(message);
    } finally {
      setSendingFollowUp(false);
    }
  }, [sendingFollowUp, requestFromListingAgent, dealRoomId]);

  if (latestRequest === undefined) {
    return (
      <Card
        className="rounded-4xl border-border"
        aria-label="Request disclosures from listing agent"
      >
        <CardContent className="p-6 text-sm text-muted-foreground sm:p-8">
          Loading request status…
        </CardContent>
      </Card>
    );
  }

  const timelineStage = latestRequest
    ? statusToTimelineStage(latestRequest.status)
    : null;

  const showTimeline = latestRequest !== null && timelineStage !== null;
  const isFollowUpOverdue =
    latestRequest !== null && latestRequest.status === "follow_up_needed";

  return (
    <>
      <Card
        className="rounded-4xl border-border"
        aria-label="Request disclosures from listing agent"
        data-testid="disclosure-request-card"
      >
        <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Need the packet?
              </p>
              {showTimeline && (
                <Badge
                  variant={isFollowUpOverdue ? "destructive" : "secondary"}
                  className="gap-1"
                >
                  {latestRequest?.status === "replied" ? (
                    <HugeiconsIcon
                      icon={TickDouble02Icon}
                      size={12}
                      strokeWidth={2}
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Clock01Icon}
                      size={12}
                      strokeWidth={2}
                    />
                  )}
                  {labelForStatus(latestRequest!.status)}
                </Badge>
              )}
            </div>
            <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              We&apos;ll ask the listing agent for you
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {showTimeline
                ? isFollowUpOverdue
                  ? "It&apos;s been more than 48 hours without a reply. Send a polite nudge and we&apos;ll keep the thread moving."
                  : "Your request is on its way. We&apos;ll notify you as soon as the listing agent opens the email or sends the packet."
                : "Skip the awkward ask. We&apos;ll send a broker-authored email on your behalf and ping you the moment the packet lands."}
            </p>
          </div>

          {showTimeline && latestRequest ? (
            <DisclosureRequestStatusTimeline
              stage={timelineStage}
              sentAt={latestRequest.sentAt ?? null}
              openedAt={latestRequest.openedAt ?? null}
              repliedAt={latestRequest.repliedAt ?? null}
            />
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={Clock01Icon}
                size={14}
                strokeWidth={2}
                className="mt-0.5 shrink-0"
              />
              <span>
                Most agents reply within 48 hours. We&apos;ll follow up automatically
                if it&apos;s quiet.
              </span>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {isFollowUpOverdue && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleSendFollowUp}
                  disabled={sendingFollowUp}
                  className="gap-2"
                >
                  <HugeiconsIcon
                    icon={Mail01Icon}
                    size={18}
                    strokeWidth={2}
                  />
                  {sendingFollowUp ? "Sending…" : "Send follow-up"}
                </Button>
              )}
              {!showTimeline && (
                <Button
                  type="button"
                  size="lg"
                  onClick={handleOpenPreview}
                  className="gap-2"
                >
                  <HugeiconsIcon
                    icon={Mail01Icon}
                    size={18}
                    strokeWidth={2}
                  />
                  Preview the email
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <DisclosureRequestPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        dealRoomId={dealRoomId}
        featureEnabled={isFeatureEnabled()}
      />
    </>
  );
}

function labelForStatus(status: string): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "opened":
      return "Opened";
    case "replied":
      return "Replied";
    case "follow_up_needed":
      return "Needs follow-up";
    default:
      return "Pending";
  }
}
