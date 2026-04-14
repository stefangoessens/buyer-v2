/**
 * Skeleton rendered while `adminShell.getCurrentSession` is in flight.
 * Matches the sidebar + topbar structure of the real shell so the layout
 * does not jump when the query resolves.
 */
export function ShellLoadingState() {
  return (
    <div
      className="flex min-h-screen bg-muted"
      role="status"
      aria-live="polite"
      aria-label="Loading internal console"
    >
      <aside className="hidden w-64 shrink-0 border-r border-border bg-white md:flex md:flex-col">
        <div className="h-16 border-b border-border px-6" />
        <div className="flex-1 space-y-2 px-4 py-6">
          <div className="h-4 w-32 animate-pulse rounded bg-neutral-200" />
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-16 border-b border-border bg-white" />
        <div className="px-8 py-8">
          <div className="h-6 w-48 animate-pulse rounded bg-neutral-200" />
          <div className="mt-4 h-24 w-full max-w-2xl animate-pulse rounded bg-muted" />
        </div>
      </div>
      <span className="sr-only">Loading internal console…</span>
    </div>
  );
}
