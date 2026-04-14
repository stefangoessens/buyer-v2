import { FeatureCard } from "@/components/marketing/FeatureCard";

const features = [
  {
    imageSrc: "/images/marketing/features/feature-1.png",
    imageAlt: "Seller pays the buyer-agent commission at closing",
    title: "We're paid by the seller",
    description:
      "Our fee comes out of the buyer-agent commission at closing — the seller funds it, just like it has always worked in Florida. You never write us a check.",
  },
  {
    imageSrc: "/images/marketing/features/feature-2.png",
    imageAlt: "Buyer credit appears on your closing disclosure",
    title: "You keep the rebate",
    description:
      "We return a portion of our commission to you as a buyer credit on the closing disclosure. Less cash out of pocket on day one, more equity from day one.",
  },
  {
    imageSrc: "/images/marketing/features/feature-3.png",
    imageAlt: "No hidden fees or surprise charges",
    title: "No surprise fees",
    description:
      "No sign-up fee, no monthly subscription, no per-showing charges. If a listing has no buyer-agent commission, we'll tell you before you engage.",
  },
];

export function FreeForBuyersSection() {
  return (
    <section className="w-full bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1248px] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
            How it&apos;s free
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
            Three reasons buyers pay zero
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            Florida real estate commissions are paid out of the seller&apos;s
            proceeds. We just pass the savings forward.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {features.map((f) => (
            <FeatureCard
              key={f.title}
              imageSrc={f.imageSrc}
              imageAlt={f.imageAlt}
              title={f.title}
              description={f.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
