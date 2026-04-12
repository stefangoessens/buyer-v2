interface TrustBarProps {
  stats: Array<{ value: string; label: string }>;
}

export function TrustBar({ stats }: TrustBarProps) {
  return (
    <section className="w-full bg-neutral-50 py-8 lg:py-10">
      <div className="mx-auto max-w-[1248px] px-6">
        <div className="flex flex-wrap items-center justify-center gap-y-4 divide-neutral-200 sm:divide-x">
          {stats.map((stat) => (
            <div key={stat.label} className="flex-1 basis-[140px] px-6 py-1 text-center lg:px-10">
              <div className="text-2xl font-bold tracking-tight text-primary-700 lg:text-3xl">{stat.value}</div>
              <div className="mt-1 text-sm font-medium text-neutral-500">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-t border-neutral-200 pt-8">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Trusted by buyers across Florida</p>
          {["Zillow", "Redfin", "Realtor.com", "MLS"].map((name) => (
            <div key={name} className="flex h-8 items-center rounded-md px-3 text-sm font-semibold tracking-wide text-neutral-300">{name}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
