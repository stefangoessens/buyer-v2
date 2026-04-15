import Link from "next/link";
import type { BuyerStory } from "@/lib/trustProof/types";
import { StoryCard } from "@/components/marketing/stories/StoryCard";

interface StoriesIndexProps {
  stories: BuyerStory[];
}

export function StoriesIndex({ stories }: StoriesIndexProps) {
  if (stories.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-neutral-200 bg-primary-50 p-10 text-center sm:p-14">
        <p className="text-lg font-medium text-neutral-800">
          More buyer stories coming soon.
        </p>
        <p className="mt-3 text-sm text-neutral-500">
          We&rsquo;re collecting released buyer stories from recent closings.
        </p>
        <Link
          href="/#hero-intake"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600"
        >
          Start yours with a real analysis
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} source="stories" />
      ))}
    </div>
  );
}
