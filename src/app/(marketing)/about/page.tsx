import { PageHeader } from "@/components/marketing/PageHeader";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";

const aboutHighlights = [
  {
    imageSrc: "/images/marketing/features/feature-1.png",
    imageAlt: "Listing link analysis",
    title: "Start with the truth",
    description: "We begin with comps, pricing signals, and risk factors so every decision is grounded in data.",
  },
  {
    imageSrc: "/images/marketing/features/feature-2.png",
    imageAlt: "AI-powered dashboard",
    title: "AI where it matters",
    description: "AI accelerates analysis and documentation, while licensed brokers handle the parts that require judgment.",
  },
  {
    imageSrc: "/images/marketing/features/feature-3.png",
    imageAlt: "Broker representation",
    title: "Florida-first representation",
    description: "We’re built specifically for Florida buyers, with local expertise and compliant brokerage workflows.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title={<>A buyer brokerage built for modern Florida homebuyers</>}
        description={
          <>
            buyer-v2 combines instant AI-powered analysis with licensed Florida representation
            so you can negotiate from a position of strength.
          </>
        }
        imageSrc="/images/marketing/bento/bento-2.png"
        imageAlt="Homebuyer using buyer-v2"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Our approach</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
              PayFit-level polish, Hosman-level flow
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-neutral-500">
              We’re opinionated about design and clarity. The result is a buying experience that feels premium, calm, and fast.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {aboutHighlights.map((h) => (
              <FeatureCard
                key={h.title}
                imageSrc={h.imageSrc}
                imageAlt={h.imageAlt}
                title={h.title}
                description={h.description}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="w-full bg-neutral-50 py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">What buyers say</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
              Clarity beats chaos
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            <TestimonialCard
              quote="I had the analysis within minutes and it changed how we negotiated. It felt like having a strategy team in my pocket."
              author="Tara Williams"
              role="Homebuyer, Fort Lauderdale"
              avatarSrc="/images/marketing/testimonials/testimonial-1.jpg"
            />
            <TestimonialCard
              quote="Our broker was amazing, but the analysis is what gave us confidence to walk away from a bad deal."
              author="Daniel Ruiz"
              role="Homebuyer, Tampa"
            />
            <TestimonialCard
              quote="The deal room timeline was a lifesaver. Everything was organized and I never felt behind."
              author="Alyssa Patel"
              role="Relocating buyer, Orlando"
            />
          </div>
        </div>
      </section>
    </>
  );
}

