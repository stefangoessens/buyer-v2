import { PageHeader } from "@/components/marketing/PageHeader";

const faqs = [
  {
    q: "Is buyer-v2 really free?",
    a: "Yes. You can run instant analysis for free. If you choose representation, we connect you with a licensed Florida buyer broker. Fees (if any) are disclosed up front and depend on your transaction.",
  },
  {
    q: "Which listing sites do you support?",
    a: "Zillow, Redfin, and Realtor.com links work best today. If you have an MLS link or a builder page, paste it anyway and we’ll do our best to extract the details.",
  },
  {
    q: "How fast is the analysis?",
    a: "Most links return a first-pass report in under 5 seconds. Deep comp matching and additional checks can take a bit longer depending on the listing.",
  },
  {
    q: "Do you replace my agent?",
    a: "We’re a buyer brokerage. If you already have a signed exclusive agreement, we’ll respect it. If not, we can represent you and coordinate the full buying process.",
  },
  {
    q: "Do you share my data?",
    a: "No selling. We use your inputs to generate your report and improve the product. See our Privacy Policy for details.",
  },
  {
    q: "Are you licensed in Florida?",
    a: "Yes. Representation is provided by licensed Florida real estate professionals. We keep workflows compliant with Florida law and disclosure requirements.",
  },
  {
    q: "What markets do you cover?",
    a: "Florida statewide. We focus on high-velocity markets where comp-driven negotiation creates meaningful leverage for buyers.",
  },
  {
    q: "How do I get started?",
    a: "Paste a listing link on the Get Started page. You’ll receive an instant report and can request representation if you want an expert to negotiate on your behalf.",
  },
];

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function FaqPage() {
  return (
    <>
      <PageHeader
        eyebrow="FAQ"
        title={<>Answers to common questions</>}
        description={
          <>
            Everything you need to know about how buyer-v2 works, what’s free, and what happens after you paste a link.
          </>
        }
        imageSrc="/images/marketing/bento/bento-1.png"
        imageAlt="Feature preview"
        imageClassName="object-contain p-10"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto grid max-w-3xl gap-4">
            {faqs.map((item) => (
              <details
                key={item.q}
                className="group rounded-[20px] border border-neutral-200/80 bg-white p-6 shadow-sm transition-shadow open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-neutral-800">
                  <span>{item.q}</span>
                  <PlusIcon className="shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-45" />
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-neutral-500">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

