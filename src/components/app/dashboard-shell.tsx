import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type NavIconProps = {
  className?: string
}

function HomeIcon({ className }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.25a.75.75 0 0 1-.75-.75V15a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v5.25a.75.75 0 0 1-.75.75H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ReportIcon({ className }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 4.75h10a1 1 0 0 1 1 1V19l-3.25-2.5L11.5 19l-3.25-2.5L5 19V5.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.75 9.25h6.5M8.75 12.5h6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CompareIcon({ className }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 6h5a2 2 0 0 1 2 2v3M15 18H10a2 2 0 0 1-2-2v-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 9.5 4 12.5 7 15.5M17 8.5 20 11.5 17 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StarIcon({ className }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m12 4.75 2.43 4.92 5.43.79-3.93 3.83.93 5.41L12 16.94 7.14 19.7l.93-5.41-3.93-3.83 5.43-.79L12 4.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SettingsIcon({ className }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M10.3 4.7a2 2 0 0 1 3.4 0l.24.4a2 2 0 0 0 1.73.99h.46a2 2 0 0 1 1.95 2.45l-.08.44a2 2 0 0 0 .49 1.73l.33.33a2 2 0 0 1 0 2.82l-.33.33a2 2 0 0 0-.49 1.73l.08.44a2 2 0 0 1-1.95 2.45h-.46a2 2 0 0 0-1.73.99l-.24.4a2 2 0 0 1-3.4 0l-.24-.4a2 2 0 0 0-1.73-.99h-.46a2 2 0 0 1-1.95-2.45l.08-.44a2 2 0 0 0-.49-1.73l-.33-.33a2 2 0 0 1 0-2.82l.33-.33a2 2 0 0 0 .49-1.73l-.08-.44a2 2 0 0 1 1.95-2.45h.46a2 2 0 0 0 1.73-.99l.24-.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

const navigation = [
  { label: "Home", href: "/dashboard", icon: HomeIcon, active: true },
  { label: "Reports", href: "/dashboard?view=reports", icon: ReportIcon },
  { label: "Compare", href: "/dashboard?view=compare", icon: CompareIcon },
  { label: "Favourites", href: "/dashboard?view=favourites", icon: StarIcon },
  { label: "Profile settings", href: "/dashboard?view=settings", icon: SettingsIcon },
] as const satisfies ReadonlyArray<{
  label: string
  href: string
  icon: (props: NavIconProps) => ReactNode
  active?: boolean
}>

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0F6FDE_0%,#052D5B_100%)] text-white shadow-[0_14px_32px_rgba(5,45,91,0.35)]">
        <span className="text-sm font-semibold">b</span>
      </div>
      <div>
        <p className="text-base font-semibold tracking-tight text-white">buyer-v2</p>
        <p className="text-sm text-primary-100/70">Buyer workspace</p>
      </div>
    </div>
  )
}

function SidebarNav({
  compact = false,
}: {
  compact?: boolean
}) {
  return (
    <nav className={cn("space-y-1", compact && "flex gap-2 overflow-x-auto pb-1 whitespace-nowrap")}>
      {navigation.map((item) => {
        const Icon = item.icon
        const isActive = "active" in item && item.active === true
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 rounded-[18px] border border-transparent px-4 py-3 text-sm font-medium transition-all duration-[var(--duration-fast)]",
              isActive
                ? "border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-primary-100/70 hover:border-white/10 hover:bg-white/5 hover:text-white",
              compact && "shrink-0 px-3 py-2",
            )}
          >
            <Icon
              className={cn(
                "size-5 shrink-0",
                isActive ? "text-white" : "text-primary-100/70 group-hover:text-white",
              )}
            />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(15,111,222,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,107,74,0.08),transparent_28%),linear-gradient(180deg,#F8F9FC_0%,#F3F6FB_100%)] text-neutral-800">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-[292px] shrink-0 p-4 xl:block">
          <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,45,91,0.98)_0%,rgba(3,14,29,0.94)_100%)] px-4 py-5 shadow-[0_30px_80px_rgba(3,14,29,0.2)] backdrop-blur-2xl">
            <BrandMark />
            <div className="mt-8">
              <p className="px-4 text-xs font-semibold uppercase tracking-[0.24em] text-primary-100/45">
                Workspace
              </p>
              <div className="mt-3">
                <SidebarNav />
              </div>
            </div>

            <div className="mt-auto rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-100/50">
                Onboarding
              </p>
              <p className="mt-2 text-sm leading-6 text-white/90">
                Paste your first listing to unlock a deal room, scorecard, and broker review.
              </p>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div className="h-full w-1/4 rounded-full bg-[linear-gradient(90deg,#33D4C1_0%,#0F6FDE_100%)]" />
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-h-screen flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          <div className="mx-auto w-full max-w-[1440px]">
            <div className="mb-4 rounded-[28px] border border-white/70 bg-white/80 px-4 py-4 shadow-[0_14px_38px_rgba(3,14,29,0.06)] backdrop-blur-xl xl:hidden">
              <div className="flex items-center justify-between gap-4">
                <BrandMark />
                <div className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                  Guided workspace
                </div>
              </div>
              <div className="mt-4">
                <SidebarNav compact />
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
