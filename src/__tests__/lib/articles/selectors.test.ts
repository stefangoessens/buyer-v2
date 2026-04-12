import { describe, it, expect } from "vitest";
import type { Article } from "@/lib/articles/types";
import {
  publicArticles,
  sortArticlesNewestFirst,
  findPublicArticleBySlug,
  groupArticlesByCategory,
  estimateReadingMinutes,
  slugifyHeading,
  validateArticle,
} from "@/lib/articles/selectors";

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "test-article",
    slug: "test-article",
    title: "Test article",
    summary: "A reasonably long summary that clears the 50-character minimum for SEO purposes.",
    category: "buying_guide",
    author: { name: "Test Author" },
    publishedAt: "2026-04-01",
    updatedAt: "2026-04-01",
    readingMinutes: 5,
    visibility: "public",
    body: [{ kind: "paragraph", text: "Some content." }],
    ...overrides,
  };
}

describe("publicArticles", () => {
  it("returns only public articles", () => {
    const list = [
      makeArticle({ id: "a1", visibility: "public" }),
      makeArticle({ id: "a2", visibility: "internal" }),
    ];
    expect(publicArticles(list).map((a) => a.id)).toEqual(["a1"]);
  });

  it("returns empty for all-internal catalog", () => {
    expect(
      publicArticles([makeArticle({ visibility: "internal" })])
    ).toEqual([]);
  });
});

describe("sortArticlesNewestFirst", () => {
  it("orders by publishedAt descending", () => {
    const list = [
      makeArticle({ id: "old", publishedAt: "2026-03-01" }),
      makeArticle({ id: "new", publishedAt: "2026-04-15" }),
      makeArticle({ id: "mid", publishedAt: "2026-04-01" }),
    ];
    expect(sortArticlesNewestFirst(list).map((a) => a.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("does not mutate the input", () => {
    const list = [makeArticle({ id: "a1", publishedAt: "2026-01-01" })];
    const before = JSON.stringify(list);
    sortArticlesNewestFirst(list);
    expect(JSON.stringify(list)).toBe(before);
  });
});

describe("findPublicArticleBySlug", () => {
  it("finds public article by slug", () => {
    const list = [makeArticle({ slug: "howdy" })];
    expect(findPublicArticleBySlug(list, "howdy")?.slug).toBe("howdy");
  });

  it("returns undefined for unknown slug", () => {
    expect(findPublicArticleBySlug([], "nope")).toBeUndefined();
  });

  it("returns undefined for internal article (treats as draft)", () => {
    const list = [makeArticle({ slug: "draft", visibility: "internal" })];
    expect(findPublicArticleBySlug(list, "draft")).toBeUndefined();
  });
});

describe("groupArticlesByCategory", () => {
  it("groups articles by category in display order", () => {
    const list = [
      makeArticle({ id: "legal", category: "legal_compliance" }),
      makeArticle({ id: "guide", category: "buying_guide" }),
      makeArticle({ id: "city", category: "florida_cities" }),
    ];
    const groups = groupArticlesByCategory(list);
    // buying_guide comes first in the display order
    expect(groups[0].category).toBe("buying_guide");
    // legal is last
    expect(groups[groups.length - 1].category).toBe("legal_compliance");
  });

  it("drops empty categories", () => {
    const list = [makeArticle({ category: "buying_guide" })];
    const groups = groupArticlesByCategory(list);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("buying_guide");
  });

  it("filters out internal articles", () => {
    const list = [
      makeArticle({ visibility: "internal", category: "buying_guide" }),
    ];
    expect(groupArticlesByCategory(list)).toEqual([]);
  });

  it("preserves newest-first order within a bucket", () => {
    const list = [
      makeArticle({
        id: "old",
        category: "buying_guide",
        publishedAt: "2026-03-01",
      }),
      makeArticle({
        id: "new",
        category: "buying_guide",
        publishedAt: "2026-04-01",
      }),
    ];
    const groups = groupArticlesByCategory(list);
    expect(groups[0].articles.map((a) => a.id)).toEqual(["new", "old"]);
  });
});

describe("estimateReadingMinutes", () => {
  it("computes at ~225 wpm", () => {
    const hundredWordText = Array.from({ length: 100 }, () => "word").join(" ");
    const body: Article["body"] = [
      { kind: "paragraph", text: hundredWordText },
      { kind: "paragraph", text: hundredWordText },
      { kind: "paragraph", text: hundredWordText },
    ];
    // 300 words / 225 wpm ≈ 1.33 → round to 1
    expect(estimateReadingMinutes(body)).toBe(1);
  });

  it("returns at least 1 even for tiny content", () => {
    expect(
      estimateReadingMinutes([{ kind: "paragraph", text: "hi" }])
    ).toBe(1);
  });

  it("counts list items", () => {
    const body: Article["body"] = [
      {
        kind: "list",
        style: "bulleted",
        items: Array.from({ length: 50 }, () =>
          "ten words to make this list item a bit longer okay"
        ),
      },
    ];
    // 50 × 10 = 500 words → ~2 min
    expect(estimateReadingMinutes(body)).toBe(2);
  });

  it("does not count CTA blocks", () => {
    const body: Article["body"] = [
      { kind: "savings_calculator_cta" },
      { kind: "paste_link_cta" },
      {
        kind: "city_cross_link",
        cityName: "Tampa",
        href: "/cities/tampa",
        description: "Short blurb",
      },
    ];
    // Only city description contributes 2 words → floor at 1 min
    expect(estimateReadingMinutes(body)).toBe(1);
  });
});

describe("slugifyHeading", () => {
  it("converts to lowercase kebab-case", () => {
    expect(slugifyHeading("How It Works")).toBe("how-it-works");
  });

  it("strips punctuation", () => {
    expect(slugifyHeading("What's the deal?")).toBe("whats-the-deal");
  });

  it("collapses whitespace", () => {
    expect(slugifyHeading("  Lots   of   spaces  ")).toBe("lots-of-spaces");
  });

  it("handles all-punctuation by returning empty", () => {
    expect(slugifyHeading("!!!")).toBe("");
  });
});

describe("validateArticle", () => {
  it("passes a valid article", () => {
    expect(validateArticle(makeArticle())).toEqual({ ok: true });
  });

  it("rejects invalid slug", () => {
    const result = validateArticle(makeArticle({ slug: "Bad Slug!" }));
    expect(result.ok).toBe(false);
  });

  it("rejects short title", () => {
    const result = validateArticle(makeArticle({ title: "hi" }));
    expect(result.ok).toBe(false);
  });

  it("rejects short summary", () => {
    const result = validateArticle(makeArticle({ summary: "too short" }));
    expect(result.ok).toBe(false);
  });

  it("rejects empty body", () => {
    const result = validateArticle(makeArticle({ body: [] }));
    expect(result.ok).toBe(false);
  });

  it("rejects invalid publishedAt", () => {
    const result = validateArticle(
      makeArticle({ publishedAt: "last tuesday" })
    );
    expect(result.ok).toBe(false);
  });

  it("collects multiple errors", () => {
    const result = validateArticle(
      makeArticle({ slug: "", title: "", summary: "", body: [] })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });
});
