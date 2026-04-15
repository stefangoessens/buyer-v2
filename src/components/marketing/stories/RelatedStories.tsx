"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";
import type { BuyerStory } from "@/lib/trustProof/types";
import { StoryCard } from "@/components/marketing/stories/StoryCard";
import { track } from "@/lib/analytics";

interface RelatedStoriesProps {
  stories: BuyerStory[];
  sourceStoryId: string;
  className?: string;
}

export function RelatedStories({
  stories,
  sourceStoryId,
  className,
}: RelatedStoriesProps) {
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  if (stories.length === 0) return null;

  const handleKeyDown = (
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = itemRefs.current[index + 1];
      if (next) next.focus();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = itemRefs.current[index - 1];
      if (prev) prev.focus();
    }
  };

  return (
    <section
      aria-label="Related buyer stories"
      className={
        "mt-16 border-t border-neutral-200 pt-12" +
        (className ? ` ${className}` : "")
      }
    >
      <h2 className="text-2xl font-semibold tracking-[-0.003em] text-neutral-800">
        More buyer stories
      </h2>
      <div className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-6 sm:overflow-visible lg:grid-cols-3">
        {stories.map((story, index) => (
          <Link
            key={story.id}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            href={`/stories/${story.slug}`}
            prefetch={false}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() =>
              track("story_related_clicked", {
                sourceStoryId,
                destinationStoryId: story.id,
              })
            }
            className="block w-[85%] shrink-0 snap-start rounded-[24px] focus:outline-none focus:ring-2 focus:ring-primary-400 sm:w-auto sm:shrink"
            aria-label={`Read ${story.buyer.displayName}'s story`}
          >
            <StoryCard story={story} source="related" />
          </Link>
        ))}
      </div>
    </section>
  );
}
