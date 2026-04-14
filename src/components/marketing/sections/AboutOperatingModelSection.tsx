import { HugeiconsIcon } from "@hugeicons/react";
import { AiBrain01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AboutOperatingModelContent,
  AboutOperatingPillar,
} from "@/content/about";

interface PillarColumnProps {
  icon: typeof AiBrain01Icon;
  eyebrow: string;
  title: string;
  description: string;
  pillars: AboutOperatingPillar[];
  tone: "ai" | "broker";
}

function PillarColumn({
  icon,
  eyebrow,
  title,
  description,
  pillars,
  tone,
}: PillarColumnProps) {
  const eyebrowClass =
    tone === "ai"
      ? "text-xs font-semibold uppercase tracking-widest text-primary-500"
      : "text-xs font-semibold uppercase tracking-widest text-neutral-500";
  const dotClass =
    tone === "ai"
      ? "mt-2 inline-block size-2 shrink-0 rounded-full bg-primary-400"
      : "mt-2 inline-block size-2 shrink-0 rounded-full bg-neutral-800";
  const iconWrapperClass =
    tone === "ai"
      ? "flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"
      : "flex size-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800";

  return (
    <Card className="h-full border border-neutral-200 bg-white shadow-md">
      <CardHeader className="gap-3 px-8 pt-8">
        <div className={iconWrapperClass}>
          <HugeiconsIcon icon={icon} strokeWidth={1.75} className="size-6" />
        </div>
        <p className={eyebrowClass}>{eyebrow}</p>
        <CardTitle className="font-heading text-2xl tracking-tight text-neutral-800 lg:text-[28px]">
          {title}
        </CardTitle>
        <CardDescription className="text-base leading-relaxed text-neutral-500">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8">
        <ul className="space-y-5">
          {pillars.map((pillar) => (
            <li key={pillar.id} className="flex gap-4">
              <span aria-hidden="true" className={dotClass} />
              <div>
                <p className="text-base font-semibold tracking-tight text-neutral-800">
                  {pillar.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                  {pillar.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AboutOperatingModelSection({
  operatingModel,
}: {
  operatingModel: AboutOperatingModelContent;
}) {
  return (
    <section className="w-full bg-neutral-50 py-20 lg:py-28">
      <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
            {operatingModel.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
            {operatingModel.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            {operatingModel.description}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PillarColumn
            icon={AiBrain01Icon}
            eyebrow="Software side"
            title="Analysis at machine speed"
            description="The platform handles the heavy data work — fast, cited, and reviewable. It never represents you to the other side of a transaction."
            pillars={operatingModel.aiPillars}
            tone="ai"
          />
          <PillarColumn
            icon={UserCheck01Icon}
            eyebrow="Broker side"
            title="Representation by a real human"
            description="A licensed Florida broker reviews every AI output, owns every license-critical action, and stays accountable for your file from offer to close."
            pillars={operatingModel.brokerPillars}
            tone="broker"
          />
        </div>
      </div>
    </section>
  );
}
