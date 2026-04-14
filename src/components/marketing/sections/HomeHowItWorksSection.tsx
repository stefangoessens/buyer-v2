"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MagicWand02Icon,
  Home01Icon,
  Agreement02Icon,
  Key01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import {
  HOME_HOW_IT_WORKS,
  type HomeHowItWorksStep,
} from "@/content/home-how-it-works";
import { track } from "@/lib/analytics";

const ICON_MAP = {
  sparkles: MagicWand02Icon,
  home: Home01Icon,
  handshake: Agreement02Icon,
  key: Key01Icon,
} as const;

export function HomeHowItWorksSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    const el = sectionRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      viewedRef.current = true;
      track("home_how_it_works_section_viewed", {});
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            if (!viewedRef.current) {
              viewedRef.current = true;
              track("home_how_it_works_section_viewed", {});
            }
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleStepInteract = (
    step: HomeHowItWorksStep,
    kind: "hover" | "focus",
  ) => {
    track("home_how_it_works_step_interacted", {
      stepNumber: step.number,
      stepId: step.id,
      kind,
    });
  };

  const handleCtaClick = () => {
    track("home_how_it_works_cta_clicked", {});
  };

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-[84px] w-full bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-700">
            {HOME_HOW_IT_WORKS.eyebrow}
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-3 text-balance text-3xl font-semibold tracking-[-0.003em] text-neutral-900 lg:text-[41px] lg:leading-[1.2]"
          >
            {HOME_HOW_IT_WORKS.headline}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-neutral-500 md:text-lg">
            {HOME_HOW_IT_WORKS.intro}
          </p>
        </header>

        <ol className="mt-16 flex flex-col gap-16 md:gap-24" role="list">
          {HOME_HOW_IT_WORKS.steps.map((step, idx) => {
            const isReversed = idx % 2 === 1;
            const Icon = ICON_MAP[step.iconName];
            const bylineColor =
              step.bylineKind === "ai"
                ? "text-primary-700"
                : "text-neutral-600";

            return (
              <li
                key={step.id}
                className="grid items-center gap-8 md:grid-cols-12 md:gap-12"
                onMouseEnter={() => handleStepInteract(step, "hover")}
                onFocus={() => handleStepInteract(step, "focus")}
                tabIndex={-1}
              >
                <div
                  className={`order-1 md:col-span-5 ${
                    isReversed ? "md:order-2" : "md:order-1"
                  }`}
                >
                  <div className="flex items-center gap-5">
                    <span className="text-6xl font-semibold tracking-tight text-primary-400 md:text-7xl">
                      {String(step.number).padStart(2, "0")}
                    </span>
                    <span
                      aria-hidden="true"
                      className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 md:size-20"
                    >
                      <HugeiconsIcon icon={Icon} size={36} strokeWidth={1.5} />
                    </span>
                  </div>
                </div>

                <div
                  className={`order-2 md:col-span-7 ${
                    isReversed ? "md:order-1" : "md:order-2"
                  }`}
                >
                  <h3 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-neutral-600 md:text-lg">
                    {step.description}
                  </p>
                  <p className={`mt-4 text-sm italic ${bylineColor}`}>
                    {step.byline}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-20 flex justify-center">
          <Link
            href={HOME_HOW_IT_WORKS.cta.href}
            onClick={handleCtaClick}
            className="inline-flex items-center gap-2 rounded-full bg-primary-400 px-8 py-4 text-base font-semibold text-white shadow-md transition-colors hover:bg-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            {HOME_HOW_IT_WORKS.cta.label}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={18}
              strokeWidth={2}
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
