"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  InformationCircleIcon,
  LockIcon,
  Message01Icon,
} from "@hugeicons/core-free-icons";

import {
  CATEGORY_META,
  CHANNEL_META,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferenceView,
} from "@/components/dashboard/profile/notificationPreferences";
import { PushPermissionState } from "@/components/dashboard/profile/PushPermissionState";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type PreferenceMatrixProps = {
  value: NotificationPreferenceView;
  disabled?: boolean;
  onToggle: (
    category: NotificationCategory,
    channel: NotificationChannel,
    nextValue: boolean,
  ) => void;
};

const MOBILE_DEFAULT_CHANNELS: Record<NotificationCategory, NotificationChannel> =
  {
    transactional: "email",
    tours: "email",
    offers: "email",
    closing: "email",
    disclosures: "email",
    market_updates: "email",
    marketing: "email",
    safety: "email",
  };

export function PreferenceMatrix({
  value,
  disabled = false,
  onToggle,
}: PreferenceMatrixProps) {
  const [mobileChannel, setMobileChannel] = useState(MOBILE_DEFAULT_CHANNELS);

  return (
    <div className="flex flex-col gap-5">
      {value.smsGloballySuppressed ? (
        <div className="rounded-3xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          SMS is currently stopped for this phone number. Reply{" "}
          <span className="font-semibold">START</span> to re-consent, then come
          back here to fine-tune per-category SMS.
        </div>
      ) : null}

      <div
        className="hidden overflow-hidden rounded-4xl border border-border/70 md:block"
        data-testid="notification-matrix-desktop"
      >
        <div className="grid grid-cols-[minmax(18rem,1.4fr)_repeat(4,minmax(6.5rem,1fr))] border-b border-border/70 bg-muted/35">
          <div className="px-5 py-4">
            <p className="text-sm font-semibold text-foreground">
              Notification type
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Settings apply to future deliveries only. Already-sent messages
              stay in your record.
            </p>
          </div>
          {CHANNEL_META.map((channel) => (
            <div
              key={channel.key}
              className="flex flex-col items-center justify-center gap-1 border-l border-border/60 px-4 py-4 text-center"
            >
              <p className="text-sm font-semibold text-foreground">
                {channel.label}
              </p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {channel.description}
              </p>
            </div>
          ))}
        </div>

        <div className="divide-y divide-border/70">
          {CATEGORY_META.map((category) => (
            <div
              key={category.key}
              className={cn(
                "grid grid-cols-[minmax(18rem,1.4fr)_repeat(4,minmax(6.5rem,1fr))]",
                category.tone === "safety" && "bg-primary/[0.04]",
              )}
            >
              <div className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {category.label}
                  </p>
                  <Badge
                    variant={
                      category.tone === "optional" ? "outline" : "secondary"
                    }
                  >
                    {category.tone === "optional"
                      ? "Optional"
                      : category.tone === "safety"
                        ? "Locked"
                        : "Required by default"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {category.description}
                </p>
                <div
                  className={cn(
                    "mt-2 text-xs leading-5 text-muted-foreground",
                    category.tone === "safety" &&
                      "inline-flex items-start gap-2 rounded-2xl border border-primary/15 bg-background/80 px-3 py-2 text-foreground",
                  )}
                >
                  {category.tone === "safety" ? (
                    <HugeiconsIcon
                      icon={LockIcon}
                      className="mt-0.5 size-3.5 shrink-0 text-primary"
                      strokeWidth={2}
                    />
                  ) : null}
                  <span>{category.helper}</span>
                </div>
              </div>

              {CHANNEL_META.map((channel) => (
                <DesktopCell
                  key={`${category.key}-${channel.key}`}
                  category={category.key}
                  channel={channel.key}
                  value={value}
                  disabled={disabled}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:hidden" data-testid="notification-matrix-mobile">
        {CATEGORY_META.map((category) => {
          const activeChannel = mobileChannel[category.key];
          const activeMeta =
            CHANNEL_META.find((channel) => channel.key === activeChannel) ??
            CHANNEL_META[0];

          return (
            <div
              key={category.key}
              className={cn(
                "rounded-4xl border border-border/70 bg-card p-4 shadow-sm ring-1 ring-foreground/5",
                category.tone === "safety" && "border-primary/20 bg-primary/[0.04]",
              )}
            >
              <div className="flex flex-col gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {category.label}
                    </p>
                    <Badge
                      variant={
                        category.tone === "optional" ? "outline" : "secondary"
                      }
                    >
                      {category.tone === "optional"
                        ? "Optional"
                        : category.tone === "safety"
                          ? "Locked"
                          : "Required"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {category.description}
                  </p>
                  <div
                    className={cn(
                      "text-xs leading-5 text-muted-foreground",
                      category.tone === "safety" &&
                        "rounded-2xl border border-primary/15 bg-background/80 px-3 py-2 text-foreground",
                    )}
                  >
                    {category.tone === "safety" ? (
                      <span className="inline-flex items-start gap-2">
                        <HugeiconsIcon
                          icon={LockIcon}
                          className="mt-0.5 size-3.5 shrink-0 text-primary"
                          strokeWidth={2}
                        />
                        {category.helper}
                      </span>
                    ) : (
                      category.helper
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {CHANNEL_META.map((channel) => {
                    const isActive = activeChannel === channel.key;
                    return (
                      <button
                        key={`${category.key}-${channel.key}-tab`}
                        type="button"
                        className={cn(
                          "rounded-2xl px-3 py-2 text-xs font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                        onClick={() =>
                          setMobileChannel((prev) => ({
                            ...prev,
                            [category.key]: channel.key,
                          }))
                        }
                      >
                        {channel.shortLabel}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-3xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {activeMeta.label}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {activeMeta.description}
                      </p>
                    </div>
                    <MobileCell
                      category={category.key}
                      channel={activeChannel}
                      value={value}
                      disabled={disabled}
                      onToggle={onToggle}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-border/70 bg-muted/25 p-4">
        <div className="flex items-start gap-3">
          <HugeiconsIcon
            icon={Message01Icon}
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            strokeWidth={2}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              SMS quiet-hours + STOP work together
            </p>
            <p className="text-sm text-muted-foreground">
              You can also text STOP to any message to stop all SMS. STOP is a
              global SMS opt-out, not a per-category toggle.
            </p>
            <a
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
              href="https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out"
              rel="noreferrer"
              target="_blank"
            >
              Twilio STOP keyword docs
            </a>
          </div>
        </div>
      </div>

      <div className="inline-flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <HugeiconsIcon
          icon={InformationCircleIcon}
          className="mt-0.5 size-3.5 shrink-0"
          strokeWidth={2}
        />
        Push and SMS quiet hours hold future deliveries until the window ends.
        Email, in-app, and safety alerts still deliver.
      </div>
    </div>
  );
}

function DesktopCell({
  category,
  channel,
  value,
  disabled,
  onToggle,
}: {
  category: NotificationCategory;
  channel: NotificationChannel;
  value: NotificationPreferenceView;
  disabled: boolean;
  onToggle: PreferenceMatrixProps["onToggle"];
}) {
  return (
    <div className="flex items-center justify-center border-l border-border/60 px-4 py-4">
      <CellControl
        category={category}
        channel={channel}
        value={value}
        disabled={disabled}
        onToggle={onToggle}
        compact
      />
    </div>
  );
}

function MobileCell({
  category,
  channel,
  value,
  disabled,
  onToggle,
}: {
  category: NotificationCategory;
  channel: NotificationChannel;
  value: NotificationPreferenceView;
  disabled: boolean;
  onToggle: PreferenceMatrixProps["onToggle"];
}) {
  return (
    <CellControl
      category={category}
      channel={channel}
      value={value}
      disabled={disabled}
      onToggle={onToggle}
    />
  );
}

function CellControl({
  category,
  channel,
  value,
  disabled,
  onToggle,
  compact = false,
}: {
  category: NotificationCategory;
  channel: NotificationChannel;
  value: NotificationPreferenceView;
  disabled: boolean;
  onToggle: PreferenceMatrixProps["onToggle"];
  compact?: boolean;
}) {
  if (channel === "push") {
    return (
      <PushPermissionState
        state={value.pushPermissionState}
        compact={compact}
      />
    );
  }

  const locked = category === "safety";
  const smsStopped = channel === "sms" && value.smsGloballySuppressed;
  const checked = locked ? true : value.deliveryMatrix[category][channel];
  const cellDisabled = disabled || locked || smsStopped;

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        compact ? "justify-center" : "justify-end",
      )}
    >
      {!compact && smsStopped ? (
        <Badge variant="outline" className="rounded-full">
          STOP active
        </Badge>
      ) : null}
      {!compact && locked ? (
        <Badge variant="secondary" className="rounded-full">
          Locked
        </Badge>
      ) : null}
      <Switch
        aria-label={`${category} ${channel}`}
        checked={checked}
        disabled={cellDisabled}
        onCheckedChange={(nextValue) => onToggle(category, channel, nextValue)}
      />
    </div>
  );
}
