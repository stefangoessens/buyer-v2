"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { FAQTheme } from "@/lib/content/types";
import { track } from "@/lib/analytics";
import { FAQ_THEME_META, FAQ_THEME_ORDER } from "./faqThemeMeta";

/**
 * Sticky jump-nav rendered directly under the FAQ hero. Three pills
 * — one per theme — let buyers skip straight to the part of the page
 * they care about. On mobile the pill row becomes a horizontal scroll
 * with snap points (per KIN-1085: NOT a stacked grid).
 */
export function FaqThemeJumpNav() {
  const handleJumpClick = (theme: FAQTheme) => {
    track("faq_theme_jump_clicked", { theme });
  };

  return (
    <div className="sticky top-16 z-30 w-full border-b border-neutral-200/80 bg-white/85 backdrop-blur-md">
      <nav
        role="navigation"
        aria-label="FAQ themes"
        className="mx-auto max-w-[1248px] px-4 py-3 lg:px-8"
      >
        <ul className="flex items-center gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:justify-center md:overflow-x-visible">
          {FAQ_THEME_ORDER.map((theme) => {
            const meta = FAQ_THEME_META[theme];
            return (
              <li key={theme} className="snap-center shrink-0">
                <a
                  href={`#${meta.anchor}`}
                  onClick={() => handleJumpClick(theme)}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-800 ring-1 ring-neutral-200/80 transition-colors hover:bg-primary-50 hover:text-primary-700 hover:ring-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  data-faq-theme={theme}
                >
                  <HugeiconsIcon
                    icon={meta.icon}
                    strokeWidth={2}
                    className="size-4"
                    aria-hidden="true"
                  />
                  <span>{meta.title}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
