import type { Metadata } from "next";
import { readPublicEnv } from "@/lib/env";
import type {
  SeoInput,
  SeoValidation,
  SocialPreview,
  StructuredData,
} from "./types";

/**
 * SEO metadata builder for buyer-v2 public surfaces (KIN-815).
 *
 * Every public route composes its Next.js `Metadata` object via
 * `buildMetadata(input)`. The builder owns:
 *   - Canonical URL construction (absolute, path-only, query/fragment
 *     stripped) — prevents duplicate-indexing of query-string variants
 *   - `robots` directives — gated/private routes get `noindex,nofollow`
 *     regardless of any author override
 *   - OpenGraph + Twitter preview harmonization — one social object
 *     generates both
 *   - Sensible defaults for every optional field
 *   - JSON-LD structured data derived from the content `kind`
 *
 * The site origin is read from `NEXT_PUBLIC_APP_URL` with a safe
 * fallback — it's a public constant, not a secret.
 */

// MARK: - Site constants

const DEFAULT_SITE_URL = "https://buyerv2.com";
const DEFAULT_SITE_NAME = "buyer-v2";
const DEFAULT_SOCIAL_IMAGE_PATH = "/og-default.png";

/**
 * Return the site origin. Exposed as a function so tests can override
 * the env var without a module-level side effect.
 */
export function getSiteOrigin(): string {
  const raw = readPublicEnv(process.env).NEXT_PUBLIC_APP_URL.trim();
  if (!raw) return DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, ""); // strip trailing slash
}

// MARK: - Canonical URL

/**
 * Construct the canonical URL for a page.
 *
 * Rules:
 *   1. `canonicalOverride` wins if provided and already absolute.
 *   2. If `canonicalOverride` is a path, treat it the same as `path`.
 *   3. Otherwise use `path`, strip query string and fragment, and
 *      prepend the site origin.
 *
 * Canonical paths always start with `/` — inputs without the leading
 * slash are corrected so route authors can't silently produce a
 * malformed URL.
 */
export function buildCanonicalUrl(input: SeoInput): string {
  const origin = getSiteOrigin();
  const raw = input.canonicalOverride ?? input.path;

  // Absolute override — only accept http(s). Anything else falls
  // through to the path-based construction.
  if (/^https?:\/\//i.test(raw)) {
    return stripQueryAndFragment(raw);
  }

  let path = raw.startsWith("/") ? raw : `/${raw}`;
  path = stripQueryAndFragment(path);
  return `${origin}${path}`;
}

function stripQueryAndFragment(url: string): string {
  let out = url;
  const q = out.indexOf("?");
  if (q >= 0) out = out.slice(0, q);
  const h = out.indexOf("#");
  if (h >= 0) out = out.slice(0, h);
  return out;
}

// MARK: - Social preview

function resolveSocialPreview(input: SeoInput): Required<SocialPreview> {
  const origin = getSiteOrigin();
  const title = input.social?.title ?? input.title;
  const description = input.social?.description ?? input.description;
  const imageUrl =
    input.social?.imageUrl ?? `${origin}${DEFAULT_SOCIAL_IMAGE_PATH}`;
  const imageAlt =
    input.social?.imageAlt ??
    `${title} — ${DEFAULT_SITE_NAME}`;
  return { title, description, imageUrl, imageAlt };
}

// MARK: - Robots directive

/**
 * Return the robots directive for a given visibility. Gated/private
 * routes always get `noindex, nofollow` — there is no per-route
 * opt-in to indexing them.
 */
export function robotsFor(visibility: SeoInput["visibility"]): {
  index: boolean;
  follow: boolean;
} {
  if (visibility === "public") return { index: true, follow: true };
  return { index: false, follow: false };
}

// MARK: - Validation

/**
 * Validate an SeoInput for hard errors (missing title, impossibly
 * short description, etc.). Returns a discriminated union so callers
 * can surface the errors in dev/test and fail loud.
 */
export function validateSeoInput(input: SeoInput): SeoValidation {
  const errors: string[] = [];

  if (!input.title || input.title.trim().length === 0) {
    errors.push("title is required");
  } else if (input.title.length > 70) {
    errors.push(`title is too long (${input.title.length} > 70 chars)`);
  }

  if (!input.description || input.description.trim().length === 0) {
    errors.push("description is required");
  } else if (input.description.length < 50) {
    errors.push(
      `description is too short (${input.description.length} < 50 chars) — search engines typically truncate to 150-160`
    );
  } else if (input.description.length > 300) {
    errors.push(
      `description is too long (${input.description.length} > 300 chars)`
    );
  }

  if (!input.path || !input.path.startsWith("/")) {
    errors.push("path must start with /");
  }

  if (input.lastModified !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(input.lastModified)) {
      errors.push(
        "lastModified must be an ISO-8601 date (YYYY-MM-DD or full ISO)"
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// MARK: - Builder

/**
 * Build a Next.js `Metadata` object from typed SEO input.
 *
 * Handles:
 *   - absolute canonical URL
 *   - robots noindex for gated/private routes
 *   - OG + Twitter preview with shared defaults
 *   - site-wide title template suffix
 */
export function buildMetadata(input: SeoInput): Metadata {
  const canonical = buildCanonicalUrl(input);
  const social = resolveSocialPreview(input);
  const robots = robotsFor(input.visibility);

  const fullTitle =
    input.title === DEFAULT_SITE_NAME
      ? input.title
      : `${input.title} | ${DEFAULT_SITE_NAME}`;

  return {
    title: fullTitle,
    description: input.description,
    alternates: {
      canonical,
    },
    robots: {
      index: robots.index,
      follow: robots.follow,
      googleBot: {
        index: robots.index,
        follow: robots.follow,
        "max-snippet": robots.index ? -1 : 0,
        "max-image-preview": robots.index ? "large" : "none",
        "max-video-preview": robots.index ? -1 : 0,
      },
    },
    openGraph: {
      title: social.title,
      description: social.description,
      url: canonical,
      siteName: DEFAULT_SITE_NAME,
      type: input.kind === "article" ? "article" : "website",
      images: [
        {
          url: social.imageUrl,
          alt: social.imageAlt,
        },
      ],
      // Article OG time fields:
      //   - publishedTime: original publication date (never changes)
      //   - modifiedTime: most recent update (may equal publishedTime)
      // Falls back to lastModified when publishedAt isn't supplied so
      // existing legal/marketing pages keep working — for articles,
      // routes MUST pass publishedAt explicitly.
      ...(input.kind === "article"
        ? {
            ...(input.publishedAt || input.lastModified
              ? {
                  publishedTime: input.publishedAt ?? input.lastModified,
                }
              : {}),
            ...(input.lastModified
              ? { modifiedTime: input.lastModified }
              : {}),
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: social.title,
      description: social.description,
      images: [social.imageUrl],
    },
  };
}

// MARK: - Structured data

/**
 * Build a JSON-LD structured data payload for the page based on its
 * content kind. Exposed separately so pages can inject it into their
 * layout via a `<script type="application/ld+json">` tag.
 *
 * Kind-specific payloads:
 *   - marketing → WebPage
 *   - faq → FAQPage (caller passes `faqEntries` via `extras`)
 *   - howTo → HowTo (caller passes `howToSteps` via `extras`)
 *   - legal → WebPage with `datePublished`
 *   - article → Article with headline + datePublished
 *   - product / system → WebPage
 */
export function buildStructuredData(
  input: SeoInput,
  extras: {
    faqEntries?: Array<{ question: string; answer: string }>;
    howToSteps?: Array<{ name: string; text: string }>;
    articleAuthor?: string;
  } = {}
): StructuredData {
  const canonical = buildCanonicalUrl(input);

  switch (input.kind) {
    case "faq": {
      const entries = extras.faqEntries ?? [];
      return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: entries.map((e) => ({
          "@type": "Question",
          name: e.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: e.answer,
          },
        })),
        url: canonical,
      };
    }
    case "howTo": {
      const steps = extras.howToSteps ?? [];
      return {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: input.title,
        description: input.description,
        url: canonical,
        step: steps.map((s, idx) => ({
          "@type": "HowToStep",
          position: idx + 1,
          name: s.name,
          text: s.text,
        })),
      };
    }
    case "article": {
      // Prefer explicit publishedAt for the original publication date
      // (schema.org `datePublished`); fall back to lastModified only
      // for legacy callers that haven't migrated yet. `dateModified`
      // is always the latest edit timestamp.
      const datePublished = input.publishedAt ?? input.lastModified;
      const dateModified = input.lastModified ?? input.publishedAt;
      return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: input.title,
        description: input.description,
        url: canonical,
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
        author: {
          "@type": "Organization",
          name: extras.articleAuthor ?? DEFAULT_SITE_NAME,
        },
        publisher: {
          "@type": "Organization",
          name: DEFAULT_SITE_NAME,
        },
      };
    }
    case "legal": {
      return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: input.title,
        description: input.description,
        url: canonical,
        ...(input.lastModified ? { dateModified: input.lastModified } : {}),
      };
    }
    case "marketing":
    case "product":
    case "system":
    default: {
      return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: input.title,
        description: input.description,
        url: canonical,
      };
    }
  }
}
