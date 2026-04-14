import { HeroInput } from "@/components/marketing/HeroInput";

export function FinalCtaSection() {
  return (
    <section className="relative w-full overflow-hidden bg-primary-800 py-20 lg:py-28">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute -left-32 top-0 h-80 w-80 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-white/[0.04] blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary-100/80">
          Get started
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-white lg:text-[41px] lg:leading-[1.2]">
          Ready to keep more of your equity?
        </h2>
        <p className="mt-4 text-lg text-primary-100/80">
          Paste a Zillow, Redfin, or Realtor.com link. We&apos;ll have your free
          analysis and deal room ready in seconds — no sign-up, no card, no
          commitment.
        </p>
        <div className="mt-8">
          <HeroInput />
        </div>
      </div>
    </section>
  );
}
