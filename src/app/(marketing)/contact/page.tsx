import { PageHeader } from "@/components/marketing/PageHeader";
import { Input } from "@/components/ui/input";

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={<>Talk to a Florida buyer broker</>}
        description={
          <>
            Have questions about a specific listing or want representation? Send a note and we’ll get back quickly.
          </>
        }
        imageSrc="/images/marketing/bento/bento-6.png"
        imageAlt="Deal room timeline preview"
        imageClassName="object-cover object-left"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="rounded-[24px] border border-neutral-200/80 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold tracking-tight text-neutral-800">Send a message</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Prefer email? Write to{" "}
                <a className="font-medium text-primary-700 underline" href="mailto:hello@buyer-v2.com">
                  hello@buyer-v2.com
                </a>
                .
              </p>

              <form className="mt-6 grid grid-cols-1 gap-5">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-neutral-700">Name</span>
                  <Input placeholder="Your name" className="h-12 rounded-[12px]" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-neutral-700">Email</span>
                  <Input type="email" placeholder="you@example.com" className="h-12 rounded-[12px]" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-neutral-700">Listing link (optional)</span>
                  <Input placeholder="https://www.zillow.com/..." className="h-12 rounded-[12px]" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-neutral-700">Message</span>
                  <textarea
                    className="min-h-[140px] w-full rounded-[12px] border border-input bg-transparent px-3 py-3 text-sm text-neutral-800 shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    placeholder="Tell us what you’re looking for..."
                  />
                </label>

                <button
                  type="button"
                  className="mt-2 inline-flex h-12 items-center justify-center rounded-[12px] bg-primary-400 px-4 text-base font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-primary-500"
                >
                  Send message
                </button>

                <p className="text-xs text-neutral-400">
                  This demo form doesn’t submit yet. Email us and we’ll respond quickly.
                </p>
              </form>
            </div>

            <div className="rounded-[24px] bg-neutral-50 p-8">
              <h3 className="text-lg font-semibold text-neutral-800">What happens next</h3>
              <ul className="mt-4 space-y-3 text-sm text-neutral-600">
                <li>We’ll confirm your goals (timeline, budget, and neighborhoods).</li>
                <li>We’ll run a comp-backed analysis for any listings you send.</li>
                <li>If you want representation, we’ll outline the process and disclosures.</li>
              </ul>

              <div className="mt-8 rounded-[20px] bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-neutral-800">Fastest path</p>
                <p className="mt-2 text-sm text-neutral-500">Paste a listing link and get your analysis instantly.</p>
                <a
                  href="/get-started"
                  className="mt-5 inline-flex items-center justify-center rounded-[12px] bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-800 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-200"
                >
                  Go to Get Started
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

