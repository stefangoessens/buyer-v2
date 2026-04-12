import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/marketing/PageHeader";

const posts = [
  {
    title: "How to spot overpricing in Florida (fast)",
    date: "Apr 2026",
    excerpt: "A practical framework for using comps, DOM, and seller incentives to avoid overpaying.",
    imageSrc: "/images/marketing/bento/bento-4.png",
  },
  {
    title: "Negotiation leverage: what actually moves sellers",
    date: "Apr 2026",
    excerpt: "The concessions and timing tactics that work in competitive markets, backed by data signals.",
    imageSrc: "/images/marketing/bento/bento-1.png",
  },
  {
    title: "Deal room timelines: reduce stress, close faster",
    date: "Apr 2026",
    excerpt: "A simple checklist and timeline that keeps everyone aligned from offer to closing.",
    imageSrc: "/images/marketing/bento/bento-6.png",
  },
];

export default function BlogPage() {
  return (
    <>
      <PageHeader
        eyebrow="Blog"
        title={<>Insights for Florida buyers</>}
        description={<>Short, tactical posts on pricing, negotiation, and closing with confidence.</>}
        imageSrc="/images/marketing/hero/product-dashboard.png"
        imageAlt="buyer-v2 dashboard"
        imageClassName="object-top"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {posts.map((post) => (
              <article key={post.title} className="overflow-hidden rounded-[24px] border border-neutral-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative aspect-[16/10] bg-neutral-50">
                  <Image src={post.imageSrc} alt="" fill className="object-contain p-10" sizes="(max-width: 768px) 100vw, 33vw" />
                </div>
                <div className="p-8">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">{post.date}</p>
                  <h2 className="mt-3 text-lg font-semibold tracking-tight text-neutral-800">{post.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-500">{post.excerpt}</p>
                  <Link href="/contact" className="mt-6 inline-flex text-sm font-semibold text-primary-700 underline">
                    Read more
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

