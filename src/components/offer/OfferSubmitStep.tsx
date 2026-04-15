// Third wizard step — status timeline + submit button (KIN-1077).
"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, CircleIcon } from "@hugeicons/core-free-icons";
import type {
  OfferCockpitStatus,
  OfferEligibilitySnapshot,
} from "@/lib/dealroom/offer-cockpit-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { trackOfferGateEvent } from "@/lib/analytics/offer-gate-events";
import {
  OfferStatusTimeline,
  type OfferTimelineStage,
} from "./OfferStatusTimeline";

interface OfferSubmitStepProps {
  brokerageCallState: {
    requestedAt: string | null;
    completedAt: string | null;
    stage: "none" | "requested" | "completed";
  };
  eligibility: OfferEligibilitySnapshot;
  draftStatus: OfferCockpitStatus;
  canSubmit: boolean;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
  dealRoomId: string;
}

function deriveTimelineStage(
  brokerageStage: "none" | "requested" | "completed",
  eligibilityIsEligible: boolean,
  draftStatus: OfferCockpitStatus,
): OfferTimelineStage {
  if (draftStatus === "pending_review" || draftStatus === "approved") {
    return "ready_to_submit";
  }
  if (brokerageStage === "none") return "requested";
  if (brokerageStage === "requested") return "requested";
  if (!eligibilityIsEligible) return "broker_spoke";
  return "ready_to_submit";
}

interface ChecklistRowProps {
  done: boolean;
  label: string;
  detail?: string;
}

function ChecklistRow({ done, label, detail }: ChecklistRowProps) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          done
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        <HugeiconsIcon
          icon={done ? CheckmarkCircle02Icon : CircleIcon}
          size={14}
          strokeWidth={2.5}
        />
      </span>
      <div className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-sm font-medium",
            done ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {detail && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </div>
    </li>
  );
}

export function OfferSubmitStep({
  brokerageCallState,
  eligibility,
  draftStatus,
  canSubmit,
  submitting,
  submitError,
  onSubmit,
  dealRoomId,
}: OfferSubmitStepProps) {
  const timelineStage = deriveTimelineStage(
    brokerageCallState.stage,
    eligibility.isEligible,
    draftStatus,
  );

  const agreementSignedAt =
    eligibility.isEligible && brokerageCallState.completedAt
      ? brokerageCallState.completedAt
      : null;

  const callbackDone =
    brokerageCallState.stage === "requested" ||
    brokerageCallState.stage === "completed";
  const spokeDone = brokerageCallState.stage === "completed";
  const agreementDone = eligibility.isEligible;

  // The button must gate on the full brokerage pipeline — not just draft
  // editability. Otherwise the button goes live as soon as the phone is
  // submitted and terms validate, and the buyer hits a server-side rejection
  // instead of seeing the intended UI gate. Callback must be completed AND
  // the buyer must be formally eligible (signed full_representation).
  const submitEnabled =
    canSubmit && !submitting && spokeDone && agreementDone;
  const disabledKind: "awaiting_callback" | "awaiting_agreement" | null =
    !submitEnabled
      ? !spokeDone
        ? "awaiting_callback"
        : !agreementDone
          ? "awaiting_agreement"
          : null
      : null;

  const disabledLabel =
    disabledKind === "awaiting_callback"
      ? "Awaiting broker callback"
      : disabledKind === "awaiting_agreement"
        ? "Awaiting signed agreement"
        : null;

  const submitEnabledRef = useRef(false);
  useEffect(() => {
    if (submitEnabled && !submitEnabledRef.current) {
      submitEnabledRef.current = true;
      trackOfferGateEvent("SUBMIT_ENABLED", { dealRoomId });
    }
    if (!submitEnabled) {
      submitEnabledRef.current = false;
    }
  }, [submitEnabled, dealRoomId]);

  const handleDisabledClick = () => {
    if (disabledKind) {
      trackOfferGateEvent("SUBMIT_BLOCKED", {
        dealRoomId,
        kind: disabledKind,
      });
    }
  };

  const handleSubmitClick = () => {
    trackOfferGateEvent("SUBMIT_CLICKED", { dealRoomId });
    onSubmit();
  };

  return (
    <div className="flex flex-col gap-6">
      <OfferStatusTimeline
        stage={timelineStage}
        brokerageCallRequestedAt={brokerageCallState.requestedAt}
        brokerageCallbackCompletedAt={brokerageCallState.completedAt}
        agreementSignedAt={agreementSignedAt}
      />

      <Card>
        <CardContent className="flex flex-col gap-5 py-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-lg font-semibold text-foreground">
              Sign &amp; Submit
            </h3>
            <p className="text-sm text-muted-foreground">
              Your offer is ready to submit once these conditions are met:
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            <ChecklistRow done={callbackDone} label="Broker callback requested" />
            <ChecklistRow done={spokeDone} label="Broker spoke with you" />
            <ChecklistRow
              done={agreementDone}
              label="Agreement signed"
              detail={
                !agreementDone && eligibility.blockingReasonMessage
                  ? eligibility.blockingReasonMessage
                  : undefined
              }
            />
          </ul>

          {draftStatus === "pending_review" && (
            <div
              role="status"
              className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
            >
              This draft is with your broker. You&apos;ll be notified once
              it&apos;s reviewed.
            </div>
          )}

          {draftStatus === "approved" && (
            <div
              role="status"
              className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
            >
              Approved by your broker — ready to submit to the seller.
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {submitError}
            </div>
          )}

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              size="lg"
              className="sm:w-auto"
              onClick={submitEnabled ? handleSubmitClick : handleDisabledClick}
              disabled={!submitEnabled}
              aria-disabled={!submitEnabled}
              title={disabledLabel ?? undefined}
            >
              {submitting
                ? "Submitting…"
                : disabledLabel ?? "Submit offer for review"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
