"use client";

import { useEffect, useRef, useState } from "react";
import type { BuyerStory } from "@/lib/trustProof/types";
import { track } from "@/lib/analytics";

interface AggregateSavingsCounterProps {
  stories: readonly BuyerStory[];
  className?: string;
}

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const ANIMATION_MS = 1200;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AggregateSavingsCounter({
  stories,
  className,
}: AggregateSavingsCounterProps) {
  const totalSavedUsd = stories.reduce(
    (acc, s) => acc + s.outcomes.totalSavedUsd,
    0,
  );
  const storyCount = stories.length;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasFiredRef = useRef(false);
  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    if (storyCount === 0) return;
    const node = rootRef.current;
    if (!node) return;

    const startAnimation = () => {
      if (prefersReducedMotion()) {
        setDisplayValue(totalSavedUsd);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / ANIMATION_MS);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayValue(Math.round(totalSavedUsd * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") {
      if (!hasFiredRef.current) {
        hasFiredRef.current = true;
        track("aggregate_savings_counter_viewed", {
          totalSavedUsd,
          storyCount,
        });
        startAnimation();
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasFiredRef.current) {
            hasFiredRef.current = true;
            track("aggregate_savings_counter_viewed", {
              totalSavedUsd,
              storyCount,
            });
            startAnimation();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [totalSavedUsd, storyCount]);

  if (storyCount === 0) return null;

  return (
    <div
      ref={rootRef}
      className={
        "flex flex-col items-center text-center" + (className ? ` ${className}` : "")
      }
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
        Total buyer savings
      </p>
      <p className="mt-2 text-4xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-5xl">
        Buyers have saved{" "}
        <span className="text-primary-700">
          {USD_FORMATTER.format(displayValue)}
        </span>{" "}
        total
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        Across {storyCount} verified buyer{storyCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}
