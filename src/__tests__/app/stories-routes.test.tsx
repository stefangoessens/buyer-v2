// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// next/navigation.notFound() must throw so we can assert the 404 path
// without a real Next.js render server.
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import StoriesPage from "@/app/(marketing)/stories/page";
import StoryDetailPage, {
  generateMetadata as generateStoryMetadata,
  generateStaticParams as generateStoryStaticParams,
} from "@/app/(marketing)/stories/[slug]/page";
import {
  buildBuyerStoriesCollectionSchema,
  buildBuyerStoryReviewSchema,
} from "@/lib/seo/builder";
import { BUYER_STORIES } from "@/content/trustProof";
import { filterPublishableStories } from "@/lib/trustProof/policy";
import { shouldNoindexStoriesArchive } from "@/lib/seo/pageDefinitions";
import sitemap from "@/app/sitemap";

let prevSiteUrl: string | undefined;

beforeEach(() => {
  prevSiteUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://buyerv2.com";
});

afterEach(() => {
  cleanup();
  if (prevSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = prevSiteUrl;
  }
});

describe("/stories archive route", () => {
  it("renders an empty state when no approved stories exist", () => {
    // All 3 seeds are draft today — filterPublishableStories returns []
    expect(filterPublishableStories(BUYER_STORIES)).toEqual([]);
    render(<StoriesPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Buyer stories/i }),
    ).toBeInTheDocument();
    // StoriesIndex is responsible for the "no stories yet" empty state;
    // the heading + intro copy must still render even with zero approvals.
    expect(
      screen.getByText(/Real Florida buyers, real savings/i),
    ).toBeInTheDocument();
  });

  it("noindex helper is true while no approved stories exist", () => {
    expect(shouldNoindexStoriesArchive()).toBe(true);
  });
});

describe("/stories/[slug] route", () => {
  it("404s for the draft seed `dj-tampa-first-time` because drafts are excluded", async () => {
    // Sanity: the seed exists in source but as a draft, so filterPublishableStories drops it.
    const sourceHasDraft = BUYER_STORIES.some(
      (s) => s.slug === "dj-tampa-first-time" && s.publicationStatus === "draft",
    );
    expect(sourceHasDraft).toBe(true);

    await expect(
      StoryDetailPage({
        params: Promise.resolve({ slug: "dj-tampa-first-time" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for an unknown slug", async () => {
    await expect(
      StoryDetailPage({
        params: Promise.resolve({ slug: "nonexistent-story-slug" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("generateStaticParams returns an empty array while every seed is a draft", async () => {
    const params = await generateStoryStaticParams();
    expect(Array.isArray(params)).toBe(true);
    expect(params).toEqual([]);
  });

  it("generateMetadata returns the fallback title for an unknown slug", async () => {
    const meta = await generateStoryMetadata({
      params: Promise.resolve({ slug: "nonexistent-story-slug" }),
    });
    expect(meta.title).toBe("Story not found | buyer-v2");
  });
});

describe("buildBuyerStoryReviewSchema", () => {
  it("returns a schema.org Review with itemReviewed = Organization (not Article)", () => {
    const schema = buildBuyerStoryReviewSchema({
      storyTitle: "How DJ saved $10,500 on his first Tampa home",
      storyBody: "Long-form story body for testing.",
      storySlug: "dj-tampa-first-time",
      buyerDisplayName: "DJ R.",
      closedLabel: "Closed Q1 2026",
      totalSavedUsd: 10_500,
      canonicalUrl: "https://buyerv2.com/stories/dj-tampa-first-time",
    });

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Review");

    const itemReviewed = schema.itemReviewed as Record<string, unknown>;
    expect(itemReviewed).toBeDefined();
    expect(itemReviewed["@type"]).toBe("Organization");
    // Hard guarantee: this MUST NOT be an Article, per the KIN-1087 spec.
    expect(itemReviewed["@type"]).not.toBe("Article");
    expect(itemReviewed.name).toBe("buyer-v2");

    const author = schema.author as Record<string, unknown>;
    expect(author["@type"]).toBe("Person");
    expect(author.name).toBe("DJ R.");

    expect(schema.reviewBody).toBe("Long-form story body for testing.");
    expect(schema.url).toBe(
      "https://buyerv2.com/stories/dj-tampa-first-time",
    );
    expect(schema.name).toBe(
      "How DJ saved $10,500 on his first Tampa home",
    );

    const rating = schema.reviewRating as Record<string, unknown>;
    expect(rating["@type"]).toBe("Rating");
    expect(rating.ratingValue).toBe("5");
  });

  it("respects an explicit datePublished when provided", () => {
    const schema = buildBuyerStoryReviewSchema({
      storyTitle: "t",
      storyBody: "b",
      storySlug: "s",
      buyerDisplayName: "B",
      closedLabel: "Closed Q1 2026",
      totalSavedUsd: 1,
      canonicalUrl: "https://buyerv2.com/stories/s",
      datePublished: "2026-01-15",
    });
    expect(schema.datePublished).toBe("2026-01-15");
  });
});

describe("buildBuyerStoriesCollectionSchema", () => {
  it("returns a CollectionPage with numberOfItems", () => {
    const schema = buildBuyerStoriesCollectionSchema({
      canonicalUrl: "https://buyerv2.com/stories",
      storyCount: 3,
    });
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("CollectionPage");
    expect(schema.name).toBe("Buyer stories");
    expect(schema.url).toBe("https://buyerv2.com/stories");
    expect(schema.numberOfItems).toBe(3);
  });
});

describe("sitemap — KIN-1087 stories gating", () => {
  it("does NOT include /stories while every buyer story is a draft", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).not.toContain("https://buyerv2.com/stories");
  });

  it("does NOT include any /stories/[slug] entries for draft seeds", () => {
    const urls = sitemap().map((e) => e.url);
    for (const story of BUYER_STORIES) {
      expect(urls).not.toContain(
        `https://buyerv2.com/stories/${story.slug}`,
      );
    }
  });
});
