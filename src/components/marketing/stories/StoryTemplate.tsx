"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { BuyerStory, BuyerType } from "@/lib/trustProof/types";
import { RelatedStories } from "@/components/marketing/stories/RelatedStories";
import { track } from "@/lib/analytics";

interface StoryTemplateProps {
  story: BuyerStory;
  relatedStories: BuyerStory[];
}

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const TYPE_LABEL: Record<BuyerType, string> = {
  first_time: "First-time buyer",
  repeat: "Repeat buyer",
  investor: "Investor",
};

export function StoryTemplate({ story, relatedStories }: StoryTemplateProps) {
  const startRef = useRef<number>(0);
  const sentRef = useRef<boolean>(false);

  useEffect(() => {
    startRef.current = Date.now();
    track("story_page_viewed", { storyId: story.id });

    const sendReadTime = () => {
      if (sentRef.current) return;
      sentRef.current = true;
      const timeMs = Date.now() - startRef.current;
      track("story_read_time_ms", { storyId: story.id, timeMs });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendReadTime();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendReadTime);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendReadTime);
      sendReadTime();
    };
  }, [story.id]);

  const typeLabel = TYPE_LABEL[story.buyer.type];
  const savingsLabel = USD_FORMATTER.format(story.outcomes.totalSavedUsd);
  const bodyParagraphs = story.story.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className="pb-32 print:pb-0">
      <nav aria-label="Breadcrumb" className="text-xs text-neutral-500 print:hidden">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-primary-700">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/stories" className="hover:text-primary-700">
              Stories
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-neutral-700" aria-current="page">
            {story.buyer.displayName}
          </li>
        </ol>
      </nav>

      <header className="mt-8">
        <h1 className="text-3xl font-semibold tracking-[-0.003em] text-neutral-800 sm:text-4xl lg:text-5xl print:text-black">
          {story.story.title}
        </h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500 print:text-black">
          <span className="font-medium text-neutral-800 print:text-black">
            {story.buyer.displayName}
          </span>
          <span aria-hidden="true">&middot;</span>
          <span>{typeLabel}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{story.buyer.city}, FL</span>
          <span aria-hidden="true">&middot;</span>
          <span>{story.teaser.closedLabel}</span>
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-success-50 px-4 py-2 text-base font-semibold text-success-700">
          <svg
            aria-hidden="true"
            className="size-4"
            fill="none"
            viewBox="0 0 20 20"
          >
            <path
              fill="currentColor"
              d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z"
            />
          </svg>
          Saved {savingsLabel}
        </div>
      </header>

      {story.story.heroQuote ? (
        <blockquote className="mt-12 border-l-4 border-primary-200 pl-6 text-2xl font-medium italic leading-snug text-neutral-800 print:border-black print:text-black sm:text-3xl">
          &ldquo;{story.story.heroQuote}&rdquo;
        </blockquote>
      ) : null}

      <article role="article" className="prose mt-12 max-w-none">
        {bodyParagraphs.map((p, i) => (
          <p
            key={i}
            className="mt-5 text-base leading-relaxed text-neutral-700 print:text-black"
          >
            {p}
          </p>
        ))}
      </article>

      <aside className="mt-10 rounded-xl border border-primary-200 bg-primary-50 p-4 print:border-black print:bg-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-700">
          Florida angle
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-800 print:text-black">
          {story.story.floridaAngle}
        </p>
      </aside>

      <RelatedStories
        stories={relatedStories}
        sourceStoryId={story.id}
      />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <p className="hidden text-sm font-medium text-neutral-700 sm:block">
            Want a story like this on your own purchase?
          </p>
          <Link
            href="/#hero-intake"
            onClick={() => track("story_cta_clicked", { storyId: story.id })}
            className="inline-flex items-center gap-2 rounded-full bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600"
          >
            Start your story
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
