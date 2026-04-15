"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";

import type { NotificationQuietHours } from "@/components/dashboard/profile/notificationPreferences";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type QuietHoursPickerProps = {
  value: NotificationQuietHours;
  disabled?: boolean;
  error?: string | null;
  onChange: (patch: Partial<NotificationQuietHours>) => void;
  onCommit?: () => void;
};

const COMMON_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export function QuietHoursPicker({
  value,
  disabled = false,
  error,
  onChange,
  onCommit,
}: QuietHoursPickerProps) {
  const timeZones = Array.from(
    new Set([...COMMON_TIME_ZONES, value.timeZone]),
  ).sort();

  return (
    <div className="rounded-4xl border border-border/70 bg-muted/20 p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2">
              <HugeiconsIcon
                icon={Clock01Icon}
                className="size-4 text-primary"
                strokeWidth={2}
              />
              <p className="text-sm font-semibold text-foreground">
                Quiet hours
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Push and SMS are held until quiet hours end. Email, in-app, and
              safety alerts still deliver.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">SMS held</Badge>
              <Badge variant="secondary">Push held</Badge>
              <Badge variant="outline">Safety bypasses quiet hours</Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-background/80 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Enabled</p>
              <p className="text-xs text-muted-foreground">
                Hold overnight nudges.
              </p>
            </div>
            <Switch
              checked={value.enabled}
              disabled={disabled}
              onCheckedChange={(checked) => {
                onChange({ enabled: checked });
                onCommit?.();
              }}
              aria-label="Enable quiet hours"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,1.2fr)]">
          <div className="space-y-2">
            <Label htmlFor="quiet-hours-start">Start time</Label>
            <Input
              id="quiet-hours-start"
              type="time"
              value={value.start}
              disabled={disabled || !value.enabled}
              onChange={(event) => onChange({ start: event.target.value })}
              onBlur={() => onCommit?.()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quiet-hours-end">End time</Label>
            <Input
              id="quiet-hours-end"
              type="time"
              value={value.end}
              disabled={disabled || !value.enabled}
              onChange={(event) => onChange({ end: event.target.value })}
              onBlur={() => onCommit?.()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quiet-hours-time-zone">Timezone</Label>
            <Select
              value={value.timeZone}
              disabled={disabled || !value.enabled}
              onValueChange={(nextValue) => {
                onChange({ timeZone: nextValue });
                onCommit?.();
              }}
            >
              <SelectTrigger id="quiet-hours-time-zone" className="w-full">
                <SelectValue placeholder="Select a timezone" />
              </SelectTrigger>
              <SelectContent>
                {timeZones.map((timeZone) => (
                  <SelectItem key={timeZone} value={timeZone}>
                    {timeZone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Overnight windows are supported.</span>
          <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
          <span>Example: 9:00 PM to 8:00 AM.</span>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
