import type { Metadata } from "next";
import Image from "next/image";
import { HeroSection } from "@/components/marketing/HeroSection";
import { TrustBar } from "@/components/marketing/TrustBar";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { HeroInput } from "@/components/marketing/HeroInput";
import { BentoCard } from "@/components/marketing/BentoCard";
import { HomeHowItWorksSection } from "@/components/marketing/sections/HomeHowItWorksSection";
import { HomeComparisonTableSection } from "@/components/marketing/sections/HomeComparisonTableSection";
import { HomeRebateSliderSection } from "@/components/marketing/sections/HomeRebateSliderSection";
import { MarketingStoriesSection } from "@/components/marketing/sections/MarketingStoriesSection";
import { homeHowItWorksStepsForSchema } from "@/content/home-how-it-works";
import {
  SLIDER_DEFAULT_PRICE,
  clampPrice,
} from "@/lib/pricing/rebateIllustration";
import {
  metadataForStaticPage,
  structuredDataForStaticPage,
} from "@/lib/seo/pageDefinitions";
import { resolveSetting } from "@/lib/settings/logic";

/**
 * Resolve a catalog boolean setting via the synchronous default-value
 * path. KIN-1086 uses this for the homepage rebate-slider kill switch.
 * A follow-up card will replace the `undefined` stored-value argument
 * with a Convex-persisted value read; until then ops can flip the
 * default in `src/lib/settings/catalog.ts` to disable the section.
 */
function rolloutFlag(key: string, fallback: boolean): boolean {
  const resolved = resolveSetting(key, undefined);
  if (resolved && resolved.kind === "boolean") return resolved.value;
  return fallback;
}

export const metadata: Metadata = metadataForStaticPage("home");

// Opt into dynamic rendering so the rebate slider can SSR with the
// ?price= query parameter. Without this, Cache Components treats the
// homepage as fully static and searchParams arrives as an empty object.
export const dynamic = "force-dynamic";

/* ─── Data ────────────────────────────────────────────────────────────── */

const trustStats = [
  { value: "500+", label: "Buyers served" },
  { value: "$2.1M", label: "Total savings" },
  { value: "4.9\u2605", label: "Buyer rating" },
  { value: "<5s", label: "To first analysis" },
];

const features = [
  { imageSrc: "/images/marketing/features/feature-1.png", imageAlt: "Paste a listing link and instantly get property data", title: "Paste any listing link", description: "Drop a Zillow, Redfin, or Realtor.com URL. We instantly pull the property data and start our AI analysis engine." },
  { imageSrc: "/images/marketing/features/feature-2.png", imageAlt: "AI-powered property analysis dashboard", title: "Get AI-powered analysis", description: "Fair pricing, comparable sales, leverage signals, risk assessment, and a competitiveness score — all in seconds." },
  { imageSrc: "/images/marketing/features/feature-3.png", imageAlt: "Expert buyer representation saves you money", title: "Save with expert representation", description: "Our licensed Florida brokers negotiate on your behalf using AI insights, so you keep more of your budget for the home." },
];

/* ─── Page (Server Component) ─────────────────────────────────────────── */

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ price?: string }>;
}) {
  const resolvedParams = await searchParams;
  const rawPrice = resolvedParams.price;
  const wasPriceQueryParam =
    typeof rawPrice === "string" && rawPrice.length > 0 && Number.isFinite(Number(rawPrice));
  const parsedInitialPrice = wasPriceQueryParam
    ? clampPrice(Number(rawPrice))
    : SLIDER_DEFAULT_PRICE;

  const homeJsonLd = structuredDataForStaticPage("home", {
    howToSteps: homeHowItWorksStepsForSchema(),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <HeroSection><HeroInput /></HeroSection>

      {/* ── Trust Bar ────────────────────────────────────────────────── */}
      <TrustBar stats={trustStats} />

      {/* ── Rebate Slider (KIN-1086) ─────────────────────────────────── */}
      <HomeRebateSliderSection
        initialPrice={parsedInitialPrice}
        enabled={rolloutFlag("rollout.home_rebate_slider_enabled", true)}
        deepLink={wasPriceQueryParam}
      />

      {/* ── Features (PayFit-style: image cards) ─────────────────────── */}
      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Why buyer-v2</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">How buyer-v2 works for you</h2>
            <p className="mt-4 text-lg leading-relaxed text-neutral-500">From paste to close, we handle every step of your home buying journey with AI precision and human expertise.</p>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((f) => <FeatureCard key={f.title} imageSrc={f.imageSrc} imageAlt={f.imageAlt} title={f.title} description={f.description} />)}
          </div>
        </div>
      </section>

      {/* ── Product Screenshot (full-width like PayFit hero) ──────── */}
      <section className="w-full bg-neutral-50 py-16 lg:py-20">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="overflow-hidden rounded-[24px] border border-neutral-200/80 bg-white shadow-lg">
            <Image
              src="/images/marketing/hero/product-dashboard.png"
              alt="buyer-v2 property analysis dashboard"
              width={1248}
              height={760}
              className="w-full"
              sizes="(max-width: 1280px) 100vw, 1248px"
            />
          </div>
        </div>
      </section>

      {/* ── How we compare (KIN-1084) ─────────────────────────── */}
      <HomeComparisonTableSection />

      {/* ── Bento Grid (PayFit-style: image + title cards) ────────── */}
      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">From analysis to closing, every step covered</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-12">
            <BentoCard
              src="/images/marketing/bento/bento-1.png"
              title="Fair pricing engine"
              description="Instant fair-price ranges and overpay risk, grounded in local comparable sales."
              imageAspectClassName="aspect-[1524/1512]"
              className="md:col-span-5"
              sizes="(max-width: 768px) 100vw, 40vw"
            />
            <BentoCard
              src="/images/marketing/bento/bento-2.png"
              title="Automated comp analysis"
              description="Pulls comps, adjusts for features, and highlights the listings that truly set the market."
              imageAspectClassName="aspect-[2160/1512]"
              className="md:col-span-7"
              sizes="(max-width: 768px) 100vw, 58vw"
            />
            <BentoCard
              src="/images/marketing/bento/bento-3.png"
              title="Negotiation leverage"
              description="Turns data into crisp concession asks, counter offers, and timing advantages."
              imageAspectClassName="aspect-[2160/1512]"
              className="md:col-span-7"
              sizes="(max-width: 768px) 100vw, 58vw"
            />
            <BentoCard
              src="/images/marketing/bento/bento-4.png"
              title="Market intelligence"
              description="Track price drops, days-on-market shifts, and micro-trends as they happen."
              imageAspectClassName="aspect-[1524/1512]"
              className="md:col-span-5"
              sizes="(max-width: 768px) 100vw, 40vw"
            />
            <BentoCard
              src="/images/marketing/bento/bento-5.png"
              title="Document management"
              description="Keep disclosures, PDFs, and revisions organized in one place from offer to close."
              imageAspectClassName="aspect-[1749/1512]"
              className="md:col-span-5"
              sizes="(max-width: 768px) 100vw, 40vw"
            />
            <BentoCard
              src="/images/marketing/bento/bento-6.png"
              title="Deal room timeline"
              description="A single timeline for tasks, deadlines, and broker actions so nothing slips."
              imageAspectClassName="aspect-[2160/1512]"
              className="md:col-span-7"
              sizes="(max-width: 768px) 100vw, 58vw"
            />
          </div>
        </div>
      </section>

      {/* ── How It Works (KIN-1083: 4-step "Every step has an owner") ─ */}
      <HomeHowItWorksSection />

      {/* ── Buyer stories (KIN-1087) — renders null until approved stories land ─ */}
      <MarketingStoriesSection source="home" />

      {/* ── Stats Banner ─────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-gradient-to-r from-primary-700 to-primary-600 py-16 lg:py-20">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-white/[0.04] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-[1248px] px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
            {[{ value: "2% back", label: "Rebate ceiling at closing" }, { value: "23 days", label: "Avg. time to close" }, { value: "98%", label: "Client satisfaction" }, { value: "4.9/5", label: "Average rating" }].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-semibold tracking-tight text-white lg:text-4xl">{s.value}</div>
                <div className="mt-2 text-sm font-medium text-primary-100/80">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-primary-800 py-20 lg:py-28">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.003em] text-white lg:text-[41px] lg:leading-[1.2]">Ready to find your Florida home?</h2>
          <p className="mt-4 text-lg text-primary-100/80">Paste a listing link and get your free AI analysis in seconds. No sign-up required.</p>
          <div className="mt-8"><HeroInput /></div>
        </div>
      </section>
    </>
  );
}
