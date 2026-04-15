import Image from "next/image";

interface HeroSectionProps {
  children?: React.ReactNode;
}

export function HeroSection({ children }: HeroSectionProps) {
  return (
    <section className="relative w-full overflow-hidden bg-[#FCFBFF]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_20%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
      </div>

      <div className="relative mx-auto max-w-[1248px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-xl lg:max-w-[560px]">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
              <span className="inline-block size-1.5 rounded-full bg-primary-400" />
              Florida-exclusive buyer brokerage
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
              Get the best deal on your{" "}
              <span className="text-primary-700">Florida home</span>
            </h1>
            <p className="mt-6 text-[18px] leading-[1.5] text-neutral-500">
              Paste a Zillow, Redfin, or Realtor link. Get instant AI-powered analysis, fair pricing, and expert buyer representation, completely free.
            </p>
            <div id="hero-intake" className="mt-8 scroll-mt-24">{children}</div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-500">
              {["500+ buyers served", "$2.1M total savings", "Analysis in <5s"].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <svg className="size-4 shrink-0 text-primary-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Hosman-like rounded-right media shape */}
          <div className="pointer-events-none relative mt-12 hidden shrink-0 lg:block" aria-hidden="true">
            <div className="relative ml-auto h-[550px] w-[490px] overflow-hidden rounded-t-full bg-primary-700">
              {/* 2px inset reveals the indigo stroke around the curve (Hosman uses a tiny top offset + right stripe). */}
              <div className="absolute inset-[2px] pr-3">
                <div className="relative h-full w-full overflow-hidden rounded-t-full bg-white">
                  <Image
                    src="/images/marketing/bento/bento-2.png"
                    alt="buyer-v2 in action"
                    fill
                    priority
                    className="object-cover object-center"
                    sizes="(min-width: 1024px) 490px, 0px"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
