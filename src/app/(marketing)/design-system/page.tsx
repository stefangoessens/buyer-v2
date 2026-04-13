import { PageHeader } from "@/components/marketing/PageHeader";
import { BentoCard } from "@/components/marketing/BentoCard";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const colorSwatches = [
  { name: "primary-700", className: "bg-primary-700" },
  { name: "primary-400", className: "bg-primary-400" },
  { name: "neutral-50", className: "bg-neutral-50" },
  { name: "neutral-100", className: "bg-neutral-100" },
  { name: "neutral-200", className: "bg-neutral-200" },
  { name: "neutral-800", className: "bg-neutral-800" },
  { name: "warning-500", className: "bg-warning-500" },
  { name: "success-500", className: "bg-success-500" },
];

export default function DesignSystemPage() {
  return (
    <>
      <PageHeader
        eyebrow="Design system"
        title={<>Tokens and reusable marketing components</>}
        description={<>A living reference page for our PayFit-style tokens and Hosman-style layout primitives.</>}
        imageSrc="/images/marketing/hero/product-dashboard.png"
        imageAlt="buyer-v2 UI"
        imageClassName="object-top"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12">
            <div>
              <h2 className="text-xl font-semibold text-neutral-800">Colors</h2>
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
                {colorSwatches.map((c) => (
                  <div key={c.name} className="rounded-[16px] border border-neutral-200/80 bg-white p-3">
                    <div className={`h-10 rounded-[12px] ${c.className}`} />
                    <div className="mt-2 text-xs font-semibold text-neutral-600">{c.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-neutral-800">Typography</h2>
              <div className="mt-6 rounded-[24px] border border-neutral-200/80 bg-white p-8">
                <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Eyebrow</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
                  H1 display heading (52px)
                </h1>
                <h2 className="mt-6 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
                  H2 section heading (41px)
                </h2>
                <p className="mt-4 text-[18px] leading-[1.5] text-neutral-500">
                  Body lead text (18px). Crisp, calm, and readable like PayFit.
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-neutral-800">UI primitives</h2>
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card className="p-8">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge>Badge</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button>Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                  </div>
                  <div className="mt-6 grid gap-3">
                    <Input placeholder="Input" />
                  </div>
                </Card>

                <div className="rounded-[24px] bg-neutral-50 p-8">
                  <FeatureCard
                    imageSrc="/images/marketing/features/feature-2.png"
                    imageAlt="Feature preview"
                    title="FeatureCard"
                    description="Used throughout marketing pages. Keeps cards crisp and consistent."
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-neutral-800">Marketing components</h2>
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-12">
                <BentoCard
                  src="/images/marketing/bento/bento-1.png"
                  title="BentoCard"
                  description="Reusable bento card with PayFit spacing, 24px radius, and image padding."
                  imageAspectClassName="aspect-[1524/1512]"
                  className="md:col-span-5"
                  sizes="(max-width: 768px) 100vw, 40vw"
                />
                <BentoCard
                  src="/images/marketing/bento/bento-2.png"
                  title="BentoCard (wide)"
                  description="Wide variant: photo-based imagery still preserves card background and rhythm."
                  imageAspectClassName="aspect-[2160/1512]"
                  className="md:col-span-7"
                  sizes="(max-width: 768px) 100vw, 58vw"
                />
              </div>

              <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                <TestimonialCard
                  quote="TestimonialCard keeps social proof aligned with our neutral palette and card radii."
                  author="Example Buyer"
                  role="Orlando"
                />
                <TestimonialCard
                  quote="Consistent spacing and typography makes the whole site feel premium."
                  author="Example Buyer"
                  role="Miami"
                />
                <TestimonialCard
                  quote="Simple components, strong tokens, lots of whitespace."
                  author="Example Buyer"
                  role="Tampa"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

