import Link from "next/link";
import { PageHeader } from "@/components/marketing/PageHeader";

const roles = [
  {
    title: "Florida Buyer Broker (Contract)",
    location: "Florida",
    description: "Work with buyers, negotiate offers, and run the deal room timeline with AI support.",
  },
  {
    title: "Founding Full-Stack Engineer",
    location: "Remote (US)",
    description: "Own core product surfaces and help ship a PayFit-level marketing + platform experience.",
  },
  {
    title: "Growth & Partnerships",
    location: "Remote (US)",
    description: "Build referral loops, partner with local communities, and drive Florida-first acquisition.",
  },
];

export default function CareersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Careers"
        title={<>Build the premium buyer experience</>}
        description={
          <>
            We’re a small team obsessed with design, speed, and trust. If you want to build a European-grade SaaS experience for Florida buyers, let’s talk.
          </>
        }
        imageSrc="/images/marketing/bento/bento-5.png"
        imageAlt="Document management preview"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Open roles</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
              Join early
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            {roles.map((role) => (
              <div key={role.title} className="rounded-[24px] border border-neutral-200/80 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-semibold text-neutral-800">{role.title}</h3>
                <p className="mt-1 text-sm font-medium text-neutral-400">{role.location}</p>
                <p className="mt-4 text-sm leading-relaxed text-neutral-500">{role.description}</p>
                <Link
                  href="/contact"
                  className="mt-6 inline-flex items-center justify-center rounded-[12px] bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-800 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-200"
                >
                  Apply
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

