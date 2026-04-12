"use client";

import { useCallback, useState } from "react";
import { HeroSection } from "@/components/marketing/HeroSection";
import { TrustBar } from "@/components/marketing/TrustBar";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";

const trustStats = [
  { value: "500+", label: "Buyers served" },
  { value: "$2.1M", label: "Total savings" },
  { value: "4.9\u2605", label: "Buyer rating" },
  { value: "<5s", label: "To first analysis" },
];

const features = [
  {
    icon: (<svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-1.027a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364l1.757 1.757" /></svg>),
    title: "Paste any listing link",
    description: "Drop a Zillow, Redfin, or Realtor.com URL. We instantly pull the property data and start our AI analysis engine.",
  },
  {
    icon: (<svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>),
    title: "Get AI-powered analysis",
    description: "Fair pricing, comparable sales, leverage signals, risk assessment, and a competitiveness score — all in seconds.",
  },
  {
    icon: (<svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>),
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

const showcaseItems = [
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>), title: "Fair pricing engine", desc: "Automated comp analysis from MLS data", bg: "bg-primary-50", fg: "text-primary-600" },
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>), title: "Local market intelligence", desc: "Florida-specific insights and trends", bg: "bg-accent-50", fg: "text-accent-600" },
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>), title: "Risk assessment", desc: "Due diligence and red flag detection", bg: "bg-warning-50", fg: "text-warning-700" },
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>), title: "AI recommendations", desc: "Smart negotiation strategy suggestions", bg: "bg-success-50", fg: "text-success-700" },
];

const dealRoomItems = [
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>), title: "Document hub", desc: "All files organized in one place", bg: "bg-primary-50", fg: "text-primary-600" },
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>), title: "Broker chat", desc: "Direct communication with your agent", bg: "bg-accent-50", fg: "text-accent-600" },
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>), title: "Deal timeline", desc: "Track every milestone to closing", bg: "bg-success-50", fg: "text-success-700" },
  { icon: (<svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>), title: "Smart alerts", desc: "Never miss a deadline or update", bg: "bg-warning-50", fg: "text-warning-700" },
];

const checkSvg = <svg className="size-5 shrink-0 text-primary-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>;

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
      {/* Hero */}
      <HeroSection>{submitted ? analyzingState : <PasteLinkInput variant="hero" onSubmit={handleSubmit} />}</HeroSection>

      {/* Trust Bar */}
      <TrustBar stats={trustStats} />

      {/* Features */}
      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Why buyer-v2</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-800 lg:text-4xl">How buyer-v2 works for you</h2>
            <p className="mt-4 text-lg leading-relaxed text-neutral-500">From paste to close, we handle every step of your home buying journey with AI precision and human expertise.</p>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((f) => <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />)}
          </div>
        </div>
      </section>

      {/* Showcase */}
      <section className="w-full bg-neutral-50 py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] space-y-20 px-6 lg:space-y-28">
          {/* AI Analysis */}
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">AI Analysis</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-neutral-800 lg:text-3xl">Instant property intelligence</h3>
              <p className="mt-4 text-lg leading-relaxed text-neutral-500">Our AI engine analyzes every listing in real-time — pulling comparable sales, market trends, and pricing signals to give you a complete picture before you even schedule a tour.</p>
              <ul className="mt-6 space-y-3">
                {["Fair market value with confidence score", "5-year comparable sales analysis", "Neighborhood trend data and forecasts", "Negotiation leverage indicators"].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-neutral-600">{checkSvg}{item}</li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {showcaseItems.map((c) => (
                <div key={c.title} className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm transition-shadow duration-[250ms] hover:shadow-md">
                  <div className={`flex size-10 items-center justify-center rounded-xl ${c.bg} ${c.fg}`}>{c.icon}</div>
                  <p className="mt-3 text-sm font-semibold text-neutral-800">{c.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Deal Room */}
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="order-2 grid grid-cols-2 gap-4 lg:order-1">
              {dealRoomItems.map((c) => (
                <div key={c.title} className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm transition-shadow duration-[250ms] hover:shadow-md">
                  <div className={`flex size-10 items-center justify-center rounded-xl ${c.bg} ${c.fg}`}>{c.icon}</div>
                  <p className="mt-3 text-sm font-semibold text-neutral-800">{c.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{c.desc}</p>
                </div>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Deal Room</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-neutral-800 lg:text-3xl">Your command center for every deal</h3>
              <p className="mt-4 text-lg leading-relaxed text-neutral-500">Every property you analyze gets its own private deal room. Track documents, communicate with your broker, monitor timelines, and never miss a deadline.</p>
              <ul className="mt-6 space-y-3">
                {["Private deal room per property", "Real-time document management", "Integrated broker communication", "Milestone tracking to close"].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-neutral-600">{checkSvg}{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Simple process</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-800 lg:text-4xl">Three steps to your best deal</h2>
          </div>
          <div className="relative mt-16 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
            <div className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-8 hidden h-px bg-gradient-to-r from-primary-200 via-primary-300 to-primary-200 md:block" />
            {steps.map((step) => (
              <div key={step.number} className="relative text-center">
                <div className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary-50 text-2xl font-bold text-primary-400">{step.number}</div>
                <h3 className="mt-5 text-lg font-semibold text-neutral-800">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="w-full bg-neutral-50 py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Social proof</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-800 lg:text-4xl">What buyers are saying</h2>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {testimonials.map((t) => <TestimonialCard key={t.author} quote={t.quote} author={t.author} role={t.role} />)}
          </div>
        </div>
      </section>

      {/* Stats Banner */}
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

      {/* Final CTA */}
      <section className="relative w-full overflow-hidden bg-primary-800 py-20 lg:py-28">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white lg:text-4xl">Ready to find your Florida home?</h2>
          <p className="mt-4 text-lg text-primary-100/70">Paste a listing link and get your free AI analysis in seconds. No sign-up required.</p>
          <div className="mt-8">{submitted ? analyzingState : <PasteLinkInput variant="hero" onSubmit={handleSubmit} />}</div>
        </div>
      </section>
    </>
  );
}
