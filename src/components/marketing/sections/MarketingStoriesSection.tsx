"use client";

import Link from "next/link";
import { BUYER_STORIES } from "@/content/trustProof";
import { selectStoriesForPlacement } from "@/lib/trustProof/policy";
import { StoryCard } from "@/components/marketing/stories/StoryCard";
import { AggregateSavingsCounter } from "@/components/marketing/stories/AggregateSavingsCounter";
import { track } from "@/lib/analytics";

interface MarketingStoriesSectionProps {
  source: "home" | "pricing";
  heading?: string;
  subheading?: string;
  className?: string;
}

export function MarketingStoriesSection({
  source,
  heading = "Buyers saving real money",
  subheading = "Real Florida buyers, real savings, real stories.",
  className,
}: MarketingStoriesSectionProps) {
  const stories = selectStoriesForPlacement(BUYER_STORIES, source, 3);

  // Hidden until approved stories land per KIN-1087 product decision
  if (stories.length === 0) return null;

  return (
    <section
      className={
        "w-full bg-primary-50 py-20 lg:py-28" + (className ? ` ${className}` : "")
      }
    >
      <div className="mx-auto max-w-[1248px] px-6">
        <AggregateSavingsCounter stories={stories} className="mb-10" />

        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
            Buyer stories
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
            {heading}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            {subheading}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              source={source}
              onView={(storyId) =>
                track("testimonial_card_viewed", { storyId, source })
              }
              onClick={(storyId) =>
                track("testimonial_card_clicked", { storyId, source })
              }
            />
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/stories"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-500"
          >
            Browse all stories
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
