import type { Metadata } from "next";
import { BUYER_STORIES } from "@/content/trustProof";
import { filterPublishableStories } from "@/lib/trustProof/policy";
import { StoriesIndex } from "@/components/marketing/stories/StoriesIndex";

export const metadata: Metadata = {
  title: "Buyer stories | buyer-v2",
  description: "Real Florida buyers, real savings, real stories.",
};

export default function StoriesPage() {
  const stories = filterPublishableStories(BUYER_STORIES);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-[-0.003em] text-neutral-800 sm:text-4xl">
          Buyer stories
        </h1>
        <p className="mt-2 text-base text-neutral-700">
          Real Florida buyers, real savings, real stories.
        </p>
      </header>
      <StoriesIndex stories={stories} />
    </main>
  );
}
