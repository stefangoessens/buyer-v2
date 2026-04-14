import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Two-column "who does what" comparison for the /how-it-works page
 * (KIN-1067).
 *
 * License-critical responsibilities live on the broker side. The AI
 * column intentionally stops at *analysis* — it does not draft offers,
 * negotiate compensation, deliver disclosures, or sign contracts.
 * Keeping the split visible on the public site is part of how we
 * communicate the human-in-the-loop guarantee to buyers and to the
 * Florida brokerage that supervises the platform.
 */

interface SplitItem {
  title: string;
  description: string;
}

const aiResponsibilities: SplitItem[] = [
  {
    title: "Listing ingestion",
    description:
      "Normalises any Zillow, Redfin, or Realtor.com URL into a structured Florida property record with photos, taxes, and history.",
  },
  {
    title: "Fair-price analysis",
    description:
      "Runs the pricing engine against Florida comps to produce a fair-price band, every estimate carrying a confidence score and citations.",
  },
  {
    title: "Comparable sales",
    description:
      "Pulls similar nearby sales, makes feature adjustments, and highlights the listings that truly set the local market.",
  },
  {
    title: "Leverage signals",
    description:
      "Surfaces days-on-market, price cuts, seller motivation, and inventory pressure so you walk into negotiation informed.",
  },
  {
    title: "Risk & inspection flags",
    description:
      "Reads disclosures, listing photos, and tax history for surface-level risk indicators before you ever step on the property.",
  },
];

const brokerResponsibilities: SplitItem[] = [
  {
    title: "Reviewing every AI output",
    description:
      "A licensed Florida broker validates the analysis and adds local context before anything is shown as a recommended action.",
  },
  {
    title: "Drafting the offer",
    description:
      "Your broker prepares the FAR/BAR contract, walks you through every clause, and signs as the brokerage of record on your offer.",
  },
  {
    title: "Negotiating compensation",
    description:
      "Broker-to-broker compensation, concession asks, and counter-offer strategy are run by a licensed human — never automated.",
  },
  {
    title: "Disclosure delivery",
    description:
      "Florida-required disclosures are delivered, tracked, and acknowledged by your broker so the file stays compliant end-to-end.",
  },
  {
    title: "Contract signing & fiduciary duty",
    description:
      "All license-critical actions — signing, advising, and representing your interests at closing — sit with a real Florida broker.",
  },
];

interface ColumnProps {
  eyebrow: string;
  title: string;
  description: string;
  items: SplitItem[];
  tone: "ai" | "broker";
}

function SplitColumn({ eyebrow, title, description, items, tone }: ColumnProps) {
  const eyebrowClass =
    tone === "ai"
      ? "text-xs font-semibold uppercase tracking-widest text-primary-500"
      : "text-xs font-semibold uppercase tracking-widest text-neutral-500";

  return (
    <Card className="h-full border border-neutral-200 bg-white shadow-md">
      <CardHeader className="gap-3 px-8 pt-8">
        <p className={eyebrowClass}>{eyebrow}</p>
        <CardTitle className="font-heading text-2xl tracking-tight text-neutral-800 lg:text-3xl">
          {title}
        </CardTitle>
        <CardDescription className="text-base leading-relaxed text-neutral-500">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8">
        <ul className="space-y-5">
          {items.map((item) => (
            <li key={item.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className={
                  tone === "ai"
                    ? "mt-2 inline-block size-2 shrink-0 rounded-full bg-primary-400"
                    : "mt-2 inline-block size-2 shrink-0 rounded-full bg-neutral-800"
                }
              />
              <div>
                <p className="text-base font-semibold tracking-tight text-neutral-800">
                  {item.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AiBrokerSplitSection() {
  return (
    <section className="w-full bg-neutral-50 py-20 lg:py-28">
      <div className="mx-auto max-w-[1248px] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
            Who does what
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
            AI handles the analysis. A licensed broker handles your deal.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            Every license-critical action — drafting offers, negotiating
            compensation, delivering disclosures, signing contracts — is run by
            a real Florida-licensed broker. The AI sits behind the broker, not
            in front of them.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SplitColumn
            eyebrow="AI handles"
            title="Analysis, not advice"
            description="The platform does the heavy data work — fast, cited, and reviewable. It never represents you to the other side of a transaction."
            items={aiResponsibilities}
            tone="ai"
          />
          <SplitColumn
            eyebrow="Licensed broker handles"
            title="Representation & fiduciary duty"
            description="A real Florida broker reviews every AI output, owns every license-critical action, and stays accountable for your file from offer to close."
            items={brokerResponsibilities}
            tone="broker"
          />
        </div>
      </div>
    </section>
  );
}
