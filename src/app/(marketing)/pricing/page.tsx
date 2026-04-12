import Link from "next/link";
import { PageHeader } from "@/components/marketing/PageHeader";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const tiers = [
  {
    name: "Starter",
    price: "$0",
    cadence: "to start",
    description: "Instant analysis and a clear plan before you ever talk to an agent.",
    highlights: ["AI pricing + comps", "Overpay risk score", "Neighborhood insights"],
    cta: { label: "Get free analysis", href: "/get-started" },
    featured: false,
  },
  {
    name: "Representation",
    price: "Free",
    cadence: "until closing",
    description: "Licensed Florida buyer representation powered by your analysis.",
    highlights: ["Offer strategy + negotiation", "Broker-led coordination", "Deal room timeline"],
    cta: { label: "Talk to a broker", href: "/contact" },
    featured: true,
  },
  {
    name: "Concierge",
    price: "Custom",
    cadence: "for complex deals",
    description: "For relocations, new builds, and competitive bidding situations.",
    highlights: ["Tour planning", "Off-market sourcing", "Closing support"],
    cta: { label: "Request a quote", href: "/contact" },
    featured: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title={<>Simple, transparent pricing</>}
        description={
          <>
            Start free with instant analysis. Get expert Florida buyer representation at
            no cost until you close.
          </>
        }
        imageSrc="/images/marketing/hero/product-dashboard.png"
        imageAlt="buyer-v2 product dashboard"
        imageClassName="object-top"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={[
                  "group relative overflow-hidden rounded-[24px] border bg-white p-8 transition-all duration-300",
                  tier.featured
                    ? "border-primary-200 shadow-lg"
                    : "border-neutral-200/80 hover:-translate-y-0.5 hover:shadow-lg",
                ].join(" ")}
              >
                {tier.featured ? (
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400 to-primary-700" aria-hidden="true" />
                ) : null}

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-neutral-800">{tier.name}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-500">{tier.description}</p>
                  </div>
                </div>

                <div className="mt-6 flex items-end gap-2">
                  <div className="text-4xl font-semibold tracking-tight text-neutral-800">{tier.price}</div>
                  <div className="pb-1 text-sm text-neutral-500">{tier.cadence}</div>
                </div>

                <ul className="mt-6 space-y-3">
                  {tier.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-3 text-sm text-neutral-600">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary-400" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.cta.href}
                  className={[
                    "mt-8 inline-flex w-full items-center justify-center rounded-[12px] px-4 py-3 text-base font-medium transition-colors duration-[var(--duration-fast)]",
                    tier.featured
                      ? "bg-primary-400 text-white hover:bg-primary-500"
                      : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
                  ].join(" ")}
                >
                  {tier.cta.label}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-12 overflow-hidden rounded-[24px] bg-neutral-50 p-8 md:p-10">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-neutral-800">No pressure, no spam</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Run analysis first. If you want representation, you can talk to a broker on your timeline.
                </p>
              </div>
              <Link
                href="/faq"
                className="inline-flex items-center justify-center rounded-[12px] bg-white px-4 py-3 text-sm font-medium text-primary-700 ring-1 ring-neutral-200/80 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50"
              >
                Read FAQ
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

