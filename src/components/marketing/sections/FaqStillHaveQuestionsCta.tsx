"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";

/**
 * Bottom-of-page fallback CTA on /faq. Replaces the generic
 * `FinalCtaSection` per KIN-1085 — the FAQ flow is "answer the
 * question, then route the still-uncertain buyer to a licensed
 * Florida broker", so the CTA points at /contact.
 */
export function FaqStillHaveQuestionsCta() {
  const handleClick = () => {
    track("faq_contact_cta_clicked", {});
  };

  return (
    <section className="relative w-full bg-[#FCFBFF]">
      <div className="mx-auto max-w-[1248px] px-6 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl rounded-3xl bg-white px-8 py-12 text-center shadow-sm ring-1 ring-neutral-200/80 sm:px-12 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-700">
            Need more help?
          </p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-neutral-800 sm:text-4xl">
            Didn&apos;t find what you were looking for?
          </h2>
          <p className="mt-4 text-base text-neutral-500 sm:text-lg">
            Talk to a licensed Florida broker.
          </p>
          <div className="mt-8">
            <Link
              href="/contact"
              onClick={handleClick}
              className="inline-flex items-center justify-center rounded-full bg-primary-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              Talk to a broker
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
