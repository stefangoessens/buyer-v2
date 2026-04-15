"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MARKETING_AVAILABILITY } from "@/content/marketing-availability";
import { track } from "@/lib/analytics";
import { NonFloridaWaitlistDialog } from "./NonFloridaWaitlistDialog";

const DISMISSED_KEY = "buyer_v2_fl_strip_dismissed_v1";

interface FloridaAvailabilityStripProps {
  /**
   * Optional rollout override. Defaults to `true` so the strip renders
   * immediately on every marketing route. Rollout flag wiring is a
   * followup — plumb the Convex settings read through the layout when
   * the settings provider is hydrated client-side.
   */
  enabled?: boolean;
}

export function FloridaAvailabilityStrip({
  enabled = true,
}: FloridaAvailabilityStripProps = {}) {
  const pathname = usePathname() ?? "/";
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const viewedFiredRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (
      typeof window !== "undefined" &&
      window.localStorage.getItem(DISMISSED_KEY) === "1"
    ) {
      setDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !mounted || dismissed || viewedFiredRef.current) return;
    const node = stripRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      viewedFiredRef.current = true;
      track("fl_strip_viewed", { route: pathname });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !viewedFiredRef.current
        ) {
          viewedFiredRef.current = true;
          track("fl_strip_viewed", { route: pathname });
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, mounted, dismissed, pathname]);

  if (!enabled) return null;

  const handleOpenDialog = () => {
    track("fl_strip_cta_clicked", { route: pathname });
    track("waitlist_dialog_opened", { source: "strip", route: pathname });
    setDialogOpen(true);
  };

  const handleDismiss = () => {
    track("fl_strip_dismissed", { route: pathname });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    }
    setDismissed(true);
  };

  const handleSubmitSuccess = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    }
    // Auto-dismiss the strip once the buyer is on the list. The
    // success panel renders via the dialog, which stays mounted
    // below even after `dismissed` flips.
    setDismissed(true);
  };

  return (
    <>
      {dismissed ? null : (
        <div
          ref={stripRef}
          data-testid="fl-availability-strip"
          className="relative w-full bg-neutral-900 text-white"
        >
          <div className="mx-auto flex max-w-[1248px] items-center gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
            <p className="flex-1 leading-snug sm:text-center">
              <span className="text-white/85">
                {MARKETING_AVAILABILITY.strip.copy}
              </span>{" "}
              <button
                type="button"
                onClick={handleOpenDialog}
                className="font-semibold text-white underline-offset-4 transition hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {MARKETING_AVAILABILITY.strip.ctaLabel}
              </button>
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss availability notice"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="size-4"
                aria-hidden="true"
              >
                <path d="M6 6L18 18M6 18L18 6" />
              </svg>
            </button>
          </div>
        </div>
      )}
      <NonFloridaWaitlistDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        route={pathname}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </>
  );
}
