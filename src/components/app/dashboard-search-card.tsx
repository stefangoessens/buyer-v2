import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ScoreBadge } from "@/components/product/ScoreBadge"

export type DashboardSearchItem = {
  propertyId: string
  address: string
  city: string
  price: number
  score: number
  lastActivity: string
  imageUrl: string
  portal?: string
  summary?: string
  tags?: string[]
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price)
}

export function DashboardSearchCard({ item }: { item: DashboardSearchItem }) {
  return (
    <article className="group overflow-hidden rounded-[28px] border border-border/70 bg-white shadow-[0_14px_34px_rgba(3,14,29,0.06)] transition-all duration-[var(--duration-normal)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(3,14,29,0.12)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-neutral-100">
        <Image
          src={item.imageUrl}
          alt={item.address}
          fill
          sizes="(min-width: 1280px) 360px, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute top-4 right-4">
          <ScoreBadge score={item.score} size="sm" />
        </div>
        {item.portal ? (
          <div className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700 shadow-sm">
            {item.portal}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1">
          <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-neutral-900">
            {item.address}
          </p>
          <p className="text-sm text-neutral-500">{item.city}</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-primary-700">
              {formatPrice(item.price)}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Last activity
            </p>
          </div>
          <div className="max-w-[10rem] text-right text-sm leading-6 text-neutral-500">
            {item.lastActivity}
          </div>
        </div>

        {item.summary ? (
          <p className="text-sm leading-6 text-neutral-600">{item.summary}</p>
        ) : null}

        {item.tags?.length ? (
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/70 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <Button
          asChild
          className="h-10 rounded-xl bg-primary-700 px-4 text-white hover:bg-primary-700/90"
        >
          <Link href={`/property/${item.propertyId}`}>Open deal room</Link>
        </Button>
      </div>
    </article>
  )
}
