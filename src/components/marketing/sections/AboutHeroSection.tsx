import Image from "next/image";
import type { AboutHeroContent } from "@/content/about";

export function AboutHeroSection({ hero }: { hero: AboutHeroContent }) {
  return (
    <section className="relative w-full overflow-hidden bg-[#FCFBFF]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_20%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(720px_480px_at_90%_18%,#F1ECFF_0%,rgba(252,251,255,0)_55%)]" />
      </div>

      <div className="relative mx-auto max-w-[1248px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-xl lg:max-w-[560px]">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
              <span className="inline-block size-1.5 rounded-full bg-primary-400" />
              {hero.eyebrow}
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
              {hero.title}
            </h1>
            <p className="mt-6 text-[18px] leading-[1.5] text-neutral-500">
              {hero.description}
            </p>

            <div className="mt-8 rounded-2xl border border-primary-100 bg-white/80 p-6 shadow-sm backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
                Our mission
              </p>
              <p className="mt-3 text-base leading-relaxed text-neutral-700">
                {hero.mission}
              </p>
            </div>
          </div>

          <div
            className="pointer-events-none relative mt-12 hidden shrink-0 lg:block"
            aria-hidden="true"
          >
            <div className="relative ml-auto h-[550px] w-[490px] overflow-hidden rounded-t-full bg-primary-700">
              <div className="absolute inset-[2px] pr-3">
                <div className="relative h-full w-full overflow-hidden rounded-t-full bg-white">
                  <Image
                    src={hero.imageSrc}
                    alt={hero.imageAlt}
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
