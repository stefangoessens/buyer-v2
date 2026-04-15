"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../../../convex/_generated/api";
import { PreferenceMatrix } from "@/components/dashboard/profile/PreferenceMatrix";
import { QuietHoursPicker } from "@/components/dashboard/profile/QuietHoursPicker";
import {
  clonePreferenceView,
  diffNotificationPreferences,
  normalizeNotificationPreferences,
  serializeMutationPayload,
  setMatrixCell,
  setQuietHours,
  validateQuietHours,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationPreferenceView,
} from "@/components/dashboard/profile/notificationPreferences";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { track } from "@/lib/analytics";

type SaveState =
  | { kind: "idle"; message: string }
  | { kind: "saving"; message: string }
  | { kind: "saved"; message: string }
  | { kind: "error"; message: string };

function hasStatePayload(
  value: unknown,
): value is Record<string, unknown> & {
  deliveryMatrix?: unknown;
  channels?: unknown;
  categories?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    ("deliveryMatrix" in value || "channels" in value || "categories" in value)
  );
}

function toAnalyticsChannel(channel: NotificationChannel) {
  return channel === "inApp" ? "in_app" : channel;
}

function isSamePreferenceView(
  left: NotificationPreferenceView,
  right: NotificationPreferenceView,
) {
  return JSON.stringify(serializeMutationPayload(left)) ===
    JSON.stringify(serializeMutationPayload(right)) &&
    left.smsGloballySuppressed === right.smsGloballySuppressed
    ? true
    : false;
}

export function ProfileContactPreferencesSection() {
  const preferenceQuery = useQuery(api.messagePreferences.getForCurrentUser, {});
  const rawMutation = useMutation(
    api.messagePreferences.upsertForCurrentUser,
  ) as unknown as (args: unknown) => Promise<unknown>;

  const [preferences, setPreferences] = useState<NotificationPreferenceView>(
    () => normalizeNotificationPreferences(null),
  );
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    message: "Changes save automatically.",
  });
  const [quietHoursError, setQuietHoursError] = useState<string | null>(null);

  const initializedRef = useRef(false);
  const committedRef = useRef<NotificationPreferenceView>(
    normalizeNotificationPreferences(null),
  );
  const pendingRef = useRef<NotificationPreferenceView | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (preferenceQuery === undefined) {
      return;
    }

    const normalized = normalizeNotificationPreferences(preferenceQuery);

    if (!initializedRef.current) {
      initializedRef.current = true;
      committedRef.current = normalized;
      setPreferences(normalized);
      return;
    }

    if (!savingRef.current && pendingRef.current === null) {
      committedRef.current = normalized;
      setPreferences(normalized);
    }
  }, [preferenceQuery]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.hash === "#notifications") {
      document
        .getElementById("notifications")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    const search = new URLSearchParams(window.location.search);
    const source =
      search.get("source") ?? search.get("notification_source") ?? "";

    if (source === "email_footer") {
      track("notification_manage_link_clicked", { source: "email_footer" });
    }
  }, []);

  async function flushPending() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (savingRef.current || pendingRef.current === null) {
      return;
    }

    const validationMessage = validateQuietHours(pendingRef.current.quietHours);
    setQuietHoursError(validationMessage);

    if (validationMessage) {
      setSaveState({ kind: "error", message: validationMessage });
      return;
    }

    const nextSnapshot = clonePreferenceView(pendingRef.current);
    pendingRef.current = null;
    const previousCommitted = committedRef.current;

    savingRef.current = true;
    setSaveState({ kind: "saving", message: "Saving changes…" });

    try {
      const response = await rawMutation(serializeMutationPayload(nextSnapshot));
      const confirmed = hasStatePayload(response)
        ? normalizeNotificationPreferences(response)
        : nextSnapshot;

      committedRef.current = confirmed;
      setPreferences(confirmed);
      setSaveState({ kind: "saved", message: "Saved just now." });

      const changes = diffNotificationPreferences(previousCommitted, confirmed);
      for (const change of changes) {
        track("notification_preference_changed", {
          category: change.category,
          channel: toAnalyticsChannel(change.channel),
          direction: change.direction,
          source: "preference_center",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not save notification preferences.";
      pendingRef.current = null;
      committedRef.current = previousCommitted;
      setPreferences(previousCommitted);
      setSaveState({ kind: "error", message });
      toast.error(message);
    } finally {
      savingRef.current = false;
      if (pendingRef.current && quietHoursError === null) {
        void flushPending();
      }
    }
  }

  function scheduleSave(
    nextValue: NotificationPreferenceView,
    delayMs: number,
  ) {
    const validationMessage = validateQuietHours(nextValue.quietHours);
    setQuietHoursError(validationMessage);

    pendingRef.current = nextValue;
    setPreferences(nextValue);

    if (isSamePreferenceView(nextValue, committedRef.current)) {
      pendingRef.current = null;
      setSaveState({ kind: "idle", message: "Changes save automatically." });
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    setSaveState({
      kind: validationMessage ? "error" : "saving",
      message: validationMessage ?? "Saving changes…",
    });

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      void flushPending();
    }, delayMs);
  }

  function handleToggle(
    category: NotificationCategory,
    channel: NotificationChannel,
    nextValue: boolean,
  ) {
    const nextPreferences = setMatrixCell(
      preferences,
      category,
      channel,
      nextValue,
    );
    scheduleSave(nextPreferences, 160);
  }

  function handleQuietHoursChange(
    patch: Partial<NotificationPreferenceView["quietHours"]>,
  ) {
    const nextPreferences = setQuietHours(preferences, patch);
    scheduleSave(nextPreferences, 700);
  }

  function handleQuietHoursCommit() {
    void flushPending();
  }

  return (
    <Card id="notifications" className="scroll-mt-28">
      <CardHeader>
        <div>
          <CardTitle>Notifications</CardTitle>
          <CardDescription className="mt-1">
            Choose how Buyer V2 reaches you across active deals, tours, and
            closing. Safety alerts stay locked on.
          </CardDescription>
        </div>
        <CardAction>
          <div
            className="rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"
            aria-live="polite"
          >
            {saveState.message}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <PreferenceMatrix
          value={preferences}
          disabled={preferenceQuery === undefined}
          onToggle={handleToggle}
        />

        <QuietHoursPicker
          value={preferences.quietHours}
          disabled={preferenceQuery === undefined}
          error={quietHoursError}
          onChange={handleQuietHoursChange}
          onCommit={handleQuietHoursCommit}
        />
      </CardContent>
    </Card>
  );
}
