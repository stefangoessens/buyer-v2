"use client";

import { useState } from "react";
import type { FAQEntry } from "@/lib/content/types";
import { groupFAQsByCategory } from "@/lib/content/publicFilter";

const CATEGORY_LABELS: Record<FAQEntry["category"], string> = {
  getting_started: "Getting started",
  pricing: "Pricing",
  process: "Process",
  legal: "Legal",
  technical: "Technical",
};

/**
 * Renders a list of FAQ entries grouped by category with an
 * expandable accordion pattern per entry. Input list should already
 * be filtered to public entries via `filterPublic`.
 */
export function FAQSection({ entries }: { entries: readonly FAQEntry[] }) {
  const groups = groupFAQsByCategory(entries);
  return (
    <div className="space-y-10">
      {groups.map(({ category, entries: bucket }) => (
        <section key={category}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-700">
            {CATEGORY_LABELS[category]}
          </h2>
          <div className="mt-4 divide-y divide-neutral-200 rounded-2xl bg-white ring-1 ring-neutral-200">
            {bucket.map((entry) => (
              <FAQItem key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FAQItem({ entry }: { entry: FAQEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group px-5 py-4 lg:px-6"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center justify-between list-none">
        <span className="pr-4 text-base font-semibold text-neutral-900">
          {entry.question}
        </span>
        <span
          className={`ml-4 flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition-transform ${
            open ? "rotate-45" : ""
          }`}
          aria-hidden
        >
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-neutral-700">
        {entry.answer}
      </p>
    </details>
  );
}
