const services = [
  {
    title: "AI deal room",
    description:
      "Tasks, timeline, and document storage that keep every deal organized from offer to close.",
  },
  {
    title: "Fair-price analysis",
    description:
      "Instant AI pricing grounded in local comparable sales, with a confidence score and citations.",
  },
  {
    title: "Comparable sales",
    description:
      "Automated comp pulls, feature adjustments, and the listings that truly set the market.",
  },
  {
    title: "Negotiation playbook",
    description:
      "Concrete concession asks, counter-offer ladders, and timing advantages for every situation.",
  },
  {
    title: "Licensed broker rep",
    description:
      "A real Florida-licensed broker on your side for disclosures, offers, and fiduciary duties.",
  },
  {
    title: "Showing dispatch",
    description:
      "We schedule and dispatch a showing agent for in-person tours whenever you need one.",
  },
  {
    title: "Contract review",
    description:
      "Every clause reviewed against the Florida FAR/BAR contract and your specific deal terms.",
  },
  {
    title: "Closing coordinator",
    description:
      "One human point of contact who runs deadlines, title, lender, and closing-day logistics.",
  },
];

function CheckIcon() {
  return (
    <svg
      className="size-5 shrink-0 text-primary-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export function IncludedServicesSection() {
  return (
    <section className="w-full bg-neutral-50 py-20 lg:py-28">
      <div className="mx-auto max-w-[1248px] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
            What&apos;s included
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
            Every buyer gets the full platform
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            No tiers. No upsells. One fee structure, one experience, every
            buyer. Here&apos;s what you get end-to-end.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <div
              key={s.title}
              className="rounded-[20px] border border-neutral-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-primary-50">
                <CheckIcon />
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-neutral-800">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
