export function FaqHeroSection() {
  return (
    <section className="relative w-full overflow-hidden bg-[#FCFBFF]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_20%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(720px_480px_at_90%_18%,#F1ECFF_0%,rgba(252,251,255,0)_55%)]" />
      </div>

      <div className="relative mx-auto max-w-[1248px] px-6 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-neutral-200/80">
            <span className="inline-block size-1.5 rounded-full bg-primary-400" />
            FAQ
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
            Common questions
          </h1>
          <p className="mt-6 text-[18px] leading-[1.5] text-neutral-500">
            How buyer-v2 works, what we rebate, and how your deal gets from a
            pasted link to a closed home — grouped by where you are in the
            journey.
          </p>
          <p className="mt-4 text-sm text-neutral-400">
            Tip: use <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 ring-1 ring-neutral-200">⌘F</kbd> to search this page, or jump to a stage below.
          </p>
        </div>
      </div>
    </section>
  );
}
