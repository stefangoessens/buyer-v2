import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PUBLIC_DISCLOSURES } from "@/content/disclosures";
import { filterPublic } from "@/lib/content/publicFilter";

export function PricingDisclosuresSection() {
  const entries = filterPublic(PUBLIC_DISCLOSURES);

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Legal disclosures
        </p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          The fine print, in plain language
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Every clause below is reviewed by our compliance team and reflects
          how Florida law governs your relationship with buyer-v2.
        </p>
      </div>

      <div className="mt-14">
        <Accordion type="single" collapsible className="bg-card">
          {entries.map((entry) => (
            <AccordionItem key={entry.id} value={entry.id}>
              <AccordionTrigger className="px-6 py-5 text-base font-medium">
                {entry.label}
              </AccordionTrigger>
              <AccordionContent className="px-6 text-sm leading-relaxed text-muted-foreground">
                {entry.body}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
