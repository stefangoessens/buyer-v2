import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FAQEntry, FAQStage } from "@/lib/content/types";

const STAGE_ORDER: readonly FAQStage[] = [
  "pre_offer",
  "making_offer",
  "under_contract",
  "post_close",
] as const;

const STAGE_META: Record<
  FAQStage,
  { eyebrow: string; title: string; description: string }
> = {
  pre_offer: {
    eyebrow: "Stage 1",
    title: "Before you make an offer",
    description:
      "Getting started, understanding our fee model, and how the buyer credit works.",
  },
  making_offer: {
    eyebrow: "Stage 2",
    title: "Making the offer",
    description:
      "How offers get drafted, what AI does, and when a licensed broker steps in.",
  },
  under_contract: {
    eyebrow: "Stage 3",
    title: "Under contract",
    description:
      "Inspections, contingencies, and everything that happens between accepted offer and the closing table.",
  },
  post_close: {
    eyebrow: "Stage 4",
    title: "Closing & after",
    description:
      "How the rebate shows up on your closing disclosure and what happens post-close.",
  },
};

/**
 * Deep-link anchor id for a given FAQ entry. Derived from the entry id
 * so stable URLs like `/faq#what-is-buyer-v2` keep working even if
 * question copy changes.
 */
export function faqAnchorId(entry: Pick<FAQEntry, "id">): string {
  return entry.id.replace(/_/g, "-");
}

interface FaqAccordionSectionProps {
  entries: readonly FAQEntry[];
}

export function FaqAccordionSection({ entries }: FaqAccordionSectionProps) {
  const byStage = new Map<FAQStage, FAQEntry[]>();
  for (const entry of entries) {
    const bucket = byStage.get(entry.stage);
    if (bucket) {
      bucket.push(entry);
    } else {
      byStage.set(entry.stage, [entry]);
    }
  }

  const populatedStages = STAGE_ORDER.filter(
    (stage) => (byStage.get(stage)?.length ?? 0) > 0
  );

  return (
    <section className="relative w-full bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 lg:px-8 lg:py-24">
        <div className="space-y-16">
          {populatedStages.map((stage) => {
            const bucket = byStage.get(stage) ?? [];
            const meta = STAGE_META[stage];
            return (
              <div key={stage} id={`stage-${stage.replace(/_/g, "-")}`}>
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary-700">
                    {meta.eyebrow}
                  </p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                    {meta.title}
                  </h2>
                  <p className="mt-2 text-base text-neutral-500">
                    {meta.description}
                  </p>
                </div>
                <Accordion
                  type="single"
                  collapsible
                  className="bg-white"
                >
                  {bucket.map((entry) => {
                    const anchor = faqAnchorId(entry);
                    return (
                      <AccordionItem
                        key={entry.id}
                        value={entry.id}
                        id={anchor}
                        className="scroll-mt-24"
                      >
                        <AccordionTrigger className="px-6 py-5 text-base font-medium text-neutral-900">
                          {entry.question}
                        </AccordionTrigger>
                        <AccordionContent className="px-6 text-base leading-relaxed text-neutral-600">
                          {entry.answer}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
