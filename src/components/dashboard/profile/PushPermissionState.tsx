"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";

import type { PushPermissionState as PushPermissionStateValue } from "@/components/dashboard/profile/notificationPreferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PushPermissionStateProps = {
  state: PushPermissionStateValue;
  compact?: boolean;
};

export function PushPermissionState({
  state,
  compact = false,
}: PushPermissionStateProps) {
  return (
    <div
      className={
        compact
          ? "flex min-h-11 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground"
          : "flex flex-col gap-3 rounded-3xl border border-dashed border-border/70 bg-muted/30 p-4"
      }
    >
      <div
        className={
          compact
            ? "flex items-center gap-2"
            : "flex flex-wrap items-center gap-2"
        }
      >
        <Badge variant="outline" className="rounded-full">
          {state.label}
        </Badge>
        {compact ? null : (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="size-3.5"
              strokeWidth={2}
            />
            Web is read-only for push delivery.
          </span>
        )}
      </div>

      {compact ? null : (
        <p className="text-sm text-muted-foreground">{state.description}</p>
      )}

      {compact || state.kind !== "denied" || !state.ctaHref ? null : (
        <div>
          <Button asChild type="button" size="sm" variant="outline">
            <a href={state.ctaHref}>
              {state.ctaLabel ?? "Open Settings"}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-4"
                strokeWidth={2}
              />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
