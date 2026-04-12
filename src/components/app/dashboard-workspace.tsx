"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput"
import { DashboardEmptyState } from "@/components/app/dashboard-empty-state"
import {
  DashboardSearchCard,
  type DashboardSearchItem,
} from "@/components/app/dashboard-search-card"
import { KPICard } from "@/components/product/KPICard"
import { buildLinkedSearch } from "@/lib/onboarding/validation"
import {
  readBuyerSession,
  upsertSearchInSession,
  writeBuyerSession,
} from "@/lib/onboarding/storage"
import type { BuyerSession } from "@/lib/onboarding/types"

function toDashboardItem(search: BuyerSession["firstSearch"]): DashboardSearchItem {
  return {
    propertyId: search.propertyId,
    address: search.address,
    city: search.city,
    price: search.price,
    score: search.score,
    lastActivity: search.lastActivity,
    imageUrl: search.imageUrl,
    portal: search.portal,
    summary: search.summary,
    tags: [
      search.status.replace(/_/g, " "),
      "Registered access",
    ],
  }
}

function statsForSession(session: BuyerSession) {
  const bestScore = session.searches.reduce(
    (best, search) => Math.max(best, search.score),
    0,
  )

  return [
    {
      label: "Tracked deal rooms",
      value: session.searches.length,
      description: "Searches kept inside this buyer session",
    },
    {
      label: "Best score",
      value: `${bestScore.toFixed(1)}/10`,
      description: "Top competitiveness signal in your current pipeline",
    },
    {
      label: "Preferred areas",
      value: session.buyerBasics.preferredAreas.split(",").length,
      description: session.buyerBasics.preferredAreas,
    },
  ]
}

function formatCurrency(value: number | null) {
  if (value == null) return "Not set"

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function DashboardWorkspace() {
  const router = useRouter()
  const [session, setSession] = useState<BuyerSession | null>(null)
  const [submittedUrl, setSubmittedUrl] = useState("")

  useEffect(() => {
    const currentSession = readBuyerSession()
    if (!currentSession) {
      router.replace("/onboarding")
      return
    }

    setSession(currentSession)
  }, [router])

  const dashboardCards = useMemo(
    () => session?.searches.map(toDashboardItem) ?? [],
    [session],
  )

  const dashboardStats = useMemo(
    () => (session ? statsForSession(session) : []),
    [session],
  )

  const latestSearch = session?.searches[0] ?? null
  const hasSearches = (session?.searches.length ?? 0) > 0

  function handlePaste(url: string) {
    setSubmittedUrl(url)

    if (!session) return

    const linkedSearch = buildLinkedSearch(url)
    if (!linkedSearch) return

    const nextSession = upsertSearchInSession(session, linkedSearch)
    writeBuyerSession(nextSession)
    setSession(nextSession)
  }

  if (!session) {
    return (
      <div className="space-y-6 xl:space-y-8">
        <div className="h-40 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-[24px] bg-white/80 shadow-sm"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 xl:space-y-8">
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.38fr)_minmax(320px,0.62fr)]">
        <div className="overflow-hidden rounded-[32px] border border-white/75 bg-white/90 p-6 shadow-[0_20px_60px_rgba(3,14,29,0.08)] sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary-700">
              Onboarding
            </span>
            <span className="rounded-full border border-success-100 bg-success-50 px-3 py-1 text-xs font-medium text-success-700">
              Access gated and broker-ready
            </span>
          </div>

          <div className="mt-6 max-w-2xl">
            <h1 className="text-[clamp(2.25rem,4vw,3.25rem)] font-semibold leading-[1.15] tracking-[-0.006em] text-neutral-900">
              Welcome back, {session.buyerName.split(" ")[0] || "buyer"}.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-neutral-500 sm:text-lg">
              Paste a listing and we’ll attach it to the same buyer session that
              came out of onboarding. Your dashboard, first property, and
              registered access stay in sync.
            </p>
          </div>

          <div className="mt-8">
            <PasteLinkInput
              variant="hero"
              onSubmit={handlePaste}
              placeholder="Paste a Zillow, Redfin, or Realtor.com link..."
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {dashboardStats.map((item) => (
              <KPICard
                key={item.label}
                label={item.label}
                value={item.value}
                description={item.description}
              />
            ))}
          </div>

          {latestSearch ? (
            <div className="mt-6 rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFD_100%)] px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Active thread
                  </p>
                  <p className="mt-2 text-base font-semibold tracking-tight text-neutral-900">
                    {latestSearch.address}
                  </p>
                </div>
                <div className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                  {latestSearch.lastActivity}
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-500">
                {latestSearch.summary}
              </p>
            </div>
          ) : null}

          {submittedUrl ? (
            <div className="mt-6 rounded-[24px] border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">
              <span className="font-semibold">Queued:</span>{" "}
              {submittedUrl}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-[32px] border border-white/75 bg-[linear-gradient(180deg,#FFFFFF_0%,#F7F9FD_100%)] p-6 shadow-[0_16px_42px_rgba(3,14,29,0.08)] sm:p-7">
          {hasSearches && latestSearch ? (
            <>
              <div className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_10px_24px_rgba(3,14,29,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  Session overview
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900">
                  Buyer profile synced
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-500">
                  This workspace is now tied to {session.buyerName}, with the first linked property and buyer preferences carried over from onboarding.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: "Budget",
                      value: `${formatCurrency(session.buyerBasics.budgetMin)} - ${formatCurrency(session.buyerBasics.budgetMax)}`,
                    },
                    {
                      label: "Financing",
                      value: session.buyerBasics.financing.replace("_", " / "),
                    },
                    {
                      label: "Timeline",
                      value: session.buyerBasics.timeline.replace(/_/g, " "),
                    },
                    {
                      label: "Areas",
                      value: session.buyerBasics.preferredAreas,
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-neutral-700">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-primary-100 bg-[radial-gradient(circle_at_top_left,rgba(15,111,222,0.08),transparent_55%),linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-500">
                      First linked property
                    </p>
                    <p className="mt-2 text-lg font-semibold tracking-tight text-neutral-900">
                      {latestSearch.address}
                    </p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary-700 shadow-sm">
                    {latestSearch.portal}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-neutral-500">
                  {latestSearch.summary}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] bg-white px-4 py-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      Price
                    </p>
                    <p className="mt-2 text-base font-semibold text-neutral-900">
                      {formatCurrency(latestSearch.price)}
                    </p>
                  </div>
                  <div className="rounded-[18px] bg-white px-4 py-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      Status
                    </p>
                    <p className="mt-2 text-base font-semibold text-neutral-900">
                      {latestSearch.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <DashboardEmptyState />
              <div className="rounded-[22px] border border-neutral-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Session context
                </p>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  First property:{" "}
                  <span className="font-medium text-neutral-900">
                    {session.firstSearch.address}
                  </span>
                </p>
                <p className="mt-1 text-sm leading-6 text-neutral-600">
                  Timeline:{" "}
                  <span className="font-medium text-neutral-900">
                    {session.buyerBasics.timeline.replace(/_/g, " ")}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400">
              Your searches
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[2.1rem]">
              Recent property threads
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-neutral-500">
            Every card below is driven from the same persisted onboarding and
            dashboard session data. Nothing here is a disconnected placeholder
            anymore.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dashboardCards.map((item) => (
            <DashboardSearchCard key={item.address} item={item} />
          ))}
        </div>
      </section>
    </div>
  )
}
