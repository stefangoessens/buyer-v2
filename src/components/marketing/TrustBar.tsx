import Image from "next/image";

interface TrustBarProps {
  stats: Array<{ value: string; label: string }>;
}

/* PayFit star icon — extracted from payfit.com via Chrome DevTools */
function StarIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 20 20" className={className}>
      <path fill="currentColor" d="m10 14.392 5.15 3.108-1.367-5.858 4.55-3.942-5.991-.508L10 1.667 7.658 7.192 1.667 7.7l4.55 3.942L4.85 17.5z" />
    </svg>
  );
}

export function TrustBar({ stats }: TrustBarProps) {
  return (
    <section className="w-full bg-white py-8 lg:py-10">
      <div className="mx-auto max-w-[1248px] px-6">
        {/* Stats row */}
        <div className="flex flex-wrap items-center justify-center gap-y-4 divide-neutral-200 sm:divide-x">
          {stats.map((stat) => (
            <div key={stat.label} className="flex-1 basis-[140px] px-6 py-1 text-center lg:px-10">
              <div className="text-2xl font-bold tracking-tight text-primary-700 lg:text-3xl">{stat.value}</div>
              <div className="mt-1 text-sm font-medium text-neutral-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Trust logos + rating */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 border-t border-neutral-200 pt-8">
          {/* Star rating (PayFit/Trustpilot pattern) */}
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5" role="img" aria-label="4.9 out of 5 stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <StarIcon key={i} className="size-5 text-warning-500" />
              ))}
            </div>
            <span className="text-sm font-semibold text-neutral-800">4.9/5</span>
            <span className="text-xs text-neutral-400">from 500+ reviews</span>
          </div>

          <div className="hidden h-6 w-px bg-neutral-200 sm:block" />

          {/* Review platform logo */}
          <div className="flex items-center gap-3">
            <Image src="/images/marketing/trust/capterra.svg" alt="Capterra" width={80} height={20} className="opacity-60 grayscale" />
          </div>

          <div className="hidden h-6 w-px bg-neutral-200 sm:block" />

          {/* Client logo */}
          <div className="flex items-center gap-3">
            <Image src="/images/marketing/trust/client-logo.webp" alt="Client" width={80} height={24} className="opacity-50 grayscale" />
          </div>

          <div className="h-6 w-px bg-neutral-200 hidden sm:block" />

          {/* Platform logos as text (will be replaced) */}
          {["Zillow", "Redfin", "Realtor.com"].map((name) => (
            <span key={name} className="hidden text-sm font-semibold text-neutral-300 sm:inline">{name}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
