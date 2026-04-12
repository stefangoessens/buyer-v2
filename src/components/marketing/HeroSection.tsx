interface HeroSectionProps {
  children?: React.ReactNode;
}

function PropertyMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div className="absolute -inset-8 rounded-[32px] bg-primary-400/15 blur-3xl" />
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white shadow-2xl">
        <div className="relative h-40 overflow-hidden bg-gradient-to-br from-primary-100 via-accent-50 to-primary-50">
          <svg className="absolute bottom-0 left-1/2 -translate-x-1/2 text-primary-700 opacity-[0.08]" width="220" height="130" viewBox="0 0 220 130" fill="currentColor" aria-hidden="true">
            <path d="M110 10L20 75V130H85V95H135V130H200V75L110 10Z" />
            <rect x="55" y="85" width="20" height="25" rx="2" opacity="0.5" />
            <rect x="145" y="85" width="20" height="25" rx="2" opacity="0.5" />
          </svg>
          <div className="absolute bottom-3 left-3 flex gap-1.5">
            {["3 beds", "2 baths", "1,850 sqft"].map((label) => (
              <span key={label} className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-primary-700 shadow-sm backdrop-blur-sm">{label}</span>
            ))}
          </div>
          <div className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-xl bg-white/90 shadow-sm backdrop-blur-sm">
            <span className="text-sm font-bold text-success-700">9.2</span>
          </div>
        </div>
        <div className="p-5">
          <h3 className="text-base font-semibold text-neutral-800">123 Oceanview Drive</h3>
          <p className="mt-0.5 text-sm text-neutral-500">Miami Beach, FL 33139</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-800">$485,000</span>
            <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-semibold text-success-700">Fair Value</span>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-neutral-500">Market Position</span>
                <span className="font-semibold text-neutral-700">87%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full w-[87%] rounded-full bg-gradient-to-r from-primary-400 to-primary-300" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-neutral-500">Negotiation Leverage</span>
                <span className="font-semibold text-accent-600">High</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-accent-500 to-accent-400" />
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">AI Insights</p>
            <div className="mt-2 space-y-1.5">
              {["Priced 3.2% below market", "Strong negotiation leverage", "5 comparable sales found"].map((text) => (
                <div key={text} className="flex items-center gap-2 text-xs text-neutral-600">
                  <svg className="size-3.5 shrink-0 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-4 -top-3 rounded-xl border border-neutral-100 bg-white px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-success-500" />
          </span>
          <span className="text-xs font-medium text-neutral-700">Analysis Complete</span>
        </div>
      </div>
      <div className="absolute -bottom-3 -left-6 rounded-xl border border-neutral-100 bg-white px-3.5 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-success-50">
            <svg className="size-3.5 text-success-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <span className="text-sm font-bold text-success-700">$18,400</span>
            <span className="ml-1 text-xs text-neutral-500">savings</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroSection({ children }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-[#042445] to-primary-800">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary-400/[0.07] blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-accent-500/[0.04] blur-[80px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>
      <div className="relative mx-auto max-w-[1248px] px-6 pb-32 pt-16 lg:px-8 lg:pb-36 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_420px] lg:gap-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-primary-100 backdrop-blur-sm">
              <span className="inline-block size-1.5 rounded-full bg-accent-400" />
              Florida-exclusive buyer brokerage
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.006em] text-white sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
              Get the best deal on your{" "}
              <span className="bg-gradient-to-r from-accent-300 to-accent-500 bg-clip-text text-transparent">Florida home</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-100/80">
              Paste a Zillow, Redfin, or Realtor link. Get instant AI-powered analysis, fair pricing, and expert buyer representation — completely free.
            </p>
            <div className="mt-8 max-w-xl">{children}</div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-primary-100/80">
              {["500+ buyers served", "$2.1M total savings", "Analysis in <5s"].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <svg className="size-4 shrink-0 text-accent-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                  {text}
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block"><PropertyMockup /></div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0">
        <svg className="block w-full" viewBox="0 0 1440 48" fill="none" preserveAspectRatio="none" style={{ height: 48 }}>
          <path d="M0 48V20C360 0 720 0 1080 20C1260 36 1380 48 1440 48H0Z" fill="var(--color-neutral-50)" />
        </svg>
      </div>
    </section>
  );
}
