export function PropertySkeletonLoader() {
  return (
    <div className="mx-auto max-w-[1248px] px-6 py-8 lg:py-12">
      <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />

      <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="aspect-[16/10] w-full animate-pulse rounded-[24px] bg-neutral-200" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-[16/10] w-full animate-pulse rounded-[20px] bg-neutral-200"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="h-10 w-60 animate-pulse rounded-xl bg-neutral-200" />
          <div className="h-4 w-40 animate-pulse rounded-full bg-neutral-200" />
        </div>
        <div className="h-6 w-28 animate-pulse rounded-full bg-neutral-200" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse rounded-[20px] bg-muted"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      <div className="mt-10 space-y-3">
        <div className="h-5 w-40 animate-pulse rounded-full bg-neutral-200" />
        <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-11/12 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-9/12 animate-pulse rounded-full bg-muted" />
      </div>

      <div className="mt-12 h-[220px] w-full animate-pulse rounded-[24px] bg-muted" />
    </div>
  );
}
