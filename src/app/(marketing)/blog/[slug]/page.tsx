import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ARTICLES } from "@/content/articles";
import {
  findPublicArticleBySlug,
  publicArticles,
} from "@/lib/articles/selectors";
import { ArticleTemplate } from "@/components/marketing/articles/ArticleTemplate";
import { buildMetadata, buildStructuredData } from "@/lib/seo/builder";

type PageParams = { slug: string };

export async function generateStaticParams(): Promise<PageParams[]> {
  return publicArticles(ARTICLES).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = findPublicArticleBySlug(ARTICLES, slug);

  if (!article) {
    // Unknown slug → noindex (same pattern as /legal/[slug])
    return buildMetadata({
      title: "Article not found",
      description:
        "The article you're looking for doesn't exist, is still in draft, or has moved.",
      path: "/blog/not-found",
      visibility: "gated",
      kind: "system",
    });
  }

  return buildMetadata({
    title: article.title,
    description: article.summary,
    path: `/blog/${article.slug}`,
    visibility: "public",
    kind: "article",
    lastModified: article.updatedAt,
    social: article.coverImage
      ? {
          title: article.title,
          description: article.summary,
          imageUrl: article.coverImage.src,
          imageAlt: article.coverImage.alt,
        }
      : undefined,
  });
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const article = findPublicArticleBySlug(ARTICLES, slug);

  if (!article) {
    notFound();
  }

  const jsonLd = buildStructuredData(
    {
      title: article.title,
      description: article.summary,
      path: `/blog/${article.slug}`,
      visibility: "public",
      kind: "article",
      lastModified: article.updatedAt,
    },
    { articleAuthor: article.author.name }
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleTemplate article={article} />
    </>
  );
}
