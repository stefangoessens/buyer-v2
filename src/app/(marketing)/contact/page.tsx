import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { PageHeader } from "@/components/marketing/PageHeader";
import { ContactForm } from "@/components/marketing/ContactForm";

export default async function ContactPage() {
  const supportEmail = await fetchQuery(api.publicSiteSettings.getSupportEmail);

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={<>Talk to a Florida buyer broker</>}
        description={
          <>
            Have questions about a specific listing or want representation? Send
            a note and we’ll get back quickly.
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
              <h2 className="text-xl font-semibold tracking-tight text-neutral-800">
                Send a message
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Prefer email? Write to{" "}
                <a
                  className="font-medium text-primary-700 underline"
                  href={`mailto:${supportEmail}`}
                >
                  {supportEmail}
                </a>
                .
              </p>

              <ContactForm sourcePath="/contact" />
            </div>

            <div className="rounded-[24px] bg-neutral-50 p-8">
              <h3 className="text-lg font-semibold text-neutral-800">
                What happens next
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-neutral-600">
                <li>We’ll confirm your goals (timeline, budget, and neighborhoods).</li>
                <li>We’ll run a comp-backed analysis for any listings you send.</li>
                <li>If you want representation, we’ll outline the process and disclosures.</li>
              </ul>

              <div className="mt-8 rounded-[20px] bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-neutral-800">
                  Fastest path
                </p>
                <p className="mt-2 text-sm text-neutral-500">
                  Paste a listing link and get your analysis instantly.
                </p>
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
