import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BUYER_STORIES } from "@/content/trustProof";
import { filterPublishableStories } from "@/lib/trustProof/policy";
import { StoryTemplate } from "@/components/marketing/stories/StoryTemplate";

export async function generateStaticParams() {
  return filterPublishableStories(BUYER_STORIES).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const story = filterPublishableStories(BUYER_STORIES).find(
    (s) => s.slug === slug,
  );
  if (!story) return { title: "Story not found | buyer-v2" };
  return {
    title: `${story.story.title} | buyer-v2`,
    description: story.story.summary,
    openGraph: {
      title: story.story.title,
      description: story.story.summary,
      images: [{ url: "/og-story-default.png", width: 1200, height: 630 }],
    },
  };
}

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const publishable = filterPublishableStories(BUYER_STORIES);
  const story = publishable.find((s) => s.slug === slug);
  if (!story) notFound();
  const related = publishable.filter((s) => s.id !== story.id).slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <StoryTemplate story={story} relatedStories={related} />
    </main>
  );
}
