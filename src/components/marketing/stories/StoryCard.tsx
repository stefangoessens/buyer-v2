"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { BuyerStory, BuyerType } from "@/lib/trustProof/types";

interface StoryCardProps {
  story: BuyerStory;
  source: "home" | "pricing" | "stories" | "related";
  className?: string;
  onView?: (storyId: string) => void;
  onClick?: (storyId: string) => void;
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

const QUOTE_TRUNCATE_AT = 220;

function truncateQuote(quote: string): string {
  if (quote.length <= QUOTE_TRUNCATE_AT) return quote;
  return quote.slice(0, QUOTE_TRUNCATE_AT - 1).trimEnd() + "\u2026";
}

function initialsForBuyer(firstName: string, lastInitial: string): string {
  const f = firstName.charAt(0).toUpperCase();
  const l = lastInitial.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  return `${f}${l}`;
}

export function StoryCard({
  story,
  source,
  className,
  onView,
  onClick,
}: StoryCardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasFiredViewRef = useRef(false);

  useEffect(() => {
    if (!onView) return;
    const node = rootRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // Fallback: fire once on mount when IO unavailable
      if (!hasFiredViewRef.current) {
        hasFiredViewRef.current = true;
        onView(story.id);
      }
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasFiredViewRef.current) {
            hasFiredViewRef.current = true;
            onView(story.id);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onView, story.id]);

  const buyerTypeLabel = TYPE_LABEL[story.buyer.type];
  const initials = initialsForBuyer(story.buyer.firstName, story.buyer.lastInitial);
  const headline = `Saved ${USD_FORMATTER.format(story.teaser.savedUsd)}`;
  const truncatedQuote = truncateQuote(story.teaser.quote);
  const isApproved = story.publicationStatus === "approved";
  const detailHref = `/stories/${story.slug}`;

  const handleClick = () => {
    if (onClick) onClick(story.id);
  };

  const linkBody = (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-500">
      Read their story
      <span aria-hidden="true">&rarr;</span>
    </span>
  );

  return (
    <div
      ref={rootRef}
      className={
        "flex h-full flex-row items-start gap-4 rounded-[24px] border border-neutral-200 bg-white p-6 sm:gap-5 sm:p-7" +
        (className ? ` ${className}` : "")
      }
    >
      {story.buyer.photoSrc ? (
        <Image
          src={story.buyer.photoSrc}
          alt={story.buyer.photoAlt ?? story.buyer.displayName}
          width={72}
          height={72}
          className="size-[72px] shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700"
          aria-hidden="true"
        >
          {initials}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm font-semibold text-neutral-800">
            {story.buyer.displayName}
          </span>
          <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
            {buyerTypeLabel}
          </span>
          {isApproved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700">
              <svg
                aria-hidden="true"
                className="size-3.5"
                fill="none"
                viewBox="0 0 20 20"
              >
                <path
                  fill="currentColor"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z"
                />
              </svg>
              Verified
              <span className="sr-only">buyer story</span>
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
              DRAFT &middot; Placeholder content
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-neutral-500">
          {story.buyer.city}, FL
        </p>

        <p className="mt-3 text-xl font-semibold tracking-[-0.003em] text-neutral-800">
          {headline}
        </p>

        <blockquote className="mt-2 text-sm leading-relaxed text-neutral-700">
          &ldquo;{truncatedQuote}&rdquo;
        </blockquote>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600">
            {story.teaser.closedLabel}
          </span>
          {source === "related" ? (
            <button
              type="button"
              onClick={handleClick}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-500"
            >
              Read their story
              <span aria-hidden="true">&rarr;</span>
            </button>
          ) : (
            <Link
              href={detailHref}
              onClick={handleClick}
              prefetch={false}
              aria-label={`Read ${story.buyer.displayName}'s story`}
            >
              {linkBody}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
