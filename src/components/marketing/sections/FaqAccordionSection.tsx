"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link01Icon } from "@hugeicons/core-free-icons";
import type { FAQEntry, FAQTheme } from "@/lib/content/types";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { FAQ_THEME_META } from "./faqThemeMeta";

/**
 * Renders one FAQ theme: title, intro, and a multi-open accordion of
 * questions. Theme 3 ("protection") uses `variant="emphasis"` for a
 * darker background, more padding, and a longer two-sentence intro —
 * see KIN-1085 acceptance criteria for why that section is the
 * strategic anchor.
 *
 * Multi-open behaviour, deep-link auto-open via `#question-slug`, and
 * copy-link-to-clipboard all live here because they require client
 * state. The page itself stays a server component.
 */

interface FaqAccordionSectionProps {
  theme: FAQTheme;
  entries: readonly FAQEntry[];
  variant?: "default" | "emphasis";
}

export function FaqAccordionSection({
  theme,
  entries,
  variant = "default",
}: FaqAccordionSectionProps) {
  const meta = FAQ_THEME_META[theme];
  const isEmphasis = variant === "emphasis";

  const validSlugs = useMemo(
    () => new Set(entries.map((e) => e.id)),
    [entries]
  );

  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  // Track when each question was opened so we can compute dwell on close.
  const openedAtRef = useRef<Map<string, number>>(new Map());
  // Per-theme engagement counter so the 2+ engagement event fires once
  // per theme instance.
  const engagedQuestionsRef = useRef<Set<string>>(new Set());
  const themeEngagedFiredRef = useRef(false);
  // Mount-once gate so the page-viewed + deep-link-landed events fire
  // only from the FIRST theme instance (`how_it_works`). The page mounts
  // three FaqAccordionSection components, but those mount-time events
  // describe the page as a whole — gate on theme to avoid 3x firing.
  const isMountFirstThemeInstance = theme === "how_it_works";

  const openEntry = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Defer scroll so the panel is in the DOM before we measure it.
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [setOpenIds]
  );

  const maybeFireEngagement = useCallback(() => {
    if (themeEngagedFiredRef.current) return;
    if (engagedQuestionsRef.current.size >= 2) {
      themeEngagedFiredRef.current = true;
      track("faq_theme_engaged", {
        theme,
        questionCount: engagedQuestionsRef.current.size,
      });
    }
  }, [theme]);

  // Hash-on-mount + hashchange — only act on hashes that match a slug
  // owned by THIS theme. Stale or internal hashes fail-soft.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyHash = (isInitial: boolean) => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      if (!validSlugs.has(hash)) return;
      // Track the deep-link open directly and keep the source ref out
      // of it — the ref is only consumed by `toggle`, and setting it
      // here would leak "deep_link" into the next manual click.
      openEntry(hash);
      // Record opened-at for dwell tracking.
      openedAtRef.current.set(hash, Date.now());
      track("faq_question_opened", {
        questionId: hash,
        theme,
        source: "deep_link",
      });
      if (isInitial) {
        track("faq_deep_link_landed", { questionId: hash, theme });
      }
      // Engagement counter for this theme.
      engagedQuestionsRef.current.add(hash);
      maybeFireEngagement();
    };

    applyHash(true);
    const onHashChange = () => applyHash(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [validSlugs, openEntry, theme, maybeFireEngagement]);

  // Mount-time page-level events fire from the first theme instance only.
  useEffect(() => {
    if (!isMountFirstThemeInstance) return;
    track("faq_page_viewed", {});
  }, [isMountFirstThemeInstance]);

  const toggle = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          // Closing → emit dwell.
          const openedAt = openedAtRef.current.get(id);
          if (openedAt !== undefined) {
            const dwellMs = Date.now() - openedAt;
            openedAtRef.current.delete(id);
            track("faq_question_dwell_ms", {
              questionId: id,
              theme,
              dwellMs,
            });
          }
        } else {
          next.add(id);
          // Opening → emit opened with source=direct. Hash-driven opens
          // bypass `toggle` (they go through `openEntry` directly and
          // fire their own `faq_question_opened` with source=deep_link
          // inside the hash effect), so this branch only sees manual
          // user clicks.
          openedAtRef.current.set(id, Date.now());
          track("faq_question_opened", { questionId: id, theme, source: "direct" });
          engagedQuestionsRef.current.add(id);
          maybeFireEngagement();
          // Keep the URL in sync without polluting history. Use
          // replaceState so back/forward isn't littered with a fragment
          // entry per click.
          if (typeof window !== "undefined") {
            const newUrl = `${window.location.pathname}${window.location.search}#${id}`;
            if (window.location.hash !== `#${id}`) {
              window.history.replaceState(null, "", newUrl);
            }
          }
        }
        return next;
      });
    },
    [theme, maybeFireEngagement],
  );

  // On unmount, flush dwell for any still-open questions in this section
  // so the metric isn't biased by users who navigate away with panels open.
  useEffect(() => {
    const openedAtMap = openedAtRef.current;
    return () => {
      const now = Date.now();
      openedAtMap.forEach((openedAt, questionId) => {
        track("faq_question_dwell_ms", {
          questionId,
          theme,
          dwellMs: now - openedAt,
        });
      });
      openedAtMap.clear();
    };
  }, [theme]);

  const copyLink = useCallback(
    async (id: string) => {
      if (typeof window === "undefined") return;
      const url = `${window.location.origin}/faq#${id}`;
      try {
        await navigator.clipboard.writeText(url);
        setCopiedToast("Link copied");
        window.setTimeout(() => setCopiedToast(null), 1800);
        track("faq_question_link_copied", { questionId: id, theme });
      } catch {
        // Fail-soft — clipboard may be denied in some browsers.
      }
    },
    [theme],
  );

  if (entries.length === 0) return null;

  return (
    <section
      id={meta.anchor}
      className={cn(
        "relative w-full scroll-mt-24",
        isEmphasis ? "bg-neutral-100" : "bg-white"
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-3xl px-6 lg:px-8",
          isEmphasis ? "py-12 lg:py-24" : "py-12 lg:py-16"
        )}
      >
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-700">
            {meta.eyebrow}
          </p>
          <div className="mt-2 flex items-center gap-3">
            {isEmphasis ? (
              <HugeiconsIcon
                icon={meta.icon}
                strokeWidth={2}
                className="size-7 shrink-0 text-primary-700"
                aria-hidden="true"
              />
            ) : null}
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-neutral-800 sm:text-3xl">
              {meta.title}
            </h2>
          </div>
          <p className="mt-3 text-base leading-relaxed text-neutral-600">
            {isEmphasis && meta.introEmphasis ? meta.introEmphasis : meta.intro}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200/80">
          {entries.map((entry, index) => (
            <FaqAccordionItem
              key={entry.id}
              entry={entry}
              isOpen={openIds.has(entry.id)}
              isFirst={index === 0}
              onToggle={() => toggle(entry.id)}
              onCopy={() => copyLink(entry.id)}
            />
          ))}
        </div>
      </div>

      {copiedToast ? (
        <div
          aria-live="polite"
          role="status"
          className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          {copiedToast}
        </div>
      ) : null}
    </section>
  );
}

interface FaqAccordionItemProps {
  entry: FAQEntry;
  isOpen: boolean;
  isFirst: boolean;
  onToggle: () => void;
  onCopy: () => void;
}

function FaqAccordionItem({
  entry,
  isOpen,
  isFirst,
  onToggle,
  onCopy,
}: FaqAccordionItemProps) {
  const reactId = useId();
  const panelId = `${reactId}-panel`;

  return (
    <div
      id={entry.id}
      className={cn(
        "scroll-mt-24",
        !isFirst && "border-t border-neutral-200/80"
      )}
    >
      <div className="flex items-start gap-2 px-6 py-5">
        <h3 className="m-0 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="group flex w-full items-start justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            <span className="flex-1 font-heading text-base font-semibold text-neutral-800 sm:text-lg">
              {entry.question}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition-all group-hover:bg-primary-50 group-hover:text-primary-700",
                isOpen && "rotate-45 bg-primary-50 text-primary-700"
              )}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                className="size-4"
              >
                <path d="M8 3v10M3 8h10" />
              </svg>
            </span>
          </button>
        </h3>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy link to this question"
          title="Copy link to this question"
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-neutral-500 ring-1 ring-transparent transition-all hover:bg-primary-50 hover:text-primary-700 hover:ring-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <HugeiconsIcon
            icon={Link01Icon}
            strokeWidth={2}
            className="size-[18px]"
            aria-hidden="true"
          />
        </button>
      </div>
      <div
        id={panelId}
        hidden={!isOpen}
        className="px-6 pb-5 text-base leading-relaxed text-neutral-600"
      >
        <p className="pr-10">{entry.answer}</p>
      </div>
    </div>
  );
}
