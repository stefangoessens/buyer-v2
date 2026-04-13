interface StatItem {
  label: string;
  value: string;
}

interface PropertyStatsBarProps {
  stats: StatItem[];
}

export function PropertyStatsBar({ stats }: PropertyStatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-[20px] border border-neutral-200/80 bg-white px-5 py-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {stat.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.003em] text-neutral-800">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
