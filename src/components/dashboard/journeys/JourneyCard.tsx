"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  Archive01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Edit01Icon,
  Image01Icon,
  MoreVerticalIcon,
  StarIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDealRoomActivity } from "@/lib/dealroom/dashboard-types";
import {
  journeyStepAriaLabel,
  JOURNEY_TOTAL_STEPS,
} from "@/lib/dealroom/journey-status-labels";
import { trackJourneyEvent } from "@/lib/analytics/journey-events";

import type { JourneyRow, JourneyViewKind } from "./JourneysPage";

const UNDO_WINDOW_MS = 8000;
const MAX_LABEL_LEN = 24;

interface JourneyCardProps {
  row: JourneyRow;
  onRequestArchive: (row: JourneyRow) => void;
  onRestoreLocal: (dealRoomId: string) => void;
  view: JourneyViewKind;
}

export function JourneyCard({
  row,
  onRequestArchive,
  onRestoreLocal,
  view,
}: JourneyCardProps) {
  const archiveJourney = useMutation(api.dealRooms.archiveJourney);
  const restoreJourney = useMutation(api.dealRooms.restoreJourney);
  const setPriority = useMutation(api.dealRooms.setJourneyPriority);
  const setLabel = useMutation(api.dealRooms.setJourneyLabel);

  const dealRoomIdTyped = row.dealRoomId as unknown as Id<"dealRooms">;

  const [priorityOpen, setPriorityOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(row.journeyLabel ?? "");
  const cardRef = useRef<HTMLDivElement | null>(null);

  const activityLabel = useMemo(() => {
    if (!row.lastActivityAt) return "No recent activity";
    return `Last activity ${formatDealRoomActivity(row.lastActivityAt, new Date().toISOString())}`;
  }, [row.lastActivityAt]);

  const isHighPriority = row.journeyPriority === "high";

  const handleCardClick = useCallback(() => {
    trackJourneyEvent("CARD_OPENED", {
      dealRoomId: row.dealRoomId,
      propertyId: row.propertyId,
    });
  }, [row.dealRoomId, row.propertyId]);

  const handleCtaClick = useCallback(() => {
    trackJourneyEvent("CONTINUE_CLICKED", {
      dealRoomId: row.dealRoomId,
      propertyId: row.propertyId,
      nextActionLabel: row.nextActionLabel,
    });
  }, [row.dealRoomId, row.propertyId, row.nextActionLabel]);

  const handleArchive = useCallback(() => {
    trackJourneyEvent("ARCHIVE_CLICKED", { dealRoomId: row.dealRoomId });
    onRequestArchive(row);

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      try {
        await archiveJourney({ dealRoomId: dealRoomIdTyped });
        trackJourneyEvent("ARCHIVE_COMMITTED", {
          dealRoomId: row.dealRoomId,
        });
      } catch {
        onRestoreLocal(row.dealRoomId);
        toast.error("Could not archive journey");
      }
    };

    const timeoutId = window.setTimeout(commit, UNDO_WINDOW_MS);

    toast("Journey archived", {
      description: row.address,
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          window.clearTimeout(timeoutId);
          committed = true;
          trackJourneyEvent("ARCHIVE_UNDO_CLICKED", {
            dealRoomId: row.dealRoomId,
          });
          onRestoreLocal(row.dealRoomId);
        },
      },
    });
  }, [
    archiveJourney,
    dealRoomIdTyped,
    onRequestArchive,
    onRestoreLocal,
    row.address,
    row.dealRoomId,
  ]);

  const handleRestore = useCallback(async () => {
    try {
      await restoreJourney({ dealRoomId: dealRoomIdTyped });
      trackJourneyEvent("RESTORED", { dealRoomId: row.dealRoomId });
      toast.success("Journey restored");
    } catch {
      toast.error("Could not restore journey");
    }
  }, [restoreJourney, dealRoomIdTyped, row.dealRoomId]);

  const handlePriorityChoice = useCallback(
    async (next: "high" | "normal" | "low") => {
      try {
        await setPriority({ dealRoomId: dealRoomIdTyped, priority: next });
        trackJourneyEvent("PRIORITY_CHANGED", {
          dealRoomId: row.dealRoomId,
          priority: next,
        });
      } catch {
        toast.error("Could not update priority");
      } finally {
        setPriorityOpen(false);
      }
    },
    [setPriority, dealRoomIdTyped, row.dealRoomId],
  );

  const handleSaveLabel = useCallback(async () => {
    const trimmed = labelDraft.trim().slice(0, MAX_LABEL_LEN);
    try {
      await setLabel({
        dealRoomId: dealRoomIdTyped,
        label: trimmed.length > 0 ? trimmed : null,
      });
      trackJourneyEvent("LABEL_SAVED", { dealRoomId: row.dealRoomId });
      setLabelOpen(false);
    } catch {
      toast.error("Could not save label");
    }
  }, [labelDraft, setLabel, dealRoomIdTyped, row.dealRoomId]);

  const handleCardKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleCtaClick();
        window.location.href = row.nextActionHref;
      }
    },
    [handleCtaClick, row.nextActionHref],
  );

  const ariaLabel = `Journey at ${row.address}. ${row.buyerFacingStatusLabel}. ${journeyStepAriaLabel(row.currentStep, row.percentComplete)}. Next: ${row.nextActionLabel}.`;

  return (
    <Card
      ref={cardRef}
      data-journey-card="true"
      tabIndex={0}
      role="gridcell"
      aria-label={ariaLabel}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "group relative gap-0 overflow-hidden p-0 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isHighPriority &&
          "border-amber-400/70 bg-gradient-to-br from-amber-50/40 via-card to-card dark:from-amber-400/5 dark:via-card dark:to-card",
      )}
    >
      <Link
        href={row.nextActionHref}
        onClick={handleCardClick}
        aria-label={`Open ${row.address}`}
        className="relative block aspect-[16/9] w-full overflow-hidden bg-muted"
      >
        {row.photoUrl ? (
          <Image
            src={row.photoUrl}
            alt={row.address}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <HugeiconsIcon icon={Image01Icon} className="size-6 opacity-40" />
          </div>
        )}
        {row.photoCount > 1 ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-inset ring-foreground/10 backdrop-blur">
            +{row.photoCount - 1} photos
          </span>
        ) : null}
        {isHighPriority ? (
          <span
            className="absolute left-3 top-3 flex size-7 items-center justify-center rounded-full bg-amber-400/95 text-amber-950 shadow-sm ring-1 ring-inset ring-amber-500/40"
            aria-hidden="true"
          >
            <HugeiconsIcon icon={StarIcon} className="size-3.5" />
          </span>
        ) : null}
        {row.journeyLabel ? (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-inset ring-foreground/10 backdrop-blur">
            <HugeiconsIcon icon={Tag01Icon} className="size-3" />
            {row.journeyLabel}
          </span>
        ) : null}
      </Link>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-base font-semibold text-foreground">
              {row.address}
            </h3>
            {row.cityState ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {row.cityState}
              </p>
            ) : null}
          </div>
          <OverflowMenu
            view={view}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onOpenPriority={() => setPriorityOpen(true)}
            onOpenLabel={() => setLabelOpen(true)}
            detailsHref={`/property/${row.propertyId}/details`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="h-6">
            {row.buyerFacingStatusLabel}
          </Badge>
          {row.attentionCount > 0 && row.attentionLabel ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="destructive"
                    className="h-6 cursor-help gap-1"
                  >
                    <HugeiconsIcon icon={Alert01Icon} className="size-3" />
                    {row.attentionLabel}
                  </Badge>
                </TooltipTrigger>
                {row.topAttentionReason ? (
                  <TooltipContent>{row.topAttentionReason}</TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>

        <ProgressDots
          currentStep={row.currentStep}
          percentComplete={row.percentComplete}
          stepLabel={row.stepLabel}
        />

        <p className="text-xs text-muted-foreground">{activityLabel}</p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            asChild
            size="sm"
            className="flex-1 rounded-full"
            onClick={handleCtaClick}
          >
            <Link href={row.nextActionHref}>
              <span className="flex items-center justify-center gap-1.5">
                {row.nextActionLabel}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </span>
            </Link>
          </Button>
        </div>
      </CardContent>

      <PriorityDialog
        open={priorityOpen}
        onOpenChange={setPriorityOpen}
        currentPriority={row.journeyPriority}
        onSelect={handlePriorityChoice}
      />
      <LabelDialog
        open={labelOpen}
        onOpenChange={setLabelOpen}
        draft={labelDraft}
        onDraftChange={setLabelDraft}
        onSave={handleSaveLabel}
      />
    </Card>
  );
}

function ProgressDots({
  currentStep,
  percentComplete,
  stepLabel,
}: {
  currentStep: number;
  percentComplete: number;
  stepLabel: string;
}) {
  const dots = Array.from({ length: JOURNEY_TOTAL_STEPS }, (_, i) => i + 1);
  const aria = journeyStepAriaLabel(currentStep, percentComplete);
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1.5"
        role="img"
        aria-label={aria}
      >
        {dots.map((i) => {
          const filled = i <= currentStep;
          return (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                filled ? "bg-primary" : "bg-muted",
              )}
            />
          );
        })}
      </div>
      {stepLabel ? (
        <span className="text-xs text-muted-foreground">{stepLabel}</span>
      ) : null}
    </div>
  );
}

function OverflowMenu({
  view,
  onArchive,
  onRestore,
  onOpenPriority,
  onOpenLabel,
  detailsHref,
}: {
  view: JourneyViewKind;
  onArchive: () => void;
  onRestore: () => void;
  onOpenPriority: () => void;
  onOpenLabel: () => void;
  detailsHref: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  const handleItem = (fn: () => void) => (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-haspopup="menu"
          aria-label="Journey actions"
          data-journey-priority-trigger="true"
          className="shrink-0 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={menuId}>Journey actions</DialogTitle>
        </DialogHeader>
        <div
          role="menu"
          aria-labelledby={menuId}
          className="flex flex-col gap-1"
        >
          <Link
            href={detailsHref}
            role="menuitem"
            className="flex w-full items-center justify-between rounded-4xl px-3 py-2 text-sm hover:bg-muted"
          >
            View details
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={handleItem(onOpenPriority)}
            className="flex w-full items-center justify-between rounded-4xl px-3 py-2 text-left text-sm hover:bg-muted"
          >
            Set priority
            <HugeiconsIcon icon={StarIcon} className="size-4" />
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={handleItem(onOpenLabel)}
            className="flex w-full items-center justify-between rounded-4xl px-3 py-2 text-left text-sm hover:bg-muted"
          >
            Edit label
            <HugeiconsIcon icon={Edit01Icon} className="size-4" />
          </button>
          {view === "active" ? (
            <button
              role="menuitem"
              type="button"
              onClick={handleItem(onArchive)}
              className="flex w-full items-center justify-between rounded-4xl px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              Archive this deal
              <HugeiconsIcon icon={Archive01Icon} className="size-4" />
            </button>
          ) : (
            <button
              role="menuitem"
              type="button"
              onClick={handleItem(onRestore)}
              className="flex w-full items-center justify-between rounded-4xl px-3 py-2 text-left text-sm hover:bg-muted"
            >
              Restore
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PriorityDialog({
  open,
  onOpenChange,
  currentPriority,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  currentPriority: "high" | "normal" | "low";
  onSelect: (next: "high" | "normal" | "low") => void;
}) {
  const priorities: Array<{
    value: "high" | "normal" | "low";
    label: string;
    description: string;
  }> = [
    {
      value: "high",
      label: "High priority",
      description: "Star + gold accent on the card.",
    },
    {
      value: "normal",
      label: "Normal",
      description: "Default — no visual treatment.",
    },
    {
      value: "low",
      label: "Low priority",
      description: "Still visible but ranked lower.",
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set priority</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {priorities.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onSelect(p.value)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-4xl border border-border px-3 py-2 text-left text-sm transition-colors",
                p.value === currentPriority
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted",
              )}
            >
              <span className="font-medium text-foreground">{p.label}</span>
              <span className="text-xs text-muted-foreground">
                {p.description}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LabelDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  draft: string;
  onDraftChange: (next: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit label</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            maxLength={MAX_LABEL_LEN}
            placeholder="e.g. Dream home, Stretch budget"
          />
          <p className="text-xs text-muted-foreground">
            Up to {MAX_LABEL_LEN} characters. Leave blank to remove the label.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
