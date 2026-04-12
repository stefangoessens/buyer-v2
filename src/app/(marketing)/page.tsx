"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { HeroSection } from "@/components/marketing/HeroSection";
import { TrustBar } from "@/components/marketing/TrustBar";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";

/* ─── Data ────────────────────────────────────────────────────────────── */

const trustStats = [
  { value: "500+", label: "Buyers served" },
  { value: "$2.1M", label: "Total savings" },
  { value: "4.9\u2605", label: "Buyer rating" },
  { value: "<5s", label: "To first analysis" },
];

const features = [
  {
    imageSrc: "/images/marketing/features/feature-1.png",
    imageAlt: "Paste a listing link and instantly get property data",
    title: "Paste any listing link",
    description: "Drop a Zillow, Redfin, or Realtor.com URL. We instantly pull the property data and start our AI analysis engine.",
  },
  {
    imageSrc: "/images/marketing/features/feature-2.png",
    imageAlt: "AI-powered property analysis dashboard",
    title: "Get AI-powered analysis",
    description: "Fair pricing, comparable sales, leverage signals, risk assessment, and a competitiveness score — all in seconds.",
  },
  {
    imageSrc: "/images/marketing/features/feature-3.png",
    imageAlt: "Expert buyer representation saves you money",
    title: "Save with expert representation",
    description: "Our licensed Florida brokers negotiate on your behalf using AI insights. Average buyer savings: $12,400.",
  },
];

const steps = [
  { number: 1, title: "Paste a link", description: "Copy any listing URL from Zillow, Redfin, or Realtor.com and paste it into our analysis bar." },
  { number: 2, title: "Review your analysis", description: "Get an instant AI-powered report with fair pricing, comps, leverage signals, and a property score." },
  { number: 3, title: "Close with confidence", description: "Connect with a licensed Florida broker who uses your analysis to negotiate the best possible deal." },
];

const testimonials = [
  { quote: "I pasted a Zillow link and within seconds had a full pricing analysis. Saved us $18,000 on our first home in Tampa.", author: "Maria Gonzalez", role: "First-time buyer, Tampa" },
  { quote: "The AI analysis caught overpricing my agent missed. buyer-v2 gave us the confidence to negotiate hard and win.", author: "James Chen", role: "Homebuyer, Miami" },
  { quote: "From paste to close in 23 days. The deal room kept everything organized and our broker was incredible.", author: "Sarah Mitchell", role: "Relocating buyer, Orlando" },
];


const checkSvg = <svg className="size-5 shrink-0 text-primary-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>;

function BentoCard({ src, title, className }: { src: string; title: string; className?: string }) {
  return (
    <div className={`group overflow-hidden rounded-[24px] border border-neutral-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${className ?? ""}`}>
      <div className="relative aspect-[16/10] overflow-hidden bg-neutral-50">
        <Image src={src} alt={title} fill className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]" sizes="(max-width: 640px) 100vw, 60vw" />
      </div>
      <div className="px-6 py-4">
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function Home() {
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = useCallback(async (_url: string) => { setSubmitted(true); }, []);

  const analyzingState = (
    <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/10 px-6 py-4 text-lg font-medium text-white backdrop-blur">
      <svg className="size-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
      Analyzing your property...
    </div>
  );

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <HeroSection>{submitted ? analyzingState : <PasteLinkInput variant="hero" onSubmit={handleSubmit} />}</HeroSection>

      {/* ── Trust Bar ────────────────────────────────────────────────── */}
      <TrustBar stats={trustStats} />

      {/* ── Features (PayFit-style: image cards) ─────────────────────── */}
      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Why buyer-v2</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[40px] lg:leading-[1.2]">How buyer-v2 works for you</h2>
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
          <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-xl">
            <Image
              src="/images/marketing/hero/product-dashboard.png"
              alt="buyer-v2 property analysis dashboard"
              width={1248}
              height={760}
              className="w-full"
              priority
            />
          </div>
        </div>
      </section>

      {/* ── Bento Grid (PayFit-style: image + title cards) ────────── */}
      <section className="w-full bg-neutral-50 pb-20 pt-4 lg:pb-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Everything automated</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[40px] lg:leading-[1.2]">From analysis to closing, every step covered</h2>
            <p className="mt-4 text-lg leading-relaxed text-neutral-500">AI-powered tools that work together to give you an unfair advantage in Florida real estate.</p>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-12">
            {/* Row 1: small + large */}
            <BentoCard src="/images/marketing/bento/bento-1.png" title="Fair pricing engine" className="sm:col-span-5" />
            <BentoCard src="/images/marketing/bento/bento-2.png" title="Automated comp analysis" className="sm:col-span-7" />
            {/* Row 2: large + small */}
            <BentoCard src="/images/marketing/bento/bento-3.png" title="Negotiation leverage" className="sm:col-span-7" />
            <BentoCard src="/images/marketing/bento/bento-4.png" title="Market intelligence" className="sm:col-span-5" />
            {/* Row 3: small + large */}
            <BentoCard src="/images/marketing/bento/bento-5.png" title="Document management" className="sm:col-span-5" />
            <BentoCard src="/images/marketing/bento/bento-6.png" title="Deal room timeline" className="sm:col-span-7" />
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Simple process</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[40px] lg:leading-[1.2]">Three steps to your best deal</h2>
          </div>
          <div className="relative mt-16 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
            <div className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-8 hidden h-px bg-gradient-to-r from-primary-200 via-primary-300 to-primary-200 md:block" />
            {steps.map((step) => (
              <div key={step.number} className="relative text-center">
                <div className="relative mx-auto flex size-16 items-center justify-center rounded-[20px] bg-primary-50 text-2xl font-semibold text-primary-400">{step.number}</div>
                <h3 className="mt-5 text-lg font-semibold text-neutral-800">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{step.description}</p>
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
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[40px] lg:leading-[1.2]">What buyers are saying</h2>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {testimonials.map((t) => <TestimonialCard key={t.author} quote={t.quote} author={t.author} role={t.role} />)}
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
                <div className="text-3xl font-bold tracking-tight text-white lg:text-4xl">{s.value}</div>
                <div className="mt-2 text-sm font-medium text-primary-200/70">{s.label}</div>
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
          <h2 className="text-3xl font-semibold tracking-[-0.003em] text-white lg:text-[40px] lg:leading-[1.2]">Ready to find your Florida home?</h2>
          <p className="mt-4 text-lg text-primary-100/70">Paste a listing link and get your free AI analysis in seconds. No sign-up required.</p>
          <div className="mt-8">{submitted ? analyzingState : <PasteLinkInput variant="hero" onSubmit={handleSubmit} />}</div>
        </div>
      </section>
    </>
  );
}
