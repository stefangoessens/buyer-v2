"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_ENTRIES } from "@/content/faq";
import { filterPublic } from "@/lib/content/publicFilter";
import { track } from "@/lib/analytics";

const HOW_IT_WORKS_FAQ_IDS = [
  "how-does-buyer-v2-work",
  "can-i-tour-homes-with-buyer-v2",
  "can-i-still-talk-to-a-real-person",
];

export function HowItWorksFaqTeaserSection() {
  const publicEntries = filterPublic(FAQ_ENTRIES);
  const byId = new Map(publicEntries.map((entry) => [entry.id, entry]));
  const teaserEntries = HOW_IT_WORKS_FAQ_IDS.map((id) => byId.get(id)).filter(
    (entry): entry is (typeof publicEntries)[number] => entry !== undefined
  );

  if (teaserEntries.length === 0) {
    return null;
  }

  const handleSeeAllClick = () => {
    track("faq_teaser_clicked", { source: "how_it_works_page" });
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Common questions
        </p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          How the process actually works
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          The three things buyers ask most about touring, negotiating, and
          getting to the closing table.
        </p>
      </div>

      <div className="mt-14">
        <Accordion type="single" collapsible className="bg-card">
          {teaserEntries.map((entry) => (
            <AccordionItem key={entry.id} value={entry.id}>
              <AccordionTrigger className="px-6 py-5 text-base font-medium">
                {entry.question}
              </AccordionTrigger>
              <AccordionContent className="px-6 text-base leading-relaxed text-muted-foreground">
                {entry.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-10 flex justify-center">
        <Link
          href="/faq#theme-how-it-works"
          onClick={handleSeeAllClick}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          See all questions
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </Link>
      </div>
    </section>
  );
}
