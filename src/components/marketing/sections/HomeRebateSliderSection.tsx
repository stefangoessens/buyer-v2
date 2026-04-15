"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ASPIRATION_BANDS,
  DISCLAIMER,
  FALLBACK_PRICE_POINTS,
  LICENSE_SUFFIX,
  LOW_COMMISSION_NOTE,
  MATH_TRANSPARENCY_LABELS,
  PRIMARY_CTA,
  SECTION_EYEBROW,
  SECTION_ID,
  SECTION_INTRO,
  formatHeadline,
} from "@/content/home-rebate-slider";
import {
  SLIDER_DEFAULT_PRICE,
  SLIDER_MAX_PRICE,
  SLIDER_MIN_PRICE,
  SLIDER_SNAP_POINTS,
  clampPrice,
  formatCurrency,
  illustrateRebate,
  nearestSnapPoint,
  type RebateBand,
} from "@/lib/pricing/rebateIllustration";
import { track } from "@/lib/analytics";

export interface HomeRebateSliderSectionProps {
  /** Initial slider value, used for SSR. Defaults to SLIDER_DEFAULT_PRICE. */
  initialPrice?: number;
  /** When false, renders the fallback table instead of the interactive slider. */
  enabled?: boolean;
  /** True when the initial render came from a ?price= query param. */
  deepLink?: boolean;
}

const HEADING_ID = "home-rebate-slider-heading";
const DISCLOSURE_ID = "home-rebate-slider-disclosure";
const SNAP_MAGNET_DOLLARS = 75_000;
const ARROW_STEP = 10_000;
const SHIFT_STEP = 100_000;
const COUNTER_TWEEN_MS = 300;
const CHANGE_DEBOUNCE_MS = 250;
const URL_THROTTLE_MS = 500;

function pctOf(price: number): number {
  return ((price - SLIDER_MIN_PRICE) / (SLIDER_MAX_PRICE - SLIDER_MIN_PRICE)) * 100;
}

function isExactSnapPoint(price: number): boolean {
  return SLIDER_SNAP_POINTS.includes(price);
}

function SectionShell({
  children,
  headingId,
}: {
  children: React.ReactNode;
  headingId: string;
}) {
  return (
    <section
      id={SECTION_ID}
      aria-labelledby={headingId}
      className="scroll-mt-[84px] w-full bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1248px] px-6 lg:px-8">{children}</div>
    </section>
  );
}

function Header({ headingString }: { headingString: string }) {
  return (
    <header className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
        {SECTION_EYEBROW}
      </p>
      <h2
        id={HEADING_ID}
        className="mt-3 text-balance text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]"
      >
        {headingString}
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-neutral-500 md:text-lg">
        {SECTION_INTRO}
      </p>
    </header>
  );
}

function DisclosureFooter({
  isClamped,
  onCtaClick,
  disclosureRef,
}: {
  isClamped: boolean;
  onCtaClick: () => void;
  disclosureRef: React.RefObject<HTMLParagraphElement | null>;
}) {
  return (
    <div className="mx-auto mt-14 max-w-3xl text-center">
      <p
        ref={disclosureRef}
        id={DISCLOSURE_ID}
        className="text-xs italic leading-relaxed text-neutral-400"
      >
        {DISCLAIMER}
      </p>
      <p className="mt-3 text-xs text-neutral-400">
        Licensed Florida real estate brokerage &middot; {LICENSE_SUFFIX}
      </p>
      {isClamped ? (
        <p className="mt-3 text-xs italic text-neutral-500">
          {LOW_COMMISSION_NOTE}
        </p>
      ) : null}
      <div className="mt-8 flex justify-center">
        <Link
          href={PRIMARY_CTA.href}
          onClick={onCtaClick}
          className="inline-flex items-center gap-2 rounded-full bg-primary-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          {PRIMARY_CTA.label}
          <span aria-hidden="true">{"\u2192"}</span>
        </Link>
      </div>
    </div>
  );
}

/* ─── Fallback (flag off) ────────────────────────────────────────────── */

function FallbackTable() {
  const firedRef = useRef(false);
  const disclosureRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("home_rebate_slider_fallback_shown", { reason: "flag_off" });
  }, []);

  const handleCtaClick = useCallback(() => {
    track("home_rebate_cta_clicked", {});
  }, []);

  const defaultIllustration = illustrateRebate(SLIDER_DEFAULT_PRICE);
  const headingString = formatHeadline(
    formatCurrency(SLIDER_DEFAULT_PRICE),
    formatCurrency(defaultIllustration.rebate),
  );
  const anyClamped = FALLBACK_PRICE_POINTS.some(
    (p) => illustrateRebate(p).isClamped,
  );

  return (
    <SectionShell headingId={HEADING_ID}>
      <Header headingString={headingString} />

      <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-[24px] border border-neutral-200/80 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Illustrative rebate by home price: 3% buyer-side commission minus
            buyer-v2&apos;s 1% flat fee.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-neutral-200 bg-white px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500"
              >
                Home price
              </th>
              <th
                scope="col"
                className="border-b border-neutral-200 bg-white px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500"
              >
                3% buyer-side commission
              </th>
              <th
                scope="col"
                className="border-b border-neutral-200 bg-white px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500"
              >
                buyer-v2 1% fee
              </th>
              <th
                scope="col"
                className="border-b border-neutral-200 bg-primary-50 px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-700"
              >
                Estimated rebate
              </th>
            </tr>
          </thead>
          <tbody>
            {FALLBACK_PRICE_POINTS.map((price) => {
              const illo = illustrateRebate(price);
              return (
                <tr key={price}>
                  <th
                    scope="row"
                    className="border-t border-neutral-100 bg-white px-6 py-4 text-left align-middle text-base font-medium tabular-nums text-neutral-700"
                  >
                    {formatCurrency(price)}
                  </th>
                  <td className="border-t border-neutral-100 bg-white px-6 py-4 align-middle text-base tabular-nums text-neutral-600">
                    {formatCurrency(illo.buyerSideCommission)}
                  </td>
                  <td className="border-t border-neutral-100 bg-white px-6 py-4 align-middle text-base tabular-nums text-neutral-600">
                    {formatCurrency(illo.buyerV2Fee)}
                  </td>
                  <td className="border-t border-neutral-100 bg-primary-50 px-6 py-4 align-middle text-base font-semibold tabular-nums text-primary-700">
                    {formatCurrency(illo.rebate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DisclosureFooter
        isClamped={anyClamped}
        onCtaClick={handleCtaClick}
        disclosureRef={disclosureRef}
      />
    </SectionShell>
  );
}

/* ─── Interactive slider ─────────────────────────────────────────────── */

function InteractiveSlider({
  initialPrice,
  deepLink,
}: {
  initialPrice: number;
  deepLink: boolean;
}) {
  const [price, setPrice] = useState<number>(initialPrice);
  const [displayedRebate, setDisplayedRebate] = useState<number>(
    () => illustrateRebate(initialPrice).rebate,
  );
  const [isDragging, setIsDragging] = useState(false);

  const sectionRef = useRef<HTMLElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const disclosureRef = useRef<HTMLParagraphElement | null>(null);

  // Analytics guards
  const viewedRef = useRef(false);
  const disclosureViewedRef = useRef(false);
  const deepLinkFiredRef = useRef(false);
  const interactionDepthFiredRef = useRef(false);
  const lastBandRef = useRef<RebateBand | null>(null);

  // Interaction tracking
  const initialPriceRef = useRef(initialPrice);
  const maxDragDistanceRef = useRef(0);
  // False until the user actually moves the slider via pointer or
  // keyboard. Guards the debounced slider_changed + calculator_used
  // fires so passive page views never emit interaction analytics.
  const hasUserInteractedRef = useRef(false);

  // Animation state
  const tweenFromRef = useRef<number>(illustrateRebate(initialPrice).rebate);
  const tweenTargetRef = useRef<number>(illustrateRebate(initialPrice).rebate);
  const tweenStartRef = useRef<number>(0);
  const tweenRafRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  // Debounce/throttle refs
  const changeDebounceRef = useRef<number | null>(null);
  const urlThrottleRef = useRef<number>(0);
  const urlPendingRef = useRef<number | null>(null);
  const urlTimeoutRef = useRef<number | null>(null);

  const illustration = useMemo(() => illustrateRebate(price), [price]);

  // ── Initial analytics: deep link landed
  useEffect(() => {
    if (deepLink && !deepLinkFiredRef.current) {
      deepLinkFiredRef.current = true;
      track("home_rebate_slider_deep_link_landed", { price: initialPriceRef.current });
    }
    // We only want this on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reduced motion listener
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const listener = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  // ── IntersectionObserver: section viewed + disclosure viewed
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      if (!viewedRef.current) {
        viewedRef.current = true;
        track("home_rebate_slider_viewed", {});
      }
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.4 &&
            !viewedRef.current
          ) {
            viewedRef.current = true;
            track("home_rebate_slider_viewed", {});
            observer.unobserve(el);
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = disclosureRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      if (!disclosureViewedRef.current) {
        disclosureViewedRef.current = true;
        track("home_rebate_disclosure_viewed", {});
      }
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.4 &&
            !disclosureViewedRef.current
          ) {
            disclosureViewedRef.current = true;
            track("home_rebate_disclosure_viewed", {});
            observer.unobserve(el);
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Rebate counter RAF tween
  useEffect(() => {
    const nextRebate = illustration.rebate;
    if (tweenTargetRef.current === nextRebate) return;

    if (reducedMotionRef.current) {
      tweenFromRef.current = nextRebate;
      tweenTargetRef.current = nextRebate;
      setDisplayedRebate(nextRebate);
      return;
    }

    tweenFromRef.current = displayedRebate;
    tweenTargetRef.current = nextRebate;
    tweenStartRef.current = performance.now();

    if (tweenRafRef.current !== null) {
      cancelAnimationFrame(tweenRafRef.current);
    }

    const step = (now: number) => {
      const elapsed = now - tweenStartRef.current;
      const t = Math.min(1, elapsed / COUNTER_TWEEN_MS);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      const value =
        tweenFromRef.current +
        (tweenTargetRef.current - tweenFromRef.current) * eased;
      setDisplayedRebate(value);
      if (t < 1) {
        tweenRafRef.current = requestAnimationFrame(step);
      } else {
        tweenRafRef.current = null;
        setDisplayedRebate(tweenTargetRef.current);
      }
    };
    tweenRafRef.current = requestAnimationFrame(step);

    return () => {
      if (tweenRafRef.current !== null) {
        cancelAnimationFrame(tweenRafRef.current);
        tweenRafRef.current = null;
      }
    };
    // We intentionally exclude displayedRebate to avoid restarting the tween every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [illustration.rebate]);

  // ── Aspiration band change
  useEffect(() => {
    if (lastBandRef.current !== illustration.rebateBand) {
      lastBandRef.current = illustration.rebateBand;
      track("home_rebate_aspiration_viewed", {
        rebateBand: illustration.rebateBand,
      });
    }
  }, [illustration.rebateBand]);

  // ── Debounced change + calculator_used
  useEffect(() => {
    // Don't fire interaction analytics on mount or from SSR-seeded
    // state. Only debounce-fire once the user has touched the slider.
    if (!hasUserInteractedRef.current) return;
    if (changeDebounceRef.current !== null) {
      clearTimeout(changeDebounceRef.current);
    }
    const currentPrice = price;
    const currentIllo = illustration;
    changeDebounceRef.current = window.setTimeout(() => {
      track("home_rebate_slider_changed", {
        price: currentPrice,
        rebate: currentIllo.rebate,
        rebateBand: currentIllo.rebateBand,
      });
      track("calculator_used", { calculator: "home_rebate_slider" });
    }, CHANGE_DEBOUNCE_MS);
    return () => {
      if (changeDebounceRef.current !== null) {
        clearTimeout(changeDebounceRef.current);
      }
    };
  }, [price, illustration]);

  // ── Max drag distance
  useEffect(() => {
    const distance = Math.abs(price - initialPriceRef.current);
    if (distance > maxDragDistanceRef.current) {
      maxDragDistanceRef.current = distance;
    }
  }, [price]);

  // ── URL state (throttled replaceState)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const writeUrl = (target: number) => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("price") === String(target)) return;
        url.searchParams.set("price", String(target));
        url.hash = SECTION_ID;
        window.history.replaceState(null, "", url.toString());
      } catch {
        // replaceState is best-effort; ignore failures.
      }
    };

    const now = Date.now();
    const elapsed = now - urlThrottleRef.current;
    if (elapsed >= URL_THROTTLE_MS) {
      urlThrottleRef.current = now;
      writeUrl(price);
      urlPendingRef.current = null;
      if (urlTimeoutRef.current !== null) {
        clearTimeout(urlTimeoutRef.current);
        urlTimeoutRef.current = null;
      }
    } else {
      urlPendingRef.current = price;
      if (urlTimeoutRef.current === null) {
        const remaining = URL_THROTTLE_MS - elapsed;
        urlTimeoutRef.current = window.setTimeout(() => {
          if (urlPendingRef.current !== null) {
            urlThrottleRef.current = Date.now();
            writeUrl(urlPendingRef.current);
            urlPendingRef.current = null;
          }
          urlTimeoutRef.current = null;
        }, remaining);
      }
    }

    return () => {
      if (urlTimeoutRef.current !== null) {
        clearTimeout(urlTimeoutRef.current);
        urlTimeoutRef.current = null;
      }
    };
  }, [price]);

  // ── Interaction depth: fire once on blur or visibilitychange
  const fireInteractionDepth = useCallback(() => {
    if (interactionDepthFiredRef.current) return;
    interactionDepthFiredRef.current = true;
    track("home_rebate_slider_interaction_depth", {
      maxDistanceDollars: maxDragDistanceRef.current,
    });
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        fireInteractionDepth();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fireInteractionDepth]);

  // ── Pointer handling
  const priceFromPointer = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return price;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return price;
      const ratio = (clientX - rect.left) / rect.width;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const raw =
        SLIDER_MIN_PRICE + clampedRatio * (SLIDER_MAX_PRICE - SLIDER_MIN_PRICE);
      return clampPrice(raw);
    },
    [price],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      sliderRef.current?.focus();
      hasUserInteractedRef.current = true;
      const next = priceFromPointer(event.clientX);
      setPrice(next);
      setIsDragging(true);
      try {
        (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
      } catch {
        // older browsers
      }
    },
    [priceFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      event.preventDefault();
      const next = priceFromPointer(event.clientX);
      setPrice(next);
    },
    [isDragging, priceFromPointer],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      try {
        (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
      } catch {
        // older browsers
      }
      const raw = priceFromPointer(event.clientX);
      const snap = nearestSnapPoint(raw);
      if (Math.abs(raw - snap) <= SNAP_MAGNET_DOLLARS) {
        setPrice(snap);
        track("home_rebate_slider_snap_reached", { snapPoint: snap });
      } else {
        setPrice(raw);
      }
    },
    [isDragging, priceFromPointer],
  );

  // ── Keyboard handling
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let delta = 0;
      let absolute: number | null = null;
      const shift = event.shiftKey;
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          delta = shift ? -SHIFT_STEP : -ARROW_STEP;
          break;
        case "ArrowRight":
        case "ArrowUp":
          delta = shift ? SHIFT_STEP : ARROW_STEP;
          break;
        case "PageDown":
          delta = -SHIFT_STEP;
          break;
        case "PageUp":
          delta = SHIFT_STEP;
          break;
        case "Home":
          absolute = SLIDER_MIN_PRICE;
          break;
        case "End":
          absolute = SLIDER_MAX_PRICE;
          break;
        default:
          return;
      }
      event.preventDefault();
      hasUserInteractedRef.current = true;
      const next =
        absolute !== null ? absolute : clampPrice(price + delta);
      setPrice(next);
      if (isExactSnapPoint(next)) {
        track("home_rebate_slider_snap_reached", { snapPoint: next });
      }
    },
    [price],
  );

  // ── CTA
  const handleCtaClick = useCallback(() => {
    track("home_rebate_cta_clicked", {});
  }, []);

  // ── Blur fires interaction depth
  const handleBlur = useCallback(() => {
    fireInteractionDepth();
  }, [fireInteractionDepth]);

  // ── Derived display
  const pct = pctOf(price);
  const formattedPrice = formatCurrency(price);
  const formattedDisplayedRebate = formatCurrency(Math.round(displayedRebate));
  const formattedActualRebate = formatCurrency(illustration.rebate);
  const headingString = formatHeadline(formattedPrice, formattedActualRebate);
  const band = ASPIRATION_BANDS[illustration.rebateBand];

  return (
    <section
      ref={sectionRef}
      id={SECTION_ID}
      aria-labelledby={HEADING_ID}
      className="scroll-mt-[84px] w-full bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
        <Header headingString={headingString} />

        {/* Big tweened rebate number */}
        <div className="mx-auto mt-12 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Estimated rebate
          </p>
          <p
            aria-live="polite"
            className="mt-2 text-5xl font-semibold tabular-nums text-primary-700 lg:text-7xl"
          >
            {formattedDisplayedRebate}
          </p>
        </div>

        {/* Slider */}
        <div className="mx-auto mt-10 max-w-2xl px-4 lg:px-0">
          <div
            ref={sliderRef}
            role="slider"
            tabIndex={0}
            aria-valuemin={SLIDER_MIN_PRICE}
            aria-valuemax={SLIDER_MAX_PRICE}
            aria-valuenow={price}
            aria-valuetext={`${formattedPrice} — estimated rebate ${formattedActualRebate}`}
            aria-label="Home price — drag to see your estimated rebate at closing"
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="group relative rounded-lg py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            style={{ touchAction: "none" }}
          >
            <div
              ref={trackRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="relative h-2 cursor-pointer rounded-full bg-neutral-200"
            >
              {/* Progress fill */}
              <div
                className="absolute left-0 top-0 h-2 rounded-full bg-primary-700"
                style={{ width: `${pct}%` }}
              />

              {/* Snap markers */}
              {SLIDER_SNAP_POINTS.map((snap) => {
                const snapPct = pctOf(snap);
                return (
                  <span
                    key={snap}
                    aria-hidden="true"
                    className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-300"
                    style={{ left: `${snapPct}%` }}
                  />
                );
              })}

              {/* Thumb */}
              <div
                aria-hidden="true"
                className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary-700 shadow-md ring-1 ring-primary-800/30 group-focus-within:ring-2 group-focus-within:ring-primary-500 group-focus-within:ring-offset-2"
                style={{ left: `${pct}%` }}
              >
                {/* 44×44 hit target for touch */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 block size-11 -translate-x-1/2 -translate-y-1/2"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-between text-xs font-medium tabular-nums text-neutral-500">
              <span>{formatCurrency(SLIDER_MIN_PRICE)}</span>
              <span>{formatCurrency(SLIDER_MAX_PRICE)}</span>
            </div>
          </div>
        </div>

        {/* Math transparency */}
        <div className="mx-auto mt-12 max-w-2xl">
          <dl className="grid grid-cols-1 gap-3 rounded-[24px] border border-neutral-200/80 bg-neutral-50 p-6 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                {MATH_TRANSPARENCY_LABELS.priceLabel}
              </dt>
              <dd className="text-base font-medium tabular-nums text-neutral-700">
                {formattedPrice}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                {MATH_TRANSPARENCY_LABELS.commissionLabel}
              </dt>
              <dd className="text-base font-medium tabular-nums text-neutral-700">
                {formatCurrency(illustration.buyerSideCommission)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                {MATH_TRANSPARENCY_LABELS.feeLabel}
              </dt>
              <dd className="text-base font-medium tabular-nums text-neutral-700">
                {`\u2212 ${formatCurrency(illustration.buyerV2Fee)}`}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-neutral-200/80 pt-3 sm:col-span-2 sm:border-t-0 sm:pt-0">
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-primary-700">
                {MATH_TRANSPARENCY_LABELS.rebateLabel}
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-primary-700">
                {formattedActualRebate}
              </dd>
            </div>
          </dl>
        </div>

        {/* Aspiration band */}
        <div className="mx-auto mt-10 max-w-2xl">
          <div className="rounded-[24px] border border-primary-100 bg-primary-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-700">
              {band.headline}
            </p>
            <ul
              role="list"
              className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {band.items.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-neutral-700"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[0.45rem] inline-block size-1.5 flex-none rounded-full bg-primary-400"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DisclosureFooter
          isClamped={illustration.isClamped}
          onCtaClick={handleCtaClick}
          disclosureRef={disclosureRef}
        />
      </div>
    </section>
  );
}

/* ─── Public component ──────────────────────────────────────────────── */

export function HomeRebateSliderSection({
  initialPrice = SLIDER_DEFAULT_PRICE,
  enabled = true,
  deepLink = false,
}: HomeRebateSliderSectionProps) {
  if (!enabled) {
    return <FallbackTable />;
  }
  return (
    <InteractiveSlider
      initialPrice={clampPrice(initialPrice)}
      deepLink={deepLink}
    />
  );
}
