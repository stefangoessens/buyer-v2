import { cn } from "@/lib/utils"

function EmptySpark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="size-6" aria-hidden="true">
      <path
        d="M24 6.5 26.9 19.1 39.5 22 26.9 24.9 24 37.5 21.1 24.9 8.5 22 21.1 19.1 24 6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DashboardEmptyState() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8F9FC_100%)] p-6 shadow-[0_16px_36px_rgba(3,14,29,0.06)]">
      <div className="flex items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,rgba(15,111,222,0.14)_0%,rgba(51,212,193,0.16)_100%)] text-primary-700">
          <EmptySpark />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400">
            Empty state
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
            No searches saved yet
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-neutral-500">
            Paste a Zillow, Redfin, or Realtor.com link to create your first search thread. We’ll turn it into a deal room with price signals, score context, and next steps.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          "Instant property match",
          "Broker-ready scorecard",
          "Saved to your workspace",
        ].map((item) => (
          <div
            key={item}
            className={cn(
              "rounded-[18px] border border-border/70 bg-white px-4 py-3 text-sm font-medium text-neutral-700 shadow-sm",
            )}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
