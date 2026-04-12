interface TrustBarProps {
  stats: Array<{ value: string; label: string }>;
}

export function TrustBar({ stats }: TrustBarProps) {
  return (
    <section className="w-full border-y border-neutral-200 bg-neutral-50 py-6">
      <div className="mx-auto flex flex-wrap items-center justify-center gap-8 px-6 lg:gap-16">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-2xl font-bold text-primary-700">
              {stat.value}
            </div>
            <div className="text-sm text-neutral-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
