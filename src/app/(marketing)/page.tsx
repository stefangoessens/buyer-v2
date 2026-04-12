import Image from "next/image";
import { HeroSection } from "@/components/marketing/HeroSection";
import { TrustBar } from "@/components/marketing/TrustBar";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";
import { HeroInput } from "@/components/marketing/HeroInput";

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
  { imageSrc: "/images/marketing/features/feature-3.png", imageAlt: "Expert buyer representation saves you money", title: "Save with expert representation", description: "Our licensed Florida brokers negotiate on your behalf using AI insights. Average buyer savings: $12,400." },
];

const steps = [
  { number: 1, title: "Paste a link", description: "Copy any listing URL from Zillow, Redfin, or Realtor.com and paste it into our analysis bar.", imageSrc: "/images/marketing/steps/step-1.png" },
  { number: 2, title: "Review your analysis", description: "Get an instant AI-powered report with fair pricing, comps, leverage signals, and a property score.", imageSrc: "/images/marketing/steps/step-2.png" },
  { number: 3, title: "Close with confidence", description: "Connect with a licensed Florida broker who uses your analysis to negotiate the best possible deal.", imageSrc: "/images/marketing/steps/step-3.png" },
];

const testimonials = [
  { quote: "I pasted a Zillow link and within seconds had a full pricing analysis. Saved us $18,000 on our first home in Tampa.", author: "Maria Gonzalez", role: "First-time buyer, Tampa", avatarSrc: "/images/marketing/testimonials/testimonial-1.jpg" },
  { quote: "The AI analysis caught overpricing my agent missed. buyer-v2 gave us the confidence to negotiate hard and win.", author: "James Chen", role: "Homebuyer, Miami" },
  { quote: "From paste to close in 23 days. The deal room kept everything organized and our broker was incredible.", author: "Sarah Mitchell", role: "Relocating buyer, Orlando" },
];

/* ─── Bento Card ──────────────────────────────────────────────────────── */

function BentoCard({
  src,
  title,
  description,
  imageAspectClassName,
  className,
  sizes,
}: {
  src: string;
  title: string;
  description: string;
  imageAspectClassName: string;
  className?: string;
  sizes: string;
}) {
  return (
    <div className={`flex h-full flex-col justify-between rounded-[24px] bg-neutral-50 ${className ?? ""}`}>
      <div className="flex flex-col gap-2 p-8 md:p-12">
        <h3 className="text-[30px] font-semibold leading-[36px] tracking-[-0.006em] text-neutral-800">
          {title}
        </h3>
        <p className="text-[16px] font-normal leading-[1.5] text-neutral-500 md:text-[18px] md:leading-[27px]">
          {description}
        </p>
      </div>
      <div className={`relative w-full overflow-hidden rounded-b-[24px] ${imageAspectClassName}`}>
        <div className="absolute inset-0 px-8 pb-8 pt-12 md:px-10 md:pb-10 md:pt-16">
          <div className="relative h-full w-full">
            <Image src={src} alt={title} fill className="object-contain object-bottom" sizes={sizes} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Page (Server Component) ─────────────────────────────────────────── */

export default function Home() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <HeroSection><HeroInput /></HeroSection>

      {/* ── Trust Bar ────────────────────────────────────────────────── */}
      <TrustBar stats={trustStats} />

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

      {/* ── How It Works (PayFit-style: number + title + desc + phone mockup) */}
      <section id="how-it-works" className="scroll-mt-[84px] w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Simple process</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">Three steps to your best deal</h2>
          </div>
          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {steps.map((step) => (
              <div key={step.number} className="group text-center">
                {/* Step number */}
                <p className="text-sm font-bold text-primary-400">{step.number}</p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-800">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{step.description}</p>
                {/* Phone mockup image */}
                <div className="mt-6 overflow-hidden rounded-[24px] border border-neutral-200 bg-neutral-50 transition-shadow duration-300 group-hover:shadow-lg">
                  <div className="relative aspect-[3/4]">
                    <Image src={step.imageSrc} alt="" fill className="object-cover object-top" sizes="(max-width: 768px) 100vw, 33vw" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section className="w-full bg-neutral-50 py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Social proof</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">What buyers are saying</h2>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {testimonials.map((t) => <TestimonialCard key={t.author} quote={t.quote} author={t.author} role={t.role} avatarSrc={t.avatarSrc} />)}
          </div>
        </div>
      </section>

      {/* ── Stats Banner ─────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-gradient-to-r from-primary-700 to-primary-600 py-16 lg:py-20">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-white/[0.04] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-[1248px] px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
            {[{ value: "$12,400", label: "Avg. buyer savings" }, { value: "23 days", label: "Avg. time to close" }, { value: "98%", label: "Client satisfaction" }, { value: "4.9/5", label: "Average rating" }].map((s) => (
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
