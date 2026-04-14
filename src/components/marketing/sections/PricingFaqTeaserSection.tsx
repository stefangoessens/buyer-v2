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

const PRICING_FAQ_IDS = [
  "how_much_does_it_cost",
  "how_is_the_rebate_calculated",
  "what_happens_at_closing",
  "what_about_ai_decisions",
];

export function PricingFaqTeaserSection() {
  const publicEntries = filterPublic(FAQ_ENTRIES);
  const byId = new Map(publicEntries.map((entry) => [entry.id, entry]));
  const teaserEntries = PRICING_FAQ_IDS.map((id) => byId.get(id)).filter(
    (entry): entry is (typeof publicEntries)[number] => entry !== undefined
  );

  if (teaserEntries.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Pricing questions, answered
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          The four things buyers ask most about cost, credits, and the closing
          table.
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
          href="/faq"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          See the full FAQ
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
