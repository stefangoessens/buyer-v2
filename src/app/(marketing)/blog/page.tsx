import type { Metadata } from "next";
import { ARTICLES } from "@/content/articles";
import { publicArticles } from "@/lib/articles/selectors";
import { ArticleIndex } from "@/components/marketing/articles/ArticleIndex";
import { ContentPageTemplate } from "@/components/marketing/content/ContentPageTemplate";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";
import type { ContentPageMeta } from "@/lib/content/types";

const META: ContentPageMeta = {
  slug: "blog",
  eyebrow: "The buyer-v2 blog",
  title: "Articles for Florida homebuyers",
  description:
    "Plain-language guides on pricing, offers, closing, commissions, and Florida market specifics — written by licensed brokers and the buyer-v2 team.",
};

export const metadata: Metadata = metadataForStaticPage("blog");

export default function BlogIndexPage() {
  const articles = publicArticles(ARTICLES);
  return (
    <ContentPageTemplate meta={META}>
      <ArticleIndex articles={articles} />
    </ContentPageTemplate>
  );
}
